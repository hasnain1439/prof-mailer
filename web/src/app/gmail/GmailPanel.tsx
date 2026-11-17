"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import type { GmailStatus } from "@/lib/types";
import { useAuth } from "@/components/Auth";
import { useGmailStatus } from "@/components/GmailStatus";
import { IconExternal, IconRefresh, IconSend } from "@/components/icons";
import { DryRunPill } from "@/components/SendingFrom";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Mono, Notice, PageHeader, link } from "@/components/ui";

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-sm border border-border bg-bg px-1 py-px font-mono text-[0.85em] text-text">{children}</code>;
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
  return <Badge className="border border-border bg-surface text-muted">App Password</Badge>;
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
      title="Connect your Gmail"
      description="prof-mailer sends from your Gmail with a Google App Password, and checks the same inbox for replies. It takes about two minutes."
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
          <Field label="App Password" htmlFor="ap-password" hint="16 letters. Spaces are fine.">
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
              {busy ? "Verifying with Gmail…" : "Connect Gmail"}
            </Button>
            {busy && <span className="text-xs text-muted">This can take up to 30 seconds. No email is sent.</span>}
          </div>
        </form>

        <div className="order-first space-y-3 text-[13px] text-muted lg:order-last lg:border-l lg:border-border lg:pl-6">
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
            <li>Paste the 16-letter password here and click Connect Gmail.</li>
          </ol>
          <ul className="list-disc space-y-1 border-t border-border pt-3 pl-5 text-xs">
            <li>Your normal Gmail password won&apos;t work; it must be an App Password.</li>
            <li>Google Workspace (university or company) admins may disable App Passwords for their accounts.</li>
            <li>The App Password is stored encrypted, and you can disconnect at any time.</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

function ConnectedCard({
  data,
  userEmail,
  busy,
  switching,
  onToggleSwitch,
  onDisconnect,
  onTestSend,
}: {
  data: GmailStatus;
  userEmail: string | null;
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
        <Button variant="primary" onClick={onTestSend} disabled={busy}>
          <IconSend />
          {busy ? "Working…" : `Send a test email to ${userEmail ?? "yourself"}`}
        </Button>
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
  const toast = useToast();

  const { data, error, loading, reload } = useGmailStatus();
  const { user } = useAuth();
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
                userEmail={user?.email ?? null}
                busy={busy}
                switching={switching}
                onToggleSwitch={() => setSwitching((v) => !v)}
                onDisconnect={disconnect}
                onTestSend={testSend}
              />
            ) : (
              <Notice tone="warning" title="No Gmail account connected">
                Connect the Gmail account you&apos;ll send from with an App Password. Scheduled emails can&apos;t go out until you do.
              </Notice>
            )}

            {showOptions && (
              <>
                {data.connected && (
                  <Notice tone="info">Connecting another account replaces the current connection ({data.email ?? "current account"}).</Notice>
                )}
                <AppPasswordCard onConnected={onConnected} />
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
                <StatusRow name={<Mono className="!text-xs">DRY_RUN</Mono>}>
                  {data.dryRun ? <Badge tone="replied">On: logged only</Badge> : <Badge tone="sent">Off: real sends</Badge>}
                </StatusRow>
              </dl>
            </Card>
            {data.dryRun && (
              <Notice tone="warning" title="Dry run is on">
                Emails are only logged, never sent. Dry run is a server setting controlled by the app owner.
              </Notice>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
