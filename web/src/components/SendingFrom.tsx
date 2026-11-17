"use client";

import Link from "next/link";
import { useGmailStatus } from "./GmailStatus";
import { Skeleton } from "./ui";

export function DryRunPill({ className = "" }: { className?: string }) {
  return (
    <span
      title="DRY_RUN is on: no real emails are sent. Set DRY_RUN=false in api/.env and restart the API to send for real."
      className={`inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-fg ring-1 ring-inset ring-warning-line ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-warning" />
      DRY RUN – emails are only logged
    </span>
  );
}

/** Sidebar footer card: which Gmail account mail goes out from, DRY RUN, or API offline. */
export function SendingFrom({ onNavigate }: { onNavigate?: () => void }) {
  const { data, error, loading, reload } = useGmailStatus();

  if (loading && !data) {
    return (
      <div className="rounded-xl bg-surface p-3 ring-1 ring-line">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="mt-2 h-3.5 w-36" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl bg-surface p-3 ring-1 ring-line">
        <div className="flex items-center gap-2 text-sm font-medium text-fg-2">
          <span className="h-2 w-2 rounded-full bg-subtle" />
          API offline
        </div>
        <p className="mt-1 text-xs text-muted" title={error}>
          Can&apos;t reach the API, so sending status is unknown.
        </p>
        <button type="button" onClick={reload} className="mt-2 text-xs font-medium text-primary-text hover:underline underline-offset-2">
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-2">
      {data.connected ? (
        <Link
          href="/gmail"
          onClick={onNavigate}
          className="block rounded-xl bg-surface p-3 ring-1 ring-line transition hover:ring-line-strong"
          title={`Every email is sent from this Gmail account${data.authType ? ` (connected via ${data.authType === "APP_PASSWORD" ? "App Password" : "Google OAuth"})` : ""}`}
        >
          <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">Sending from</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <span className="truncate text-sm font-medium text-fg">{data.email ?? "Connected account"}</span>
          </div>
        </Link>
      ) : (
        <div className="rounded-xl bg-warning-soft p-3 ring-1 ring-warning-line">
          <div className="flex items-center gap-2 text-sm font-medium text-warning-fg">
            <span className="h-2 w-2 shrink-0 rounded-full bg-warning" />
            No Gmail connected
          </div>
          <p className="mt-1 text-xs text-warning-fg">Emails can&apos;t be sent until you connect an account.</p>
          <Link href="/gmail" onClick={onNavigate} className="mt-2 inline-block text-xs font-semibold text-warning-fg underline underline-offset-2 hover:text-warning-fg">
            Connect →
          </Link>
        </div>
      )}
      {data.dryRun && <DryRunPill className="w-full justify-center" />}
    </div>
  );
}
