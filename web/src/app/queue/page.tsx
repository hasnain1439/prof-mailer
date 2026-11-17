"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { api } from "@/lib/api";
import type { EmailStatus } from "@/lib/types";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { EmailActions } from "@/components/EmailActions";
import { EmailBody, HtmlBadge } from "@/components/EmailBody";
import { IconClock, IconRefresh, IconUpload } from "@/components/icons";
import {
  Avatar,
  EmailStatusBadge,
  EmptyCard,
  ErrorBox,
  PageHeader,
  TableSkeleton,
  TypeChip,
  btnPrimary,
  btnSecondary,
  table,
  tableWrap,
  td,
  th,
  tr,
} from "@/components/ui";

type Filter = "ALL" | "SCHEDULED" | "FAILED";

export default function QueuePage() {
  const { data, error, loading, reload } = useApi(() => api.listEmails({ status: ["SCHEDULED", "SENDING", "FAILED"] }));
  const [filter, setFilter] = useState<Filter>("ALL");
  const [open, setOpen] = useState<string | null>(null);

  const count = (s: EmailStatus[]) => data?.filter((e) => s.includes(e.status)).length ?? 0;
  const rows = data?.filter((e) => filter === "ALL" || (filter === "SCHEDULED" ? e.status !== "FAILED" : e.status === "FAILED"));
  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: "ALL", label: "All", n: data?.length ?? 0 },
    { key: "SCHEDULED", label: "Scheduled", n: count(["SCHEDULED", "SENDING"]) },
    { key: "FAILED", label: "Failed", n: count(["FAILED"]) },
  ];

  return (
    <div>
      <PageHeader
        title="Queue"
        description="Scheduled, sending and failed emails. Reschedule times are entered in Karachi time (PKT); failed emails can be retried by rescheduling."
      >
        <button type="button" className={btnSecondary} onClick={reload} disabled={loading}>
          <IconRefresh size={16} className={loading ? "animate-spin" : undefined} />
          Refresh
        </button>
      </PageHeader>

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <TableSkeleton cols={6} />}
      {data &&
        (data.length === 0 ? (
          <EmptyCard
            icon={<IconClock size={20} />}
            title="The queue is empty"
            action={
              <Link href="/import" className={btnPrimary}>
                <IconUpload size={16} />
                Import &amp; schedule emails
              </Link>
            }
          >
            Nothing is waiting to be sent. Import professors with a scheduled time to fill the queue.
          </EmptyCard>
        ) : (
          <div className="overflow-hidden rounded-xl bg-surface shadow-sm ring-1 ring-line">
            <div className="flex gap-1 border-b border-line px-3 py-2">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setFilter(t.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    filter === t.key ? "bg-surface-3 text-fg" : "text-muted hover:text-fg"
                  }`}
                >
                  {t.label}
                  <span
                    className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                      t.key === "FAILED" && t.n > 0 ? "bg-danger-soft text-danger-fg" : "bg-surface-3/70 text-fg-2"
                    }`}
                  >
                    {t.n}
                  </span>
                </button>
              ))}
            </div>
            {rows && rows.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted">No {filter === "FAILED" ? "failed" : "scheduled"} emails.</p>
            ) : (
              <div className={tableWrap}>
                <table className={table}>
                  <thead>
                    <tr>
                      <th className={th}>Professor</th>
                      <th className={th}>Subject</th>
                      <th className={th}>Scheduled</th>
                      <th className={th}>Status</th>
                      <th className={th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows?.map((e) => (
                      <Fragment key={e.id}>
                      <tr className={`${tr} ${e.status === "FAILED" ? "bg-danger-soft/40" : ""}`}>
                        <td className={td}>
                          <div className="flex items-center gap-3">
                            <Avatar name={e.professor.name} size="sm" />
                            <div className="min-w-0">
                              <Link href={`/professors/${e.professor.id}`} className="font-medium text-fg hover:text-primary-text">
                                {e.professor.name}
                              </Link>
                              <div className="truncate text-xs text-muted">{e.professor.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className={`${td} max-w-sm`}>
                          <div className="mb-1 flex flex-wrap gap-1.5">
                            <TypeChip followUpNo={e.followUpNo} />
                            {e.isHtml && <HtmlBadge />}
                          </div>
                          <div className="text-fg">{e.subject}</div>
                          {e.error && <div className="mt-1 break-words text-xs text-danger-fg">{e.error}</div>}
                          <button
                            type="button"
                            className="mt-1 text-xs font-medium text-primary-text hover:underline underline-offset-2"
                            aria-expanded={open === e.id}
                            onClick={() => setOpen(open === e.id ? null : e.id)}
                          >
                            {open === e.id ? "Hide email" : "View email"}
                          </button>
                        </td>
                        <td className={`${td} whitespace-nowrap text-xs`}>{formatKarachi(e.scheduledAt)}</td>
                        <td className={td}>
                          <EmailStatusBadge status={e.status} />
                        </td>
                        <td className={td}>
                          {e.status === "SENDING" ? (
                            <span className="text-xs text-muted">Sending…</span>
                          ) : (
                            <EmailActions email={e} onChanged={reload} />
                          )}
                        </td>
                      </tr>
                      {open === e.id && (
                        <tr>
                          <td colSpan={5} className="border-b border-line bg-surface-2/70 px-5 py-4">
                            <p className="mb-2 text-xs text-muted">
                              <span className="font-medium text-fg-2">Subject:</span> {e.subject}
                            </p>
                            {e.isHtml ? (
                              <EmailBody body={e.body} isHtml title={`Email: ${e.subject}`} />
                            ) : (
                              <EmailBody body={e.body} isHtml={false} className="max-h-96 overflow-y-auto rounded-lg bg-surface p-4 ring-1 ring-line" textClassName="text-fg" />
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
