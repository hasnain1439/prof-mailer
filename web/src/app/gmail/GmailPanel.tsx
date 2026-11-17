"use client";

import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { API_URL, api, errorMessage } from "@/lib/api";
import type { GmailStatus } from "@/lib/types";
import { useGmailStatus } from "@/components/GmailStatus";
import { IconCheck, IconCopy, IconExternal, IconInbox, IconMail, IconRefresh, IconSend } from "@/components/icons";
import { DryRunPill } from "@/components/SendingFrom";
import { useToast } from "@/components/Toast";
import { Card, ErrorBox, Notice, PageHeader, Skeleton, btnDanger, btnPrimary, btnSecondary, btnSmall, link } from "@/components/ui";

const DEFAULT_REDIRECT = "http://localhost:4000/api/gmail/callback";

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[0.8em] text-fg">{children}</code>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`${btnSecondary} ${btnSmall}`}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Step({ n, title, children, last }: { n: number; title: string; children: ReactNode; last?: boolean }) {
  return (
    <li className={`relative flex gap-4 ${last ? "" : "pb-6"}`}>
      {!last && <span aria-hidden="true" className="absolute top-8 bottom-1 left-[13.5px] w-px bg-line-strong" />}
      <span className="z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-text ring-1 ring-primary-line">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-semibold text-fg">{title}</p>
        <div className="mt-1 space-y-2 text-sm text-fg-2">{children}</div>
      </div>
    </li>
  );
}

function SetupGuide({ configured, onRecheck }: { configured: boolean; onRecheck: () => void }) {
  const likelyRedirect = `${API_URL}/gmail/callback`;
  const differs = likelyRedirect !== DEFAULT_REDIRECT;
  return (
    <ol>
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
          In <em>APIs &amp; Services → Library</em>, search for <strong>Gmail API</strong> and click <strong>Enable</strong>.
        </p>
      </Step>
      <Step n={3} title="Configure the OAuth consent screen">
        <p>
          In <em>APIs &amp; Services → OAuth consent screen</em>, choose <strong>External</strong>, fill in the app name and your email, and under{" "}
          <strong>Test users</strong> add the Gmail address you&apos;ll send from. (While the app is in “Testing”, only test users can connect.)
        </p>
      </Step>
      <Step n={4} title="Create a Web OAuth client">
        <p>
          In <em>Credentials → Create credentials → OAuth client ID</em>, pick <strong>Web application</strong> and add this{" "}
          <strong>Authorized redirect URI</strong>:
        </p>
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 ring-1 ring-line">
          <code className="min-w-0 flex-1 break-all font-mono text-xs text-fg">{DEFAULT_REDIRECT}</code>
          <CopyButton text={DEFAULT_REDIRECT} />
        </div>
        <p className="text-xs text-muted">
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
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 ring-1 ring-line font-mono text-xs leading-relaxed text-slate-100">
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
          <button type="button" className={`${btnSecondary} ${btnSmall}`} onClick={onRecheck}>
            <IconRefresh size={13} />
            Check again
          </button>
        )}
      </Step>
      <Step n={7} title="Connect your Gmail account" last>
        <p>Click Connect Gmail and sign in with the test-user account. You&apos;ll be redirected back here.</p>
        {configured ? (
          <a href={api.gmailConnectUrl} className={`${btnPrimary} ${btnSmall}`}>
            Connect Gmail
          </a>
        ) : (
          <button type="button" className={`${btnPrimary} ${btnSmall}`} disabled title="Finish steps 1–6 first">
            Connect Gmail
          </button>
        )}
      </Step>
    </ol>
  );
}

function StatusRow({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <dt className="text-muted">{name}</dt>
      <dd className="text-right font-medium text-fg">{children}</dd>
    </div>
  );
}

