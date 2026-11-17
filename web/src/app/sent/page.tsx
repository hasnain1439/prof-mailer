"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { api } from "@/lib/api";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { EmailActions } from "@/components/EmailActions";
import { EmailBody, HtmlBadge } from "@/components/EmailBody";
import { IconInbox, IconRefresh, IconReply } from "@/components/icons";
import { Avatar, Badge, Button, EmptyCard, ErrorBox, Mono, PageHeader, Table, TableSkeleton, Td, Th, TypeChip, tr } from "@/components/ui";

type Tab = "SENT" | "CANCELLED";

export default function SentPage() {
  const [tab, setTab] = useState<Tab>("SENT");
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi(() => api.listEmails({ status: [tab] }), [tab]);
  const rows = data?.filter((e) => e.status === tab);

  return (
    <div>
      <PageHeader
        title={tab === "SENT" ? "Sent" : "Cancelled"}
        description={tab === "SENT" ? "Emails that have gone out, and whether the professor replied." : "Emails you cancelled. You can reschedule them."}
      >
        <div role="group" aria-label="Show" className="inline-flex h-8 items-center rounded-md border border-border bg-surface p-0.5">
          {(["SENT", "CANCELLED"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
              className={`h-full rounded-sm px-3 text-[13px] font-medium transition-colors ${
                tab === t ? "bg-accent text-on-accent" : "text-muted hover:bg-bg hover:text-text"
              }`}
            >
              {t === "SENT" ? "Sent" : "Cancelled"}
            </button>
          ))}
        </div>
        <Button onClick={reload} disabled={loading}>
          <IconRefresh className={loading ? "animate-spin" : undefined} />
          Refresh
        </Button>
      </PageHeader>

      <ErrorBox error={error} onRetry={reload} />
      {loading && (!rows || rows.length === 0) && <TableSkeleton cols={4} />}
      {rows &&
        !(loading && rows.length === 0) &&
        (rows.length === 0 ? (
          <EmptyCard icon={<IconInbox />} title={tab === "SENT" ? "Nothing sent yet" : "No cancelled emails"}>
            {tab === "SENT"
              ? "Once scheduled emails go out they'll be listed here, along with any replies."
              : "Emails you cancel from the queue will appear here."}
          </EmptyCard>
        ) : (
          <div className={`overflow-hidden rounded-md border border-border bg-surface ${loading ? "opacity-60" : ""}`}>
            <Table
              head={
                <>
                  <Th>Professor</Th>
                  <Th>Subject</Th>
                  <Th>{tab === "SENT" ? "Sent" : "Was scheduled"}</Th>
                  <Th>{tab === "SENT" ? "Reply" : "Actions"}</Th>
                </>
              }
            >
              {rows.map((e) => (
                <Fragment key={e.id}>
                  <tr className={tr}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={e.professor.name} size="sm" />
                        <div className="min-w-0">
                          <Link href={`/professors/${e.professor.id}`} className="font-medium text-text hover:text-accent">
                            {e.professor.name}
                          </Link>
                          <div className="truncate text-xs text-muted">{e.professor.university}</div>
                        </div>
                      </div>
                    </Td>
                    <Td className="max-w-md">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <TypeChip followUpNo={e.followUpNo} />
                        {e.isHtml && <HtmlBadge />}
                        <Link href={`/professors/${e.professor.id}`} className="truncate text-text hover:text-accent" title={e.subject}>
                          {e.subject}
                        </Link>
                      </div>
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
                      <Mono className="!text-xs">{formatKarachi(tab === "SENT" ? e.sentAt : e.scheduledAt)}</Mono>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {tab === "SENT" ? (
                        e.repliedAt ? (
                          <Badge tone="replied" className="gap-1">
                            <IconReply size={12} />
                            Replied <span className="font-mono">{formatKarachi(e.repliedAt)}</span>
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted">No reply yet</span>
                        )
                      ) : (
                        <EmailActions email={e} onChanged={reload} />
                      )}
                    </Td>
                  </tr>
                  {open === e.id && (
                    <tr>
                      <td colSpan={4} className="border-b border-border bg-bg px-4 py-3">
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
          </div>
        ))}
    </div>
  );
}
