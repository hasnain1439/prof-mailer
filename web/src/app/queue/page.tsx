"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { api } from "@/lib/api";
import { contactHref, type EmailStatus } from "@/lib/types";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { EmailActions } from "@/components/EmailActions";
import { EmailBody, HtmlBadge } from "@/components/EmailBody";
import { IconClock, IconRefresh, IconUpload } from "@/components/icons";
import {
  Avatar,
  Button,
  CvClip,
  EmailStatusBadge,
  EmptyCard,
  ErrorBox,
  Mono,
  PageHeader,
  Table,
  TableSkeleton,
  Td,
  Th,
  TypeChip,
  btnPrimary,
  contactOrg,
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
        <Button onClick={reload} disabled={loading}>
          <IconRefresh className={loading ? "animate-spin" : undefined} />
          Refresh
        </Button>
      </PageHeader>

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <TableSkeleton cols={5} />}
      {data &&
        (data.length === 0 ? (
          <EmptyCard
            icon={<IconClock />}
            title="The queue is empty"
            action={
              <Link href="/import" className={btnPrimary}>
                <IconUpload />
                Import &amp; schedule emails
              </Link>
            }
          >
            Nothing is waiting to be sent. Import contacts with a scheduled time to fill the queue.
          </EmptyCard>
        ) : (
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            <div role="tablist" aria-label="Filter queue" className="flex gap-5 border-b border-border px-4">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === t.key}
                  onClick={() => setFilter(t.key)}
                  className={`-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 text-[13px] font-medium transition-colors ${
                    filter === t.key ? "border-accent text-text" : "border-transparent text-muted hover:text-text"
                  }`}
                >
                  {t.label}
                  <Mono className={`!text-xs ${t.key === "FAILED" && t.n > 0 ? "text-failed-fg" : "text-muted"}`}>{t.n}</Mono>
                </button>
              ))}
            </div>
            {rows && rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted">No {filter === "FAILED" ? "failed" : "scheduled"} emails.</p>
            ) : (
              <Table
                head={
                  <>
                    <Th>Contact</Th>
                    <Th>Subject</Th>
                    <Th>Scheduled</Th>
                    <Th>Status</Th>
                    <Th>Actions</Th>
                  </>
                }
              >
                {rows?.map((e) => (
                  <Fragment key={e.id}>
                    <tr className={tr}>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={e.professor.name} size="sm" />
                          <div className="min-w-0">
                            <Link href={contactHref(e.professor)} className="font-medium text-text hover:text-accent">
                              {e.professor.name}
                            </Link>
                            <Mono className="block truncate !text-xs text-muted">{e.professor.email}</Mono>
                            {e.professor.kind === "COMPANY" && (
                              <div className="truncate text-xs text-muted" title={contactOrg(e.professor)}>
                                {contactOrg(e.professor)}
                              </div>
                            )}
                          </div>
                        </div>
                      </Td>
                      <Td className="max-w-md">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <TypeChip followUpNo={e.followUpNo} />
                          {e.isHtml && <HtmlBadge />}
                          {e.attachCv && <CvClip />}
                          <span className="truncate text-text" title={e.subject}>
                            {e.subject}
                          </span>
                        </div>
                        {e.error && <p className="mt-1 text-xs break-words text-failed-fg">{e.error}</p>}
                        <button
                          type="button"
                          className="mt-0.5 rounded-sm text-xs font-medium text-accent underline-offset-2 hover:underline"
                          aria-expanded={open === e.id}
                          onClick={() => setOpen(open === e.id ? null : e.id)}
                        >
                          {open === e.id ? "Hide email" : "View email"}
                        </button>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <Mono className="!text-xs">{formatKarachi(e.scheduledAt)}</Mono>
                      </Td>
                      <Td>
                        <EmailStatusBadge status={e.status} />
                      </Td>
                      <Td>
                        {e.status === "SENDING" ? <span className="text-xs text-muted">Sending…</span> : <EmailActions email={e} onChanged={reload} />}
                      </Td>
                    </tr>
                    {open === e.id && (
                      <tr>
                        <td colSpan={5} className="border-b border-border bg-bg px-4 py-3">
                          <p className="mb-2 text-xs text-muted">
                            <span className="font-medium text-text">Subject:</span> {e.subject}
                          </p>
                          {e.isHtml ? (
                            <EmailBody body={e.body} isHtml title={`Email: ${e.subject}`} />
                          ) : (
                            <EmailBody
                              body={e.body}
                              isHtml={false}
                              className="max-h-96 overflow-y-auto rounded-md border border-border bg-surface p-4"
                              textClassName="text-text"
                            />
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </Table>
            )}
          </div>
        ))}
    </div>
  );
}