function YesNo({ ok, yes = "Yes", no = "No" }: { ok: boolean; yes?: string; no?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${ok ? "text-success-fg" : "text-muted"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-success" : "bg-line-strong"}`} />
      {ok ? yes : no}
    </span>
  );
}

function StatusHero({
  data,
  busy,
  onDisconnect,
  onTestSend,
}: {
  data: GmailStatus;
  busy: boolean;
  onDisconnect: () => void;
  onTestSend: () => void;
}) {
  if (data.connected) {
    return (
      <section className="mb-5 overflow-hidden rounded-xl bg-surface shadow-sm ring-1 ring-line">
        <div className="bg-gradient-to-br from-success-soft via-surface to-surface px-6 py-6 sm:px-8">
          <div className="flex flex-wrap items-center gap-5">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success text-white shadow-sm">
              <IconMail size={26} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-success-fg">Sending from</p>
              <p className="mt-0.5 truncate text-2xl font-semibold tracking-tight text-fg">{data.email ?? "Connected account"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success-fg">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  Connected
                </span>
                {data.dryRun && <DryRunPill />}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2/60 px-6 py-4 sm:px-8">
          {data.testRecipientSet ? (
            <button type="button" className={btnPrimary} onClick={onTestSend} disabled={busy}>
              <IconSend size={16} />
              {busy ? "Working…" : "Send test email to TEST_RECIPIENT"}
            </button>
          ) : (
            <span className="text-xs text-muted">
              Set <Code>TEST_RECIPIENT</Code> in <Code>api/.env</Code> to enable the test-send button.
            </span>
          )}
          <div className="ml-auto flex gap-2">
            {data.configured && (
              <a href={api.gmailConnectUrl} className={btnSecondary}>
                Reconnect / switch account
              </a>
            )}
            <button type="button" className={btnDanger} onClick={onDisconnect} disabled={busy}>
              Disconnect
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (data.configured) {
    return (
      <section className="mb-5 rounded-xl bg-surface px-6 py-6 shadow-sm ring-1 ring-warning-line sm:px-8">
        <div className="flex flex-wrap items-center gap-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-soft text-warning-fg">
            <IconMail size={26} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-warning-fg">Not connected</p>
            <p className="mt-0.5 text-xl font-semibold tracking-tight text-fg">Connect the Gmail account you&apos;ll send from</p>
            <p className="mt-1 text-sm text-muted">Google OAuth is configured. Sign in with the account you added as a test user.</p>
            {data.dryRun && <DryRunPill className="mt-2" />}
          </div>
          <a href={api.gmailConnectUrl} className={btnPrimary}>
            Connect Gmail
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-5 rounded-xl bg-surface px-6 py-6 shadow-sm ring-1 ring-warning-line sm:px-8">
      <div className="flex flex-wrap items-center gap-5">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-soft text-warning-fg">
          <IconMail size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-warning-fg">Setup required</p>
          <p className="mt-0.5 text-xl font-semibold tracking-tight text-fg">Gmail isn&apos;t set up yet</p>
          <p className="mt-1 text-sm text-muted">
            The API has no Google OAuth client. Follow the steps below once (about 10 minutes), then connect your account.
          </p>
          {data.dryRun && <DryRunPill className="mt-2" />}
        </div>
      </div>
    </section>
  );
}

export function GmailPanel() {
  const params = useSearchParams();
  const connectedParam = params.get("connected") === "1";
  const errorParam = params.get("error");
  const toast = useToast();

  const { data, error, loading, reload } = useGmailStatus();
  const [busy, setBusy] = useState(false);
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

  return (
    <div>
      <PageHeader title="Gmail account" description="The Google account every email is sent from, and whose inbox is checked for replies.">
        <button type="button" className={btnSecondary} onClick={reload} disabled={loading}>
          <IconRefresh size={16} className={loading ? "animate-spin" : undefined} />
          Refresh
        </button>
      </PageHeader>

      {connectedParam && <Notice tone="success">Gmail connected successfully.</Notice>}
      {errorParam && <ErrorBox error={`Gmail connection failed: ${errorParam}`} />}
      {error && !data && (
        <Notice
          tone="error"
          title="API offline"
          action={
            <button type="button" className={`${btnSecondary} ${btnSmall}`} onClick={reload}>
              Retry
            </button>
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

      {loading && !data && <Skeleton className="mb-5 h-36 w-full rounded-xl" />}

      {data && (
        <>
          <StatusHero data={data} busy={busy} onDisconnect={disconnect} onTestSend={testSend} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
            <div>
              {!data.configured ? (
                <Card title="Setup guide" description="One-time Google Cloud setup">
                  <SetupGuide configured={data.configured} onRecheck={reload} />
                </Card>
              ) : (
                <Card title="How sending works">
                  <ul className="space-y-4 text-sm text-fg-2">
                    <li className="flex gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-text">
                        <IconSend size={15} />
                      </span>
                      <span>
                        <strong className="text-fg">Every email goes out from this one account</strong>
                        {data.connected && data.email ? (
                          <>
                            {" "}
                            (<span className="font-medium text-fg">{data.email}</span>)
                          </>
                        ) : null}
                        : initial emails and follow-ups alike, and they appear in its Sent folder.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success-fg">
                        <IconInbox size={15} />
                      </span>
                      <span>
                        <strong className="text-fg">Replies are read from the same inbox.</strong> When a professor replies in the thread, the
                        email is marked replied and further follow-ups stop.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning-fg">
                        <IconMail size={15} />
                      </span>
                      <span>
                        To switch accounts, use <em>Reconnect</em> and sign in with a different Google account (it must be a test user on the OAuth
                        consent screen).
                      </span>
                    </li>
                  </ul>
                  <details className="mt-6 rounded-lg ring-1 ring-line">
                    <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-fg-2 hover:bg-surface-2">
                      Google Cloud setup guide (reference)
                    </summary>
                    <div className="border-t border-line p-4">
                      <SetupGuide configured={data.configured} onRecheck={reload} />
                    </div>
                  </details>
                </Card>
              )}
            </div>

            <div>
              <Card title="Status">
                <dl className="-my-2.5 divide-y divide-line">
                  <StatusRow name="OAuth client configured">
                    <YesNo ok={data.configured} />
                  </StatusRow>
                  <StatusRow name="Account connected">
                    <YesNo ok={data.connected} />
                  </StatusRow>
                  <StatusRow name="Account">
                    <span className="break-all">{data.email ?? "—"}</span>
                  </StatusRow>
                  <StatusRow name="DRY_RUN">
                    {data.dryRun ? <span className="text-warning-fg">ON (logged only)</span> : <span className="text-success-fg">OFF (real sends)</span>}
                  </StatusRow>
                  <StatusRow name="Test recipient set">
                    <YesNo ok={data.testRecipientSet} />
                  </StatusRow>
                </dl>
              </Card>
              {data.dryRun && (
                <Notice tone="warning" title="DRY RUN is on">
                  Emails are only logged, never sent. Set <Code>DRY_RUN=false</Code> in <Code>api/.env</Code> and restart the API to send for real.
                </Notice>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
