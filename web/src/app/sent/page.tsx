"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { api } from "@/lib/api";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { EmailActions } from "@/components/EmailActions";
import { EmailBody, HtmlBadge } from "@/components/EmailBody";
import { IconInbox, IconRefresh, IconReply } from "@/components/icons";
import { Avatar, EmptyCard, ErrorBox, PageHeader, TableSkeleton, TypeChip, btnSecondary, table, tableWrap, td, th, tr } from "@/components/ui";

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
        <div className="flex rounded-lg bg-slate-200/60 p-0.5">
          {(["SENT", "CANCELLED"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t === "SENT" ? "Sent" : "Cancelled"}
            </button>
          ))}
        </div>
        <button type="button" className={btnSecondary} onClick={reload} disabled={loading}>
          <IconRefresh size={16} className={loading ? "animate-spin" : undefined} />
          Refresh
        </button>
      </PageHeader>

      <ErrorBox error={error} onRetry={reload} />
      {loading && (!rows || rows.length === 0) && <TableSkeleton cols={4} />}
      {rows &&
        !(loading && rows.length === 0) &&
        (rows.length === 0 ? (
          <EmptyCard icon={<IconInbox size={20} />} title={tab === "SENT" ? "Nothing sent yet" : "No cancelled emails"}>
            {tab === "SENT"
              ? "Once scheduled emails go out they'll be listed here, along with any replies."
              : "Emails you cancel from the queue will appear here."}
          </EmptyCard>
        ) : (
          <div className={`overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5 ${loading ? "opacity-60" : ""}`}>
            <div className={tableWrap}>
              <table className={table}>
                <thead>
                  <tr>
                    <th className={th}>Professor</th>
                    <th className={th}>Subject</th>
                    <th className={th}>{tab === "SENT" ? "Sent" : "Was scheduled"}</th>
                    <th className={th}>{tab === "SENT" ? "Reply" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <Fragment key={e.id}>
                    <tr className={tr}>
                      <td className={td}>
                        <div className="flex items-center gap-3">
                          <Avatar name={e.professor.name} size="sm" />
                          <div className="min-w-0">
                            <Link href={`/professors/${e.professor.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                              {e.professor.name}
                            </Link>
                            <div className="truncate text-xs text-slate-500">{e.professor.university}</div>
                          </div>
                        </div>
                      </td>
                      <td className={`${td} max-w-md`}>
                        <div className="mb-1 flex flex-wrap gap-1.5">
                          <TypeChip followUpNo={e.followUpNo} />
                          {e.isHtml && <HtmlBadge />}
                        </div>
                        <Link href={`/professors/${e.professor.id}`} className="block text-slate-800 hover:text-indigo-600">
                          {e.subject}
                        </Link>
                          <button
                            type="button"
                            className="mt-1 text-xs font-medium text-indigo-600 hover:text-indigo-500"
                            aria-expanded={open === e.id}
                            onClick={() => setOpen(open === e.id ? null : e.id)}
                          >
                            {open === e.id ? "Hide email" : "View email"}
                          </button>
                      </td>
                      <td className={`${td} whitespace-nowrap text-xs`}>{formatKarachi(tab === "SENT" ? e.sentAt : e.scheduledAt)}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        {tab === "SENT" ? (
                          e.repliedAt ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                              <IconReply size={12} />
                              Replied {formatKarachi(e.repliedAt)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">No reply yet</span>
                          )
                        ) : (
                          <EmailActions email={e} onChanged={reload} />
                        )}
                      </td>
                    </tr>
                      {open === e.id && (
                        <tr>
                          <td colSpan={4} className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
                            <p className="mb-2 text-xs text-slate-500">
                              <span className="font-medium text-slate-700">Subject:</span> {e.subject}
                            </p>
                            {e.isHtml ? (
                              <EmailBody body={e.body} isHtml title={`Email: ${e.subject}`} />
                            ) : (
                              <EmailBody body={e.body} isHtml={false} className="max-h-96 overflow-y-auto rounded-lg bg-white p-4 ring-1 ring-slate-200" textClassName="text-slate-800" />
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </div>
  );
}
