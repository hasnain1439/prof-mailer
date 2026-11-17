"use client";

import Link from "next/link";
import { useGmailStatus } from "./GmailStatus";
import { Skeleton } from "./ui";

export function DryRunPill({ className = "" }: { className?: string }) {
  return (
    <span
      title="DRY_RUN is on: no real emails are sent. Set DRY_RUN=false in api/.env and restart the API to send for real."
      className={`inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-300 ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      DRY RUN – emails are only logged
    </span>
  );
}

/** Sidebar footer card: which Gmail account mail goes out from, DRY RUN, or API offline. */
export function SendingFrom({ onNavigate }: { onNavigate?: () => void }) {
  const { data, error, loading, reload } = useGmailStatus();

  if (loading && !data) {
    return (
      <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="mt-2 h-3.5 w-36" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <span className="h-2 w-2 rounded-full bg-slate-400" />
          API offline
        </div>
        <p className="mt-1 text-xs text-slate-500" title={error}>
          Can&apos;t reach the API, so sending status is unknown.
        </p>
        <button type="button" onClick={reload} className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-500">
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
          className="block rounded-xl bg-white p-3 ring-1 ring-slate-200 transition hover:ring-slate-300"
          title="Every email is sent from this Gmail account"
        >
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Sending from</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="truncate text-sm font-medium text-slate-900">{data.email ?? "Connected account"}</span>
          </div>
        </Link>
      ) : (
        <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
            No Gmail connected
          </div>
          <p className="mt-1 text-xs text-amber-800">Emails can&apos;t be sent until you connect an account.</p>
          <Link href="/gmail" onClick={onNavigate} className="mt-2 inline-block text-xs font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700">
            Connect →
          </Link>
        </div>
      )}
      {data.dryRun && <DryRunPill className="w-full justify-center" />}
    </div>
  );
}
