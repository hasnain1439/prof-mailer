"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { API_URL, api, errorMessage } from "@/lib/api";
import type { GmailStatus } from "@/lib/types";
import { useGmailStatus } from "@/components/GmailStatus";
import { IconCheck, IconCopy, IconExternal, IconRefresh, IconSend } from "@/components/icons";
import { DryRunPill } from "@/components/SendingFrom";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Mono, Notice, PageHeader, btnPrimary, btnSecondary, btnSmall, link } from "@/components/ui";

const DEFAULT_REDIRECT = "http://localhost:4000/api/gmail/callback";

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-sm border border-border bg-bg px-1 py-px font-mono text-[0.85em] text-text">{children}</code>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/** Plain numbered step: mono number, title, body. */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="w-5 shrink-0 pt-px text-right font-mono text-[13px] text-muted">{n}.</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-text">{title}</p>
        <div className="mt-1 space-y-2 text-[13px] text-muted">{children}</div>
      </div>
    </li>
  );
}

function SetupGuide({ configured, onRecheck }: { configured: boolean; onRecheck: () => void }) {
  const likelyRedirect = `${API_URL}/gmail/callback`;
  const differs = likelyRedirect !== DEFAULT_REDIRECT;
  return (
    <ol className="space-y-4">
      <Step n={1} title="Create a Google Cloud project">
        <p>
          Open the{" "}
          <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer" className={link}>
            Google Cloud console <IconExternal size={12} className="inline" />
          </a>{" "}
          and create a new project (any name, e.g. “prof-mailer”).
        </p>
      </Step>
      <Step n={2} title="Enable the Gmail API">
        <p>
          In <em>APIs &amp; Services → Library</em>, search for <strong className="text-text">Gmail API</strong> and click{" "}
          <strong className="text-text">Enable</strong>.
        </p>
      </Step>
      <Step n={3} title="Configure the OAuth consent screen">
        <p>
          In <em>APIs &amp; Services → OAuth consent screen</em>, choose <strong className="text-text">External</strong>, fill in the app name and
          your email, and under <strong className="text-text">Test users</strong> add the Gmail address you&apos;ll send from. (While the app is in
          “Testing”, only test users can connect.)
        </p>
      </Step>
      <Step n={4} title="Create a Web OAuth client">
        <p>
          In <em>Credentials → Create credentials → OAuth client ID</em>, pick <strong className="text-text">Web application</strong> and add
          this <strong className="text-text">Authorized redirect URI</strong>:
        </p>
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg px-3 py-1.5">
          <code className="min-w-0 flex-1 font-mono text-xs break-all text-text">{DEFAULT_REDIRECT}</code>
          <CopyButton text={DEFAULT_REDIRECT} />
        </div>
        <p className="text-xs">
          If you run the API on another port or host, the redirect URI must exactly match <Code>GOOGLE_REDIRECT_URI</Code> in{" "}
          <Code>api/.env</Code>.
          {differs && (
            <>
              {" "}
              This web app talks to the API at <Code>{API_URL}</Code>, so you probably want <Code>{likelyRedirect}</Code> in both places.
            </>
          )}
        </p>
      </Step>
      <Step n={5} title="Add the credentials to api/.env">
        <pre className="overflow-x-auto rounded-md border border-border bg-bg p-3 font-mono text-xs leading-relaxed text-text">
          {`GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxxxxx
# only if not ${DEFAULT_REDIRECT}:
GOOGLE_REDIRECT_URI=${differs ? likelyRedirect : DEFAULT_REDIRECT}
# where "Send test email" goes:
TEST_RECIPIENT=you@example.com`}
        </pre>
      </Step>
      <Step n={6} title="Restart the API">
        <p>Stop and start the API server so it picks up the new environment variables.</p>
        {!configured && (
          <Button size="sm" onClick={onRecheck}>
            <IconRefresh size={14} />
            Check again
          </Button>
        )}
      </Step>
      <Step n={7} title="Connect your Gmail account">
        <p>Click Connect Gmail and sign in with the test-user account. You&apos;ll be redirected back here.</p>
        {configured ? (
          <a href={api.gmailConnectUrl} className={`${btnPrimary} ${btnSmall}`}>
            Connect Gmail
          </a>
        ) : (
          <Button size="sm" variant="primary" disabled title="Finish steps 1–6 first">
            Connect Gmail
          </Button>
        )}
      </Step>
    </ol>
  );
}

function StatusRow({ name, children }: { name: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-[13px]">
      <dt className="shrink-0 text-muted">{name}</dt>
      <dd className="min-w-0 text-right text-text">{children}</dd>
    </div>
  );
}

