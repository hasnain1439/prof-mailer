"use client";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

/** Shows a "DRY RUN" badge when GET /settings reports dryRun: true. */
export function DryRunBadge() {
  const { data, error } = useApi(() => api.getSettings());
  if (error) {
    return (
      <span title={error} className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500">
        API offline
      </span>
    );
  }
  if (!data?.dryRun) return null;
  return (
    <span
      title="DRY_RUN is on: no real emails are sent. Set DRY_RUN=false in api/.env to send for real."
      className="rounded border border-amber-400 bg-amber-100 px-2 py-0.5 text-xs font-bold tracking-wide text-amber-900"
    >
      DRY RUN
    </span>
  );
}
