/**
 * Google OAuth2: sign-in (openid email profile) and per-user Gmail access (gmail.send + gmail.readonly).
 * One OAuth "Web application" client serves both. Never log tokens, auth codes or the client secret.
 */
import { google } from "googleapis";
import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";

export const LOGIN_SCOPES = ["openid", "email", "profile"];
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

export function googleClient(redirectUri: string): OAuth2Client {
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);
}

// ---------------------------------------------------------------------------------------------
// Sign in with Google

export function createLoginAuthUrl(state: string): string {
  return googleClient(env.LOGIN_REDIRECT_URI).generateAuthUrl({
    scope: LOGIN_SCOPES,
    state,
    prompt: "select_account",
    include_granted_scopes: true,
  });
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

/** Verify an id_token (signature, issuer, expiry, audience = our client id). Requires a verified email. */
export async function verifyIdToken(client: OAuth2Client, idToken: string): Promise<GoogleIdentity> {
  const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email) throw new Error("id_token has no subject/email");
  if (p.email_verified !== true) throw new Error("Google email is not verified");
  return { sub: p.sub, email: p.email.toLowerCase(), name: p.name ?? null, picture: p.picture ?? null };
}

/** Exchange the login code and return the verified Google identity. */
export async function exchangeLoginCode(code: string): Promise<GoogleIdentity> {
  const client = googleClient(env.LOGIN_REDIRECT_URI);
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) throw new Error("Google returned no id_token");
  return verifyIdToken(client, tokens.id_token);
}

// ---------------------------------------------------------------------------------------------
// Per-user Gmail

export function createGmailAuthUrl(state: string, loginHint: string): string {
  return googleClient(env.GMAIL_REDIRECT_URI).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    include_granted_scopes: true,
    login_hint: loginHint,
    state,
  });
}

/** Exchange the Gmail auth code and upsert the user's GmailAccount. Returns the Gmail address. */
export async function handleGmailCallback(userId: string, code: string): Promise<string> {
  const client = googleClient(env.GMAIL_REDIRECT_URI);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const scopes = new Set((tokens.scope ?? "").split(/\s+/).filter(Boolean));
  if (!scopes.has(GMAIL_SCOPES[0]!) || !scopes.has(GMAIL_SCOPES[1]!)) {
    throw new Error("Gmail permissions were not granted");
  }

  let email: string | null = null;
  if (tokens.id_token) {
    try {
      email = (await verifyIdToken(client, tokens.id_token)).email;
    } catch {
      email = null;
    }
  }
  if (!email) {
    const profile = await google.gmail({ version: "v1", auth: client }).users.getProfile({ userId: "me" });
    email = profile.data.emailAddress?.toLowerCase() ?? null;
  }
  if (!email) throw new Error("Could not determine the Gmail account address");

  const existing = await prisma.gmailAccount.findUnique({ where: { userId } });
  // Google may omit refresh_token on re-consent; keep the old one only if it is the same account.
  const refreshToken =
    tokens.refresh_token ?? (existing?.authType === "OAUTH" && existing.email === email ? existing.refreshToken : null);
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
    where: { userId },
    update: { ...data, connectedAt: new Date() },
    create: { userId, ...data },
  });
  return email;
}

export async function getGmailAccount(userId: string) {
  return prisma.gmailAccount.findUnique({ where: { userId } });
}

/**
 * Authorised OAuth2 client for the user's connected account, or null when not connected/configured.
 * Refreshed tokens are persisted via the client's 'tokens' event.
 */
export async function getAuthorizedClient(userId: string): Promise<{ client: OAuth2Client; email: string } | null> {
  if (!isGoogleConfigured()) return null;
  const account = await getGmailAccount(userId);
  if (!account || account.authType !== "OAUTH" || !account.refreshToken) return null;
  const client = googleClient(env.GMAIL_REDIRECT_URI);
  client.setCredentials({
    refresh_token: account.refreshToken,
    access_token: account.accessToken ?? null,
    expiry_date: account.expiryDate ? account.expiryDate.getTime() : null,
  });
  const accountId = account.id;
  client.on("tokens", (t) => {
    const update: { accessToken?: string; expiryDate?: Date | null; refreshToken?: string } = {};
    if (t.access_token) update.accessToken = t.access_token;
    if (t.expiry_date !== undefined) update.expiryDate = t.expiry_date ? new Date(t.expiry_date) : null;
    if (t.refresh_token) update.refreshToken = t.refresh_token;
    if (Object.keys(update).length === 0) return;
    prisma.gmailAccount
      .updateMany({ where: { id: accountId, userId }, data: update })
      .catch(() => console.error("[gmail] failed to persist a refreshed token"));
  });
  return { client, email: account.email };
}

/** Delete the user's account; best-effort revoke of the refresh token. */
export async function disconnectGmail(userId: string): Promise<void> {
  const account = await getGmailAccount(userId);
  // App-password accounts have nothing to revoke (the user deletes the app password in their Google account).
  if (account?.authType === "OAUTH" && account.refreshToken && isGoogleConfigured()) {
    try {
      await googleClient(env.GMAIL_REDIRECT_URI).revokeToken(account.refreshToken);
    } catch {
      console.warn("[gmail] token revoke failed (ignored)");
    }
  }
  await prisma.gmailAccount.deleteMany({ where: { userId } });
}
