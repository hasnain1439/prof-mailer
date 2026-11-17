"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { EmailActions } from "@/components/EmailActions";
import { useGmailStatus } from "@/components/GmailStatus";
import { IconArrowRight, IconCheck, IconClock, IconInbox, IconRefresh, IconReply } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Mono,
  Notice,
  PageHeader,
  Skeleton,
  TypeChip,
  btnPrimary,
  btnSecondary,
  btnSmall,
  link,
} from "@/components/ui";

function Stat({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-0.5 font-mono text-xl leading-7 font-medium text-text tabular-nums">{value}</p>
      {children}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-2.5 h-5 w-12" />
    </div>
  );
}

/** Sending account line, plus warning notices for dry run / no Gmail connected. */
function SendingFromBanner() {
  const { data, error } = useGmailStatus();
  if (error && !data) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-muted">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
        API offline: can&apos;t tell which Gmail account is connected.
      </div>
    );
  }
  if (!data) return <Skeleton className="mb-4 h-9 w-full" />;

  const dryRun = data.dryRun && (
    <Notice tone="warning" title="Dry run is on">
      No real emails are sent; they are only logged. Set DRY_RUN=false in api/.env and restart the API to send for real.
    </Notice>
  );

  if (data.connected) {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-surface px-3 py-2 text-[13px]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span className="text-muted">Sending from</span>
          <Mono className="text-text">{data.email ?? "your connected account"}</Mono>
          <Link href="/gmail" className={`ml-auto ${link}`}>
            Manage
          </Link>
        </div>
        {dryRun}
      </>
    );
  }
  return (
    <>
      <Notice
        tone="warning"
        title="No Gmail account connected"
        action={
          <Link href="/gmail" className={`${btnPrimary} ${btnSmall}`}>
            Connect Gmail
          </Link>
        }
      >
        Scheduled emails can&apos;t be sent until you connect one.
      </Notice>
      {dryRun}
    </>
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
      flush
      actions={
        <div className="flex items-center gap-2 text-muted">
          <Mono className="!text-xs">
            {doneCount} / {items.length}
          </Mono>
          <div className="h-1 w-24 overflow-hidden rounded-sm bg-border" aria-hidden="true">
            <div className="h-full bg-accent" style={{ width: `${(doneCount / items.length) * 100}%` }} />
          </div>
        </div>
      }
    >
      <ol className="divide-y divide-border">
        {items.map((item, i) => (
          <li key={item.title} className="flex items-center gap-3 px-4 py-2">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border font-mono text-[11px] ${
                item.done ? "border-accent bg-accent text-on-accent" : "border-border text-muted"
              }`}
            >
              {item.done ? <IconCheck size={12} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-[13px] font-medium ${item.done ? "text-muted line-through" : "text-text"}`}>
                {item.title}
                {item.done && <span className="sr-only"> (done)</span>}
              </p>
              <p className="truncate text-xs text-muted">{item.help}</p>
            </div>
            {!item.done && (
              <Link href={item.href} className={`${btnSecondary} ${btnSmall}`}>
                {item.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-1 text-[13px] ${link}`}>
      {children}
      <IconArrowRight size={14} />
    </Link>
  );
}

export default function DashboardPage() {
  const { data, error, loading, reload } = useApi(() => api.dashboard());
  const sentPct = data ? Math.min(100, (data.counts.sentToday / Math.max(1, data.dailySendLimit)) * 100) : 0;

  return (
    <div>
      <PageHeader title="Dashboard" description="Your outreach at a glance. All times are Karachi time (PKT).">
        <Button onClick={reload} disabled={loading}>
          <IconRefresh className={loading ? "animate-spin" : undefined} />
          Refresh
        </Button>
      </PageHeader>

      <SendingFromBanner />
      <ErrorBox error={error} onRetry={reload} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!data ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <Stat label="Scheduled" value={data.counts.scheduled} />
            <Stat
              label="Sent today"
              value={
                <>
                  {data.counts.sentToday}
                  <span className="text-sm text-muted"> / {data.dailySendLimit}</span>
                </>
              }
            >
              <div className="mt-2 h-1 overflow-hidden rounded-sm bg-border" title={`${Math.round(sentPct)}% of daily limit`}>
                <div className={`h-full ${sentPct >= 100 ? "bg-replied-fg" : "bg-accent"}`} style={{ width: `${sentPct}%` }} />
              </div>
            </Stat>
            <Stat label="Replied" value={data.counts.replied} />
            <Stat label="Failed" value={<span className={data.counts.failed > 0 ? "text-failed-fg" : undefined}>{data.counts.failed}</span>}>
              {data.counts.failed > 0 && (
                <Link href="/queue" className={`mt-1 inline-block text-xs ${link}`}>
                  Review in queue
                </Link>
              )}
            </Stat>
          </>
        )}
      </div>

      <GettingStarted />

      {loading && !data && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card title="Upcoming" description="Next 10 scheduled emails" flush className="!mb-0" actions={<CardLink href="/queue">Full queue</CardLink>}>
            {data.upcoming.length === 0 ? (
              <EmptyState
                compact
                icon={<IconClock />}
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
              <ul className="divide-y divide-border">
                {data.upcoming.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 hover:bg-bg">
                    <div className="min-w-0 flex-1 basis-56">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link href={`/professors/${e.professor.id}`} className="truncate text-[13px] font-medium text-text hover:text-accent">
                          {e.professor.name}
                        </Link>
                        <TypeChip followUpNo={e.followUpNo} />
                      </div>
                      <p className="truncate text-[13px] text-muted" title={`${e.subject} · ${e.professor.university}`}>
                        {e.subject}
                      </p>
                    </div>
                    <Mono className="shrink-0 !text-xs whitespace-nowrap text-muted">{formatKarachi(e.scheduledAt)}</Mono>
                    <div className="shrink-0">
                      <EmailActions email={e} onChanged={reload} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recently sent" description="Last 10 emails sent" flush className="!mb-0" actions={<CardLink href="/sent">All sent</CardLink>}>
            {data.recentSent.length === 0 ? (
              <EmptyState compact icon={<IconInbox />} title="Nothing sent yet">
                Sent emails and replies will appear here.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentSent.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2 hover:bg-bg">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link href={`/professors/${e.professor.id}`} className="truncate text-[13px] font-medium text-text hover:text-accent">
                          {e.professor.name}
                        </Link>
                        <TypeChip followUpNo={e.followUpNo} />
                        {e.repliedAt && (
                          <Badge tone="replied" className="gap-1">
                            <IconReply size={12} />
                            Replied
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-[13px] text-muted" title={e.subject}>
                        {e.subject}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Mono className="block !text-xs whitespace-nowrap text-muted">{formatKarachi(e.sentAt)}</Mono>
                      {e.repliedAt && (
                        <Mono className="block !text-xs whitespace-nowrap text-text">
                          <span className="font-sans text-muted">Replied </span>
                          {formatKarachi(e.repliedAt)}
                        </Mono>
                      )}
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