function YesNo({ ok, yes = "Yes", no = "No" }: { ok: boolean; yes?: string; no?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${ok ? "text-sent-fg" : "text-muted"}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-sent-fg" : "bg-border"}`} />
      {ok ? yes : no}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function AuthTypeBadge({ authType }: { authType: GmailStatus["authType"] }) {
  if (!authType) return null;
  return <Badge className="border border-border bg-surface text-muted">{authType === "APP_PASSWORD" ? "App password" : "Google OAuth"}</Badge>;
}

function AppPasswordCard({ onConnected }: { onConnected: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.connectAppPassword({ email: email.trim(), appPassword: password.trim() });
      toast(`Gmail connected: sending from ${res.email}.`);
      onConnected();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPassword(""); // never keep the secret around after a response
      setBusy(false);
    }
  }

  return (
    <Card
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          Option A: Gmail with an app password
          <Badge tone="sent">Recommended</Badge>
        </span>
      }
      description="Takes about two minutes. Sends over SMTP and checks replies over IMAP."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form onSubmit={submit} className="space-y-3" autoComplete="off">
          <Field label="Gmail address" htmlFor="ap-email">
            <Input
              id="ap-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@gmail.com"
              className="font-mono"
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="App password" htmlFor="ap-password">
            <Input
              id="ap-password"
              type="password"
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="abcd efgh ijkl mnop"
              className="font-mono tracking-wider"
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && (
            <Notice tone="error" className="">
              {error}
            </Notice>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={busy || !email.trim() || !password.trim()}>
              {busy && <Spinner />}
              {busy ? "Verifying with Gmail…" : "Connect"}
            </Button>
            {busy && <span className="text-xs text-muted">This can take up to 30 seconds. No email is sent.</span>}
          </div>
        </form>

        <div className="space-y-3 text-[13px] text-muted lg:border-l lg:border-border lg:pl-6">
          <ol className="list-decimal space-y-1.5 pl-5 marker:font-mono marker:text-muted">
            <li>
              Turn on <strong className="font-medium text-text">2-Step Verification</strong> at{" "}
              <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className={link}>
                myaccount.google.com/security <IconExternal size={12} className="inline" />
              </a>
              .
            </li>
            <li>
              Open{" "}
              <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className={link}>
                myaccount.google.com/apppasswords <IconExternal size={12} className="inline" />
              </a>{" "}
              and create one named <Code>prof-mailer</Code>.
            </li>
            <li>Paste the 16-letter password here and click Connect.</li>
          </ol>
          <ul className="list-disc space-y-1 border-t border-border pt-3 pl-5 text-xs">
            <li>Your normal Gmail password won&apos;t work; it must be an app password.</li>
            <li>Google Workspace (university/company) accounts may have app passwords disabled by the admin.</li>
            <li>The password is stored encrypted on your own server.</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

function OAuthOption({ data, onRecheck }: { data: GmailStatus; onRecheck: () => void }) {
  return (
    <details className="group mb-4 rounded-md border border-border bg-surface">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-2.5 select-none hover:bg-bg">
        <span className="text-sm font-semibold text-text">Option B: Sign in with Google (OAuth)</span>
        <span className="text-xs text-muted">{data.oauthConfigured ? "Google OAuth client is configured" : "Requires Google Cloud setup, about 10 minutes"}</span>
        <span className="ml-auto text-xs text-muted group-open:hidden">Show</span>
        <span className="ml-auto hidden text-xs text-muted group-open:inline">Hide</span>
      </summary>
      <div className="border-t border-border p-4">
        {data.oauthConfigured ? (
          <div className="flex flex-wrap items-center gap-4">
            <p className="min-w-0 flex-1 text-[13px] text-muted">
              Sign in with the Google account you added as a test user on the OAuth consent screen. You&apos;ll be redirected back here.
            </p>
            <a href={api.gmailConnectUrl} className={btnSecondary}>
              Connect with Google
            </a>
          </div>
        ) : (
          <SetupGuide configured={data.oauthConfigured} onRecheck={onRecheck} />
        )}
      </div>
    </details>
  );
}

function ConnectedCard({
  data,
  busy,
  switching,
  onToggleSwitch,
  onDisconnect,
  onTestSend,
}: {
  data: GmailStatus;
  busy: boolean;
  switching: boolean;
  onToggleSwitch: () => void;
  onDisconnect: () => void;
  onTestSend: () => void;
}) {
  return (
    <section className="mb-4 rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">Sending from</p>
          <p className="truncate font-mono text-[15px] font-medium text-text">{data.email ?? "Connected account"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="sent">Connected</Badge>
          <AuthTypeBadge authType={data.authType} />
          {data.dryRun && <DryRunPill />}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        {data.testRecipientSet ? (
          <Button variant="primary" onClick={onTestSend} disabled={busy}>
            <IconSend />
            {busy ? "Working…" : "Send test email to TEST_RECIPIENT"}
          </Button>
        ) : (
          <span className="text-xs text-muted">
            Set <Code>TEST_RECIPIENT</Code> in <Code>api/.env</Code> to enable the test-send button.
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <Button onClick={onToggleSwitch} aria-expanded={switching}>
            {switching ? "Cancel switch" : "Switch account"}
          </Button>
          <Button variant="danger" onClick={onDisconnect} disabled={busy}>
            Disconnect
          </Button>
        </div>
      </div>
    </section>
  );
}

function HowItWorks({ data }: { data: GmailStatus }) {
  return (
    <Card title="How sending works">
      <ul className="list-disc space-y-2 pl-5 text-[13px] text-muted marker:text-border">
        <li>
          <strong className="font-medium text-text">Every email goes out from this one account</strong>
          {data.email ? (
            <>
              {" "}
              (<Mono className="text-text">{data.email}</Mono>)
            </>
          ) : null}
          : initial emails and follow-ups alike, and they appear in its Sent folder.
        </li>
        <li>
          <strong className="font-medium text-text">Replies are read from the same inbox.</strong> When a professor replies in the thread, the email
          is marked replied and further follow-ups stop.
        </li>
        <li>
          To use a different address, click <em>Switch account</em>. Connecting again replaces the current connection.
        </li>
      </ul>
    </Card>
  );
}

export function GmailPanel() {
  const params = useSearchParams();
  const connectedParam = params.get("connected") === "1";
  const errorParam = params.get("error");
  const toast = useToast();

  const { data, error, loading, reload } = useGmailStatus();
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function disconnect() {
    if (!window.confirm("Disconnect Gmail? Scheduled emails will fail to send until you reconnect.")) return;
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      await api.gmailDisconnect();
      toast("Gmail disconnected.");
      setSwitching(false);
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function testSend() {
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      const res = await api.gmailTestSend();
      const msg = res.dryRun ? `DRY RUN: test email to ${res.to} was logged, not sent.` : `Test email sent to ${res.to}.`;
      setMessage(msg);
      toast(msg, res.dryRun ? "info" : "success");
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function onConnected() {
    setSwitching(false);
    setMessage(null);
    reload(); // shared status: also refreshes the sidebar card
  }

  const showOptions = !!data && (!data.connected || switching);

  return (
    <div>
      <PageHeader title="Gmail account" description="The Gmail account every email is sent from, and whose inbox is checked for replies.">
        <Button onClick={reload} disabled={loading}>
          <IconRefresh className={loading ? "animate-spin" : undefined} />
          Refresh
        </Button>
      </PageHeader>

      {connectedParam && <Notice tone="success">Gmail connected successfully.</Notice>}
      {errorParam && <ErrorBox error={`Gmail connection failed: ${errorParam}`} />}
      {error && !data && (
        <Notice
          tone="error"
          title="API offline"
          action={
            <Button size="sm" onClick={reload}>
              Retry
            </Button>
          }
        >
          {error}
        </Notice>
      )}
      {error && data && <ErrorBox error={error} onRetry={reload} />}
      <ErrorBox error={actionError} />
      {message && (
        <Notice tone={message.startsWith("DRY RUN") ? "info" : "success"} onDismiss={() => setMessage(null)}>
          {message}
        </Notice>
      )}

      {loading && !data && <Loading rows={3} />}

      {data && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            {data.connected ? (
              <ConnectedCard
                data={data}
                busy={busy}
                switching={switching}
                onToggleSwitch={() => setSwitching((v) => !v)}
                onDisconnect={disconnect}
                onTestSend={testSend}
              />
            ) : (
              <Notice tone="warning" title="No Gmail account connected">
                Connect the Gmail account you&apos;ll send from. Option A takes about two minutes.
              </Notice>
            )}

            {showOptions && (
              <>
                {data.connected && (
                  <Notice tone="info">Connecting another account replaces the current connection ({data.email ?? "current account"}).</Notice>
                )}
                <AppPasswordCard onConnected={onConnected} />
                <OAuthOption data={data} onRecheck={reload} />
              </>
            )}

            {data.connected && <HowItWorks data={data} />}
          </div>

          <div>
            <Card title="Status">
              <dl className="-my-2 divide-y divide-border">
                <StatusRow name="Account connected">
                  <YesNo ok={data.connected} />
                </StatusRow>
                <StatusRow name="Account">
                  <Mono className="break-all">{data.email ?? "—"}</Mono>
                </StatusRow>
                <StatusRow name="Connected via">{data.authType ? <AuthTypeBadge authType={data.authType} /> : "—"}</StatusRow>
                <StatusRow name="OAuth client configured">
                  <YesNo ok={data.oauthConfigured} />
                </StatusRow>
                <StatusRow name={<Mono className="!text-xs">DRY_RUN</Mono>}>
                  {data.dryRun ? <Badge tone="replied">On: logged only</Badge> : <Badge tone="sent">Off: real sends</Badge>}
                </StatusRow>
                <StatusRow name="Test recipient set">
                  <YesNo ok={data.testRecipientSet} />
                </StatusRow>
              </dl>
            </Card>
            {data.dryRun && (
              <Notice tone="warning" title="Dry run is on">
                Emails are only logged, never sent. Set <Code>DRY_RUN=false</Code> in <Code>api/.env</Code> and restart the API to send for real.
              </Notice>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
