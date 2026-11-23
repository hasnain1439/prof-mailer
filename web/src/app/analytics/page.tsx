"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Analytics, AnalyticsBucket, ContactKind } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { IconBuilding, IconChart, IconGraduation, IconUsers } from "@/components/icons";
import { Card, EmptyCard, ErrorBox, PageHeader, Skeleton, Table, Td, Th, btnPrimary } from "@/components/ui";

/*
 * Series colours: categorical slots 1 (blue) and 2 (orange) of the dataviz reference palette,
 * stepped per mode and validated (validate_palette.js) against this app's surfaces:
 * light #2a78d6/#eb6834 on #ffffff, dark #3987e5/#d95926 on #1c1b1a — all checks pass.
 * Colour is never the only cue: legend + tooltip text + table view name every value.
 */
const SERIES = {
  sent: { label: "Sent", swatch: "bg-[#2a78d6] dark:bg-[#3987e5]", fill: "fill-[#2a78d6] dark:fill-[#3987e5]" },
  replied: { label: "Replied", swatch: "bg-[#eb6834] dark:bg-[#d95926]", fill: "fill-[#eb6834] dark:fill-[#d95926]" },
} as const;

type KindFilter = "" | ContactKind;

const TABS: { value: KindFilter; label: string; icon: ReactNode }[] = [
  { value: "", label: "All", icon: <IconUsers size={14} /> },
  { value: "PROFESSOR", label: "Professors", icon: <IconGraduation size={14} /> },
  { value: "COMPANY", label: "Companies", icon: <IconBuilding size={14} /> },
];

const shortDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short" });

/** Week start (UTC ISO of Monday 00:00 PKT) as "7 Sep" in Karachi time. */
function weekLabel(iso: string): string {
  return shortDate.format(new Date(iso));
}

function formatReplyTime(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

/* ---------- stat tiles ---------- */

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-0.5 font-mono text-xl leading-7 font-medium text-text tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
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

/* ---------- weekly chart ---------- */

const CHART_H = 180;
const PAD_TOP = 8;
const PAD_BOTTOM = 22; // x labels
const PAD_LEFT = 28; // y labels
const COL_W = 48;
const BAR_W = 14;
const BAR_GAP = 2; // surface gap between the two bars of a week

/** Nice integer ticks from 0 to >= max (max 4 intervals). */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag);
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  return out;
}

/** Bar with a 4px rounded top and a square base on the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function WeeklyChart({ weekly }: { weekly: Analytics["weekly"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...weekly.map((w) => Math.max(w.sent, w.replied)));
  const yTicks = ticks(max);
  const top = yTicks[yTicks.length - 1]!;
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const width = PAD_LEFT + weekly.length * COL_W;
  const y = (v: number) => PAD_TOP + plotH - (v / top) * plotH;
  const h = hover !== null ? weekly[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted" aria-hidden="true">
        {Object.values(SERIES).map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-[2px] ${s.swatch}`} />
            {s.label}
          </span>
        ))}
        <span className="ml-auto h-4 text-text">
          {h && hover !== null ? (
            <>
              Week of {weekLabel(h.weekStart)}: <span className="font-mono tabular-nums">{h.sent}</span> sent,{" "}
              <span className="font-mono tabular-nums">{h.replied}</span> replied
            </>
          ) : (
            "Hover a week for numbers"
          )}
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={CHART_H}
          viewBox={`0 0 ${width} ${CHART_H}`}
          role="img"
          aria-label="First emails sent and replies received per week, last 12 weeks. The table below has the numbers."
          className="block min-w-full"
          onMouseLeave={() => setHover(null)}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD_LEFT} x2={width} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
              <text x={PAD_LEFT - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted font-mono text-[10px]">
                {t}
              </text>
            </g>
          ))}
          {weekly.map((w, i) => {
            const cx = PAD_LEFT + i * COL_W + COL_W / 2;
            const xSent = cx - BAR_GAP / 2 - BAR_W;
            const xRep = cx + BAR_GAP / 2;
            const active = hover === i;
            return (
              <g key={w.weekStart}>
                {active && (
                  <rect x={cx - COL_W / 2 + 2} y={PAD_TOP} width={COL_W - 4} height={plotH} rx={4} className="fill-bg" />
                )}
                <path d={barPath(xSent, y(w.sent), BAR_W, y(0) - y(w.sent))} className={SERIES.sent.fill} />
                <path d={barPath(xRep, y(w.replied), BAR_W, y(0) - y(w.replied))} className={SERIES.replied.fill} />
                <text x={cx} y={CHART_H - 6} textAnchor="middle" className="fill-muted text-[10px]">
                  {weekLabel(w.weekStart)}
                </text>
                {/* Hit target: the whole column, larger than the bars. */}
                <rect
                  x={cx - COL_W / 2}
                  y={0}
                  width={COL_W}
                  height={CHART_H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  aria-label={`Week of ${weekLabel(w.weekStart)}: ${w.sent} sent, ${w.replied} replied`}
                />
              </g>
            );
          })}
          <line x1={PAD_LEFT} x2={width} y1={y(0)} y2={y(0)} className="stroke-border-input" strokeWidth={1} />
        </svg>
      </div>
      <details className="mt-3 text-[13px]">
        <summary className="cursor-pointer text-muted hover:text-text">View as table</summary>
        <div className="mt-2 rounded-md border border-border">
          <Table
            scroll={false}
            head={
              <>
                <Th>Week of</Th>
                <Th numeric>Sent</Th>
                <Th numeric>Replied</Th>
              </>
            }
          >
            {weekly.map((w) => (
              <tr key={w.weekStart}>
                <Td>{weekLabel(w.weekStart)}</Td>
                <Td numeric>{w.sent}</Td>
                <Td numeric>{w.replied}</Td>
              </tr>
            ))}
          </Table>
        </div>
      </details>
    </div>
  );
}

