"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { EmailActions } from "@/components/EmailActions";
import { Empty, ErrorBox, EmailStatusBadge, Loading, PageHeader, btnSecondary, followUpLabel, table, td, th } from "@/components/ui";

export default function QueuePage() {
  const { data, error, loading, reload } = useApi(() => api.listEmails({ status: ["SCHEDULED", "SENDING", "FAILED"] }));

  return (
    <div>
      <PageHeader title="Queue">
        <button type="button" className={btnSecondary} onClick={reload} disabled={loading}>
          Refresh
        </button>
      </PageHeader>
      <p className="mb-4 text-sm text-neutral-600">Scheduled, sending and failed emails. Reschedule times are entered in Karachi time (PKT). Failed emails can be retried by rescheduling.</p>

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data &&
        (data.length === 0 ? (
          <Empty>The queue is empty.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className={table}>
              <thead>
                <tr>
                  <th className={th}>Professor</th>
                  <th className={th}>Subject</th>
                  <th className={th}>Type</th>
                  <th className={th}>Scheduled</th>
                  <th className={th}>Status</th>
                  <th className={th}>Error</th>
                  <th className={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((e) => (
                  <tr key={e.id} className={e.status === "FAILED" ? "bg-red-50/50" : undefined}>
                    <td className={td}>
                      <Link href={`/professors/${e.professor.id}`} className="font-medium hover:underline">
                        {e.professor.name}
                      </Link>
                      <div className="text-xs text-neutral-500">{e.professor.email}</div>
                    </td>
                    <td className={td}>{e.subject}</td>
                    <td className={`${td} whitespace-nowrap`}>{followUpLabel(e.followUpNo)}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatKarachi(e.scheduledAt)}</td>
                    <td className={td}>
                      <EmailStatusBadge status={e.status} />
                    </td>
                    <td className={`${td} max-w-xs break-words text-xs text-red-700`}>{e.error ?? ""}</td>
                    <td className={td}>
                      {e.status === "SENDING" ? <span className="text-xs text-neutral-500">Sending…</span> : <EmailActions email={e} onChanged={reload} />}
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
