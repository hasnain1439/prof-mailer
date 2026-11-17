"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { EmailActions } from "@/components/EmailActions";
import { Empty, ErrorBox, Loading, PageHeader, btnSecondary, followUpLabel, table, td, th } from "@/components/ui";

type Tab = "SENT" | "CANCELLED";

export default function SentPage() {
  const [tab, setTab] = useState<Tab>("SENT");
  const { data, error, loading, reload } = useApi(() => api.listEmails({ status: [tab] }), [tab]);
  const rows = data?.filter((e) => e.status === tab);

  return (
    <div>
      <PageHeader title={tab === "SENT" ? "Sent" : "Cancelled"}>
        <div className="flex rounded-md border border-neutral-300 bg-white p-0.5">
          {(["SENT", "CANCELLED"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1 text-sm ${tab === t ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
            >
              {t === "SENT" ? "Sent" : "Cancelled"}
            </button>
          ))}
        </div>
        <button type="button" className={btnSecondary} onClick={reload} disabled={loading}>
          Refresh
        </button>
      </PageHeader>

      <ErrorBox error={error} onRetry={reload} />
      {loading && !rows && <Loading />}
      {rows &&
        (rows.length === 0 ? (
          <Empty>{tab === "SENT" ? "Nothing sent yet." : "No cancelled emails."}</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className={table}>
              <thead>
                <tr>
                  <th className={th}>{tab === "SENT" ? "Sent" : "Was scheduled"}</th>
                  <th className={th}>Professor</th>
                  <th className={th}>Subject</th>
                  <th className={th}>Type</th>
                  <th className={th}>{tab === "SENT" ? "Reply" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className={`${td} whitespace-nowrap`}>{formatKarachi(tab === "SENT" ? e.sentAt : e.scheduledAt)}</td>
                    <td className={td}>
                      <Link href={`/professors/${e.professor.id}`} className="font-medium hover:underline">
                        {e.professor.name}
                      </Link>
                      <div className="text-xs text-neutral-500">{e.professor.university}</div>
                    </td>
                    <td className={td}>
                      <Link href={`/professors/${e.professor.id}`} className="hover:underline">
                        {e.subject}
                      </Link>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{followUpLabel(e.followUpNo)}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {tab === "SENT" ? (
                        e.repliedAt ? (
                          <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-800">
                            Replied {formatKarachi(e.repliedAt)}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-400">No reply</span>
                        )
                      ) : (
                        <EmailActions email={e} onChanged={reload} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
