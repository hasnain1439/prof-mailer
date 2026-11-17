"use client";

/**
 * Shared UI kit. Tokens live in app/globals.css (bg, surface, border, text, muted, accent, on-accent,
 * and status pairs scheduled/sent/replied/failed/cancelled -bg/-fg). Rules: 6px radius (badges 4px),
 * 1px borders instead of shadows, sentence case, IBM Plex Mono for numbers/dates/emails/ids.
 */

import { useEffect, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import type { EmailStatus, ProfessorStatus } from "@/lib/types";
import { IconAlert, IconCheckCircle, IconInfo, IconX } from "./icons";

/* ---------- class strings (for <Link>/<a> styled as buttons, or legacy callers) ---------- */

export const btn =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary = `${btn} border-accent bg-accent text-on-accent hover:border-accent-hover hover:bg-accent-hover`;
export const btnSecondary = `${btn} border-border-input bg-surface text-text hover:bg-bg`;
export const btnDanger = `${btn} border-border bg-surface text-failed-fg hover:bg-failed-bg`;
export const btnGhost = `${btn} border-transparent bg-transparent text-muted hover:bg-bg hover:text-text`;
export const btnSmall = "!h-7 !px-2 !text-xs";

export const input =
  "block h-8 w-full rounded-md border border-border-input bg-surface px-2.5 text-[13px] text-text placeholder:text-muted focus:border-accent focus:outline-none";
export const textareaCls =
  "block w-full rounded-md border border-border-input bg-surface px-2.5 py-2 text-[13px] text-text placeholder:text-muted focus:border-accent focus:outline-none";
export const label = "mb-1 block text-xs font-medium text-muted";
export const link = "font-medium text-accent underline-offset-2 hover:underline";
export const mono = "font-mono text-[13px]";

/** Scroll container for tables; sticky headers stick to its top. */
export const tableWrap = "max-h-[70vh] overflow-auto";
export const table = "w-full border-separate border-spacing-0 text-[13px]";
export const th =
  "sticky top-0 z-10 h-9 border-b border-border bg-surface px-3 text-left text-xs font-medium whitespace-nowrap text-muted first:pl-4 last:pr-4";
export const td = "h-10 border-b border-border px-3 py-1 align-middle text-text first:pl-4 last:pr-4";
/** Right-aligned monospace numeric cell. */
export const tdNum = `${td} text-right font-mono tabular-nums`;
export const tr = "hover:bg-bg";

/* ---------- primitives ---------- */

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
const variantCls: Record<ButtonVariant, string> = {
  primary: btnPrimary,
  secondary: btnSecondary,
  danger: btnDanger,
  ghost: btnGhost,
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button type={type} className={`${variantCls[variant]} ${size === "sm" ? btnSmall : ""} ${className}`} {...rest} />;
}

export function Input({ className = "", ...rest }: ComponentProps<"input">) {
  return <input className={`${input} ${className}`} {...rest} />;
}

export function Select({ className = "", ...rest }: ComponentProps<"select">) {
  return <select className={`${input} pr-7 ${className}`} {...rest} />;
}

export function Textarea({ className = "", ...rest }: ComponentProps<"textarea">) {
  return <textarea className={`${textareaCls} ${className}`} {...rest} />;
}

/** Label + control + optional hint. */
export function Field({ label: text, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={label}>
        {text}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Table shell: bordered surface + scroll container + sticky header. */
export function Table({ head, children, scroll = true }: { head: ReactNode; children: ReactNode; scroll?: boolean }) {
  return (
    <div className={scroll ? tableWrap : ""}>
      <table className={table}>
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, numeric, className = "" }: { children?: ReactNode; numeric?: boolean; className?: string }) {
  return <th className={`${th} ${numeric ? "text-right" : ""} ${className}`}>{children}</th>;
}

export function Td({ children, numeric, className = "", colSpan }: { children?: ReactNode; numeric?: boolean; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`${numeric ? tdNum : td} ${className}`}>
      {children}
    </td>
  );
}

/** Monospace inline text for emails, dates, ids and counts. */
export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[13px] tabular-nums ${className}`}>{children}</span>;
}

/* ---------- layout ---------- */

export function PageHeader({ title, description, children }: { title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl leading-7 font-semibold text-text">{title}</h1>
        {description && <p className="mt-0.5 max-w-2xl text-[13px] text-muted">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  children,
  actions,
  flush,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  /** No body padding (for tables/lists that run edge to edge). */
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={`mb-4 overflow-hidden rounded-md border border-border bg-surface ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-text">{title}</h2>}
            {description && <p className="text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

/* ---------- feedback ---------- */

type Tone = "error" | "success" | "warning" | "info";
const noticeTone: Record<Tone, { box: string; icon: ReactNode }> = {
  error: { box: "bg-failed-bg text-failed-fg", icon: <IconAlert /> },
  success: { box: "bg-sent-bg text-sent-fg", icon: <IconCheckCircle /> },
  warning: { box: "bg-replied-bg text-replied-fg", icon: <IconAlert /> },
  info: { box: "bg-scheduled-bg text-scheduled-fg", icon: <IconInfo /> },
};

export function Notice({
  tone,
  title,
  children,
  action,
  onDismiss,
  className = "mb-4",
}: {
  tone: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const t = noticeTone[tone];
  return (
    <div role={tone === "error" ? "alert" : undefined} className={`flex items-start gap-2.5 rounded-md px-3 py-2.5 text-[13px] ${t.box} ${className}`}>
      <span className="mt-0.5 shrink-0">{t.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="break-words whitespace-pre-wrap">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {onDismiss && (
        <button type="button" aria-label="Dismiss" className="shrink-0 rounded-sm opacity-70 hover:opacity-100" onClick={onDismiss}>
          <IconX />
        </button>
      )}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string | null | undefined; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <Notice
      tone="error"
      action={
        onRetry && (
          <Button size="sm" onClick={onRetry}>
            Retry
          </Button>
        )
      }
    >
      {error}
    </Notice>
  );
}

export function SuccessBox({ children }: { children: ReactNode }) {
  return <Notice tone="success">{children}</Notice>;
}

/* ---------- loading skeletons ---------- */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-border ${className}`} />;
}

/** Generic block of skeleton rows (kept as `Loading` for existing callers). */
export function Loading({ rows = 4 }: { rows?: number; text?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface" aria-busy="true" aria-label="Loading">
      <div className="flex h-9 items-center gap-4 border-b border-border px-4">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-10 items-center gap-4 border-b border-border px-4 last:border-0">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={`h-2.5 flex-1 ${c === 0 ? "max-w-48" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- empty states ---------- */

export function EmptyState({
  icon,
  title,
  children,
  action,
  compact,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "px-4 py-5" : "px-6 py-8"}`}>
      {icon && <div className="mb-2 text-muted">{icon}</div>}
      <p className="text-sm font-medium text-text">{title}</p>
      {children && <p className="mt-0.5 max-w-sm text-[13px] text-muted">{children}</p>}
      {action && <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Wraps EmptyState in a bordered surface (for use where no Card surrounds it). */
export function EmptyCard(props: Parameters<typeof EmptyState>[0]) {
  return (
    <div className="rounded-md border border-border bg-surface">
      <EmptyState {...props} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-5 text-center text-[13px] text-muted">{children}</p>;
}

/* ---------- badges ---------- */

type StatusTone = "scheduled" | "sent" | "replied" | "failed" | "cancelled";
const toneCls: Record<StatusTone, string> = {
  scheduled: "bg-scheduled-bg text-scheduled-fg",
  sent: "bg-sent-bg text-sent-fg",
  replied: "bg-replied-bg text-replied-fg",
  failed: "bg-failed-bg text-failed-fg",
  cancelled: "bg-cancelled-bg text-cancelled-fg",
};

const emailStatusStyles: Record<EmailStatus, { tone: StatusTone; label: string }> = {
  SCHEDULED: { tone: "scheduled", label: "Scheduled" },
  SENDING: { tone: "scheduled", label: "Sending" },
  SENT: { tone: "sent", label: "Sent" },
  FAILED: { tone: "failed", label: "Failed" },
  CANCELLED: { tone: "cancelled", label: "Cancelled" },
};

export const profStatusStyles: Record<ProfessorStatus, { tone: StatusTone; cls: string; label: string }> = {
  NOT_SENT: { tone: "cancelled", cls: toneCls.cancelled, label: "Not sent" },
  SENT: { tone: "sent", cls: toneCls.sent, label: "Sent" },
  REPLIED: { tone: "replied", cls: toneCls.replied, label: "Replied" },
  INTERESTED: { tone: "sent", cls: toneCls.sent, label: "Interested" },
  DECLINED: { tone: "failed", cls: toneCls.failed, label: "Declined" },
};

/** Small status label: 4px radius, tinted background. Pass `tone` or a raw `className`. */
export function Badge({ tone, className = "", children }: { tone?: StatusTone; className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex h-5 items-center rounded-sm px-1.5 text-xs font-medium whitespace-nowrap ${tone ? toneCls[tone] : ""} ${className}`}>
      {children}
    </span>
  );
}

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  const s = emailStatusStyles[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ProfessorStatusBadge({ status }: { status: ProfessorStatus }) {
  const s = profStatusStyles[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function professorStatusLabel(s: ProfessorStatus): string {
  return profStatusStyles[s].label;
}

export function TypeChip({ followUpNo }: { followUpNo: number }) {
  return <Badge className="border border-border bg-surface text-muted">{followUpLabel(followUpNo)}</Badge>;
}

export function followUpLabel(n: number): string {
  return n === 0 ? "Initial" : `Follow-up ${n}`;
}

/** DRY RUN indicator (amber = replied tone). */
export function DryRunBadge({ className = "" }: { className?: string }) {
  return (
    <Badge
      tone="replied"
      className={className}
    >
      <span title="DRY_RUN is on: no real emails are sent. Set DRY_RUN=false in api/.env and restart the API to send for real.">Dry run: emails are only logged</span>
    </Badge>
  );
}

/* ---------- avatar ---------- */

export function initials(name: string): string {
  const parts = name
    .replace(/^(prof\.?|dr\.?|professor)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? "h-6 w-6 text-[11px]" : size === "lg" ? "h-10 w-10 text-sm" : "h-7 w-7 text-xs";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-bg font-medium text-muted ${dim}`}>
      {initials(name)}
    </span>
  );
}

/* ---------- modal ---------- */

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-10" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${wide ? "max-w-3xl" : "max-w-xl"} overflow-hidden rounded-md border border-border bg-surface`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          <button type="button" aria-label="Close" className="rounded-md p-1 text-muted hover:bg-bg hover:text-text" onClick={onClose}>
            <IconX />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
