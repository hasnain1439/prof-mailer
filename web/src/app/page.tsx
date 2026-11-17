"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { EmailActions } from "@/components/EmailActions";
import { useGmailStatus } from "@/components/GmailStatus";
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconInbox,
  IconMail,
  IconRefresh,
  IconReply,
  IconSend,
} from "@/components/icons";
import { DryRunPill } from "@/components/SendingFrom";
import {
  Avatar,
  Card,
  EmptyState,
  ErrorBox,
  PageHeader,
  Skeleton,
  TypeChip,
  btnPrimary,
  btnSecondary,
  btnSmall,
  link,
} from "@/components/ui";

function StatCard({
  label,
  value,
  icon,
  iconClass,
  children,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  iconClass: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconClass}`}>{icon}</span>
      </div>
      {children}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-4 h-7 w-14" />
    </div>
  );
}

/** "Emails are sent from …" line, or a warning when Gmail is not connected. */
function SendingFromBanner() {
  const { data, error } = useGmailStatus();
  if (error && !data) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm ring-1 ring-slate-900/5">
        <span className="h-2 w-2 rounded-full bg-slate-400" />
        API offline: can&apos;t tell which Gmail account is connected.
      </div>
    );
  }
  if (!data) return <Skeleton className="mb-6 h-12 w-full rounded-xl" />;
  if (data.connected) {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-slate-900/5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <IconMail size={16} />
        </span>
        <span className="text-slate-600">
          Emails are sent from <strong className="font-semibold text-slate-900">{data.email ?? "your connected account"}</strong>
        </span>
        {data.dryRun && <DryRunPill />}
        <Link href="/gmail" className={`ml-auto text-sm ${link}`}>
          Manage
        </Link>
      </div>
    );
  }
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
      <IconAlert size={18} className="text-amber-500" />
      <span>
        <strong className="font-semibold">No Gmail account connected.</strong> Scheduled emails can&apos;t be sent until you connect one.
      </span>
      {data.dryRun && <DryRunPill />}
      <Link href="/gmail" className={`${btnPrimary} ${btnSmall} ml-auto`}>
        Connect Gmail
      </Link>
    </div>
  );
}

function GettingStarted() {
  const gmail = useGmailStatus();
  const templates = useApi(() => api.listTemplates());
  const settings = useApi(() => api.getSettings());
  const professors = useApi(() => api.listProfessors());

  if (!gmail.data || !templates.data || !settings.data || !professors.data) return null;

  const followUpId = settings.data.followUpTemplateId;
  const items = [
    {
      done: gmail.data.connected,
      title: "Connect your Gmail account",
      help: gmail.data.connected ? `Sending from ${gmail.data.email ?? "your account"}` : "Every email is sent from the account you connect.",
      href: "/gmail",
      cta: "Connect",
    },
    {
      done: templates.data.some((t) => !t.isFollowUp),
      title: "Create an initial email template",
      help: "The first email each professor receives.",
      href: "/templates",
      cta: "Create template",
    },
    {
      done: !!followUpId && templates.data.some((t) => t.id === followUpId && t.isFollowUp),
      title: "Add a follow-up template and select it in Settings",
      help: templates.data.some((t) => t.isFollowUp)
        ? "You have a follow-up template; choose it under Settings → Follow-up template."
        : "Create a template marked as follow-up, then select it in Settings.",
      href: templates.data.some((t) => t.isFollowUp) ? "/settings" : "/templates",
      cta: templates.data.some((t) => t.isFollowUp) ? "Open settings" : "Create follow-up",
    },
    {
      done: professors.data.length > 0,
      title: "Import professors",
      help: "Upload a CSV/XLSX of professors and schedule their emails.",
      href: "/import",
      cta: "Import",
    },
  ];
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;

  return (
    <Card
      title="Getting started"
      description={`${doneCount} of ${items.length} steps complete`}
      actions={
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${(doneCount / items.length) * 100}%` }} />
        </div>
      }
      flush
    >
      <ol className="divide-y divide-slate-100">
        {items.map((item, i) => (
          <li key={item.title} className="flex items-center gap-4 px-5 py-3.5">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                item.done ? "bg-emerald-500 text-white" : "bg-white text-slate-500 ring-1 ring-slate-300"
              }`}
            >
              {item.done ? <IconCheck size={14} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${item.done ? "text-slate-400 line-through" : "text-slate-900"}`}>{item.title}</p>
              <p className="text-xs text-slate-500">{item.help}</p>
            </div>
            {!item.done && (
              <Link href={item.href} className={`${btnSecondary} ${btnSmall}`}>
                {item.cta}
                <IconArrowRight size={13} />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export default function DashboardPage() {
  const { data, error, loading, reload } = useApi(() => api.dashboard());
  const sentPct = data ? Math.min(100, (data.counts.sentToday / Math.max(1, data.dailySendLimit)) * 100) : 0;

  return (
    <div>
      <PageHeader title="Dashboard" description="Your outreach at a glance. All times are Karachi time (PKT).">
        <button type="button" className={btnSecondary} onClick={reload} disabled={loading}>
          <IconRefresh size={16} className={loading ? "animate-spin" : undefined} />
          Refresh
        </button>
      </PageHeader>

      <SendingFromBanner />
      <ErrorBox error={error} onRetry={reload} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!data ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <StatCard label="Scheduled" value={data.counts.scheduled} icon={<IconClock size={20} />} iconClass="bg-indigo-50 text-indigo-600" />
            <StatCard
              label="Sent today"
              value={
                <>
                  {data.counts.sentToday}
                  <span className="text-lg font-medium text-slate-400"> / {data.dailySendLimit}</span>
                </>
              }
              icon={<IconSend size={20} />}
              iconClass="bg-sky-50 text-sky-600"
            >
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" title={`${Math.round(sentPct)}% of daily limit`}>
                <div className={`h-full rounded-full ${sentPct >= 100 ? "bg-amber-500" : "bg-sky-500"}`} style={{ width: `${sentPct}%` }} />
              </div>
            </StatCard>
            <StatCard label="Replied" value={data.counts.replied} icon={<IconReply size={20} />} iconClass="bg-emerald-50 text-emerald-600" />
            <StatCard
              label="Failed"
              value={<span className={data.counts.failed > 0 ? "text-red-600" : undefined}>{data.counts.failed}</span>}
              icon={<IconAlert size={20} />}
              iconClass={data.counts.failed > 0 ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}
            >
              {data.counts.failed > 0 && (
                <Link href="/queue" className={`mt-3 inline-block text-xs ${link}`}>
                  Review in queue →
                </Link>
              )}
            </StatCard>
          </>
        )}
      </div>

      <GettingStarted />

      {loading && !data && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card
            title="Upcoming"
            description="Next 10 scheduled emails"
            flush
            className="!mb-0"
            actions={
              <Link href="/queue" className={`text-sm ${link}`}>
                Full queue →
              </Link>
            }
          >
            {data.upcoming.length === 0 ? (
              <EmptyState
                compact
                icon={<IconClock size={20} />}
                title="Nothing scheduled"
                action={
                  <Link href="/import" className={`${btnPrimary} ${btnSmall}`}>
                    Import professors
                  </Link>
                }
              >
                Import a list of professors to schedule your first emails.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.upcoming.map((e) => (
                  <li key={e.id} className="flex gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50/70">
                    <Avatar name={e.professor.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link href={`/professors/${e.professor.id}`} className="truncate text-sm font-medium text-slate-900 hover:text-indigo-600">
                          {e.professor.name}
                        </Link>
                        <TypeChip followUpNo={e.followUpNo} />
                      </div>
                      <p className="truncate text-sm text-slate-600" title={e.subject}>
                        {e.subject}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <IconClock size={12} />
                        {formatKarachi(e.scheduledAt)}
                        <span className="text-slate-300">·</span>
                        <span className="truncate">{e.professor.university}</span>
                      </p>
                      <div className="mt-2">
                        <EmailActions email={e} onChanged={reload} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Recently sent"
            description="Last 10 emails sent"
            flush
            className="!mb-0"
            actions={
              <Link href="/sent" className={`text-sm ${link}`}>
                All sent →
              </Link>
            }
          >
            {data.recentSent.length === 0 ? (
              <EmptyState compact icon={<IconInbox size={20} />} title="Nothing sent yet">
                Sent emails and replies will appear here.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.recentSent.map((e) => (
                  <li key={e.id} className="flex gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50/70">
                    <Avatar name={e.professor.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link href={`/professors/${e.professor.id}`} className="truncate text-sm font-medium text-slate-900 hover:text-indigo-600">
                          {e.professor.name}
                        </Link>
                        <TypeChip followUpNo={e.followUpNo} />
                        {e.repliedAt && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                            <IconReply size={11} />
                            Replied
                          </span>
                        )}
                      </div>
                      <p className="truncate text-sm text-slate-600" title={e.subject}>
                        {e.subject}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Sent {formatKarachi(e.sentAt)}
                        {e.repliedAt && <span className="text-emerald-700"> · replied {formatKarachi(e.repliedAt)}</span>}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
