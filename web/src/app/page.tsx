"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { EmailActions } from "@/components/EmailActions";
import { Card, Empty, ErrorBox, Loading, PageHeader, btnSecondary, followUpLabel, table, td, th } from "@/components/ui";

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone ?? "text-neutral-900"}`}>{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, error, loading, reload } = useApi(() => api.dashboard());

  return (
    <div>
      <PageHeader title="Dashboard">
        <button type="button" className={btnSecondary} onClick={reload} disabled={loading}>
          Refresh
        </button>
      </PageHeader>

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loading />}

      {data && (
        <>
          {data.dryRun && (
            <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <strong>DRY RUN mode.</strong> No real emails are sent; sends are logged and simulated. Set{" "}
              <code className="font-mono">DRY_RUN=false</code> in <code className="font-mono">api/.env</code> to send for real.
            </div>
          )}

          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Scheduled" value={data.counts.scheduled} />
            <Stat label="Sent today" value={`${data.counts.sentToday} / ${data.dailySendLimit}`} />
            <Stat label="Replied" value={data.counts.replied} tone="text-green-700" />
            <Stat label="Failed" value={data.counts.failed} tone={data.counts.failed > 0 ? "text-red-700" : undefined} />
          </div>

          <Card
            title="Upcoming (next 10)"
            actions={
              <Link href="/queue" className="text-sm text-neutral-600 underline hover:text-neutral-900">
                Full queue
              </Link>
            }
          >
            {data.upcoming.length === 0 ? (
              <Empty>Nothing scheduled.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className={table}>
                  <thead>
                    <tr>
                      <th className={th}>Scheduled</th>
                      <th className={th}>Professor</th>
                      <th className={th}>Subject</th>
                      <th className={th}>Type</th>
                      <th className={th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.upcoming.map((e) => (
                      <tr key={e.id}>
                        <td className={`${td} whitespace-nowrap`}>{formatKarachi(e.scheduledAt)}</td>
                        <td className={td}>
                          <Link href={`/professors/${e.professor.id}`} className="font-medium hover:underline">
                            {e.professor.name}
                          </Link>
                          <div className="text-xs text-neutral-500">{e.professor.university}</div>
                        </td>
                        <td className={td}>{e.subject}</td>
                        <td className={`${td} whitespace-nowrap`}>{followUpLabel(e.followUpNo)}</td>
                        <td className={td}>
                          <EmailActions email={e} onChanged={reload} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card
            title="Recently sent"
            actions={
              <Link href="/sent" className="text-sm text-neutral-600 underline hover:text-neutral-900">
                All sent
              </Link>
            }
          >
            {data.recentSent.length === 0 ? (
              <Empty>Nothing sent yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className={table}>
                  <thead>
                    <tr>
                      <th className={th}>Sent</th>
                      <th className={th}>Professor</th>
                      <th className={th}>Subject</th>
                      <th className={th}>Type</th>
                      <th className={th}>Reply</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentSent.map((e) => (
                      <tr key={e.id}>
                        <td className={`${td} whitespace-nowrap`}>{formatKarachi(e.sentAt)}</td>
                        <td className={td}>
                          <Link href={`/professors/${e.professor.id}`} className="font-medium hover:underline">
                            {e.professor.name}
                          </Link>
                        </td>
                        <td className={td}>{e.subject}</td>
                        <td className={`${td} whitespace-nowrap`}>{followUpLabel(e.followUpNo)}</td>
                        <td className={`${td} whitespace-nowrap`}>
                          {e.repliedAt ? <span className="text-green-700">Replied {formatKarachi(e.repliedAt)}</span> : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