/* ---------- breakdown tables ---------- */

function BreakdownTable({ title, description, nameLabel, rows }: { title: string; description?: string; nameLabel: string; rows: AnalyticsBucket[] }) {
  return (
    <Card title={title} description={description} flush>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-muted">No data yet.</p>
      ) : (
        <Table
          scroll={false}
          head={
            <>
              <Th>{nameLabel}</Th>
              <Th numeric>Sent</Th>
              <Th numeric>Replied</Th>
              <Th numeric>Reply rate</Th>
            </>
          }
        >
          {rows.map((r) => (
            <tr key={r.key}>
              <Td className="max-w-[16rem] truncate">{r.label}</Td>
              <Td numeric>{r.sent}</Td>
              <Td numeric>{r.replied}</Td>
              <Td numeric>{pct(r.replyRate)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

/* ---------- page ---------- */

export default function AnalyticsPage() {
  const [kind, setKind] = useState<KindFilter>("");
  const { data, error, loading, reload } = useApi(() => api.analytics(kind || undefined), [kind]);
  const t = data?.totals;

  return (
    <div>
      <PageHeader title="Analytics" description="How your first emails perform: replies, reply rate and what works best. Counts first emails only; follow-ups are shown separately." />

      <div role="tablist" aria-label="Contact type" className="mb-4 flex gap-1 border-b border-border">
        {TABS.map((tab) => {
          const active = kind === tab.value;
          return (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setKind(tab.value)}
              className={`-mb-px inline-flex h-8 items-center gap-1.5 border-b-2 px-2.5 text-[13px] font-medium transition-colors ${
                active ? "border-accent text-text" : "border-transparent text-muted hover:text-text"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      <ErrorBox error={error} onRetry={reload} />

      {!data && loading && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      )}

      {data && t && t.sent === 0 && (
        <EmptyCard
          icon={<IconChart size={20} />}
          title="No sent emails yet"
          action={
            <Link href="/import" className={btnPrimary}>
              Import contacts
            </Link>
          }
        >
          Analytics appear once your first emails have been sent.
        </EmptyCard>
      )}

      {data && t && t.sent > 0 && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="First emails sent" value={t.sent} />
            <Stat label="Replies" value={t.replied} />
            <Stat label="Reply rate" value={pct(t.replyRate)} />
            <Stat label="Avg. time to reply" value={formatReplyTime(t.avgReplyHours)} />
            <Stat label="Follow-ups sent" value={t.followUpsSent} />
          </div>

          <Card title="Last 12 weeks" description="First emails sent per week, and how many of them got a reply (Karachi time, weeks start Monday).">
            <WeeklyChart weekly={data.weekly} />
          </Card>

          {kind === "" && data.byKind.length > 1 && (
            <BreakdownTable title="Professors vs companies" nameLabel="Type" rows={data.byKind} />
          )}
          <BreakdownTable title="By template" description="Which template gets the most replies." nameLabel="Template" rows={data.byTemplate} />
          <div className="grid gap-x-4 lg:grid-cols-2">
            <BreakdownTable title="By country" nameLabel="Country" rows={data.byCountry} />
            <BreakdownTable title="By university / company" nameLabel="Organisation" rows={data.byOrg} />
          </div>
        </>
      )}
    </div>
  );
}
