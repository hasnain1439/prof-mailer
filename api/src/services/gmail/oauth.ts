/**
 * Google OAuth2 for the single connected Gmail account (GmailAccount id = 1).
 * Never log tokens, auth codes or the client secret.
 */
import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid",
  "email",
];

export type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export function isGoogleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function newClient(): OAuth2Client {
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

// ---- state (CSRF) kept in memory with a short TTL ----
const STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map<string, number>(); // state -> expiresAt

function pruneStates(now = Date.now()) {
  for (const [s, exp] of pendingStates) if (exp <= now) pendingStates.delete(s);
}

/** Consent-screen URL with a fresh one-time state. */
export function createAuthUrl(): string {
  pruneStates();
  const state = randomBytes(24).toString("hex");
  pendingStates.set(state, Date.now() + STATE_TTL_MS);
  return newClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    include_granted_scopes: true,
    state,
  });
}

/** One-time check: valid, unexpired state is consumed. */
export function consumeState(state: unknown): boolean {
  pruneStates();
  if (typeof state !== "string" || !pendingStates.has(state)) return false;
  pendingStates.delete(state);
  return true;
}

/** Email from an id_token payload (token came straight from Google's token endpoint over TLS). */
function emailFromIdToken(idToken: string | null | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      email?: unknown;
    };
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Exchange the auth code, resolve the account email and upsert GmailAccount id=1. Returns the email. */
export async function handleOAuthCallback(code: string): Promise<string> {
  const client = newClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  let email = emailFromIdToken(tokens.id_token);
  if (!email) {
    const profile = await google.gmail({ version: "v1", auth: client }).users.getProfile({ userId: "me" });
    email = profile.data.emailAddress?.toLowerCase() ?? null;
  }
  if (!email) throw new Error("Could not determine the Gmail account address");

  const existing = await prisma.gmailAccount.findUnique({ where: { id: 1 } });
  // Google may omit refresh_token on re-consent; keep the old one in that case.
  const refreshToken = tokens.refresh_token ?? existing?.refreshToken;
  if (!refreshToken) throw new Error("Google did not return a refresh token");

  const data = {
    email,
    authType: "OAUTH" as const,
    appPasswordEnc: null,
    refreshToken,
    accessToken: tokens.access_token ?? null,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
  await prisma.gmailAccount.upsert({
    where: { id: 1 },
    update: { ...data, connectedAt: new Date() },
    create: { id: 1, ...data },
  });
  return email;
}

export async function getGmailAccount() {
  return prisma.gmailAccount.findUnique({ where: { id: 1 } });
}

/**
 * Authorised OAuth2 client for the connected account, or null when not connected/configured.
 * Refreshed tokens are persisted via the client's 'tokens' event.
 */
export async function getAuthorizedClient(): Promise<{ client: OAuth2Client; email: string } | null> {
  if (!isGoogleConfigured()) return null;
  const account = await getGmailAccount();
  if (!account || account.authType !== "OAUTH" || !account.refreshToken) return null;
  const client = newClient();
  client.setCredentials({
    refresh_token: account.refreshToken,
    access_token: account.accessToken ?? null,
    expiry_date: account.expiryDate ? account.expiryDate.getTime() : null,
  });
  client.on("tokens", (t) => {
    const update: { accessToken?: string; expiryDate?: Date | null; refreshToken?: string } = {};
    if (t.access_token) update.accessToken = t.access_token;
    if (t.expiry_date !== undefined) update.expiryDate = t.expiry_date ? new Date(t.expiry_date) : null;
    if (t.refresh_token) update.refreshToken = t.refresh_token;
    if (Object.keys(update).length === 0) return;
    prisma.gmailAccount
      .updateMany({ where: { id: 1 }, data: update })
      .catch((err: unknown) => console.error("[gmail] failed to persist refreshed token:", (err as Error).message));
  });
  return { client, email: account.email };
}

/** Delete the account; best-effort revoke of the refresh token. */
export async function disconnectGmail(): Promise<void> {
  const account = await getGmailAccount();
  // App-password accounts have nothing to revoke (the user deletes the app password in their Google account).
  if (account?.authType === "OAUTH" && account.refreshToken && isGoogleConfigured()) {
    try {
      await newClient().revokeToken(account.refreshToken);
    } catch {
      console.warn("[gmail] token revoke failed (ignored)");
    }
  }
  await prisma.gmailAccount.deleteMany({ where: { id: 1 } });
}
