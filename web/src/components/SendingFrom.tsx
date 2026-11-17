"use client";

import Link from "next/link";
import { useGmailStatus } from "./GmailStatus";
import { DryRunBadge, Skeleton } from "./ui";

/** Kept for existing callers; same as DryRunBadge. */
export function DryRunPill({ className = "" }: { className?: string }) {
  return <DryRunBadge className={className} />;
}

/** Sidebar footer: which Gmail account mail goes out from, dry run, or API offline. */
export function SendingFrom({ onNavigate }: { onNavigate?: () => void }) {
  const { data, error, loading, reload } = useGmailStatus();

  if (loading && !data) {
    return (
      <div className="space-y-1.5 py-1">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-xs">
        <p className="font-medium text-text">API offline</p>
        <p className="text-muted" title={error}>
          Sending status unknown.
        </p>
        <button type="button" onClick={reload} className="mt-1 rounded-sm font-medium text-accent hover:underline">
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
          className="block rounded-md"
          title={`Every email is sent from this account${data.authType ? " (App Password)" : ""}`}
        >
          <p className="text-xs text-muted">Sending from</p>
          <p className="flex items-center gap-1.5 text-text">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span className="truncate font-mono text-xs">{data.email ?? "Connected account"}</span>
          </p>
        </Link>
      ) : (
        <div className="rounded-md bg-replied-bg px-2.5 py-2 text-xs text-replied-fg">
          <p className="font-medium">No Gmail connected</p>
          <Link href="/gmail" onClick={onNavigate} className="mt-0.5 inline-block rounded-sm font-medium underline underline-offset-2">
            Connect account
          </Link>
        </div>
      )}
      {data.dryRun && <DryRunBadge className="w-full justify-center" />}
    </div>
  );
}
