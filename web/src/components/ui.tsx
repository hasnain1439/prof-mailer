"use client";

import { useEffect, type ReactNode } from "react";
import type { EmailStatus, ProfessorStatus } from "@/lib/types";
import { IconAlert, IconCheckCircle, IconInfo, IconX } from "./icons";

/* ---------- class strings ---------- */

export const btn =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary = `${btn} bg-primary text-primary-fg hover:bg-primary-hover disabled:hover:bg-primary`;
export const btnSecondary = `${btn} bg-surface text-fg-2 ring-1 ring-inset ring-line-strong hover:bg-surface-2`;
export const btnDanger = `${btn} bg-surface text-danger-fg ring-1 ring-inset ring-danger-line hover:bg-danger-soft`;
export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50";
export const btnSmall = "!gap-1 !rounded-md !px-2.5 !py-1 !text-xs";
export const input =
  "block w-full rounded-lg border-0 bg-surface px-3 py-2 text-sm text-fg shadow-xs ring-1 ring-inset ring-line-strong placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring";
export const label = "mb-1.5 block text-xs font-medium text-fg-2";
export const link = "font-medium text-primary-text hover:underline underline-offset-2";

/** Scroll container for tables; sticky headers stick to its top. */
export const tableWrap = "max-h-[70vh] overflow-auto";
export const table = "w-full border-separate border-spacing-0 text-sm";
export const th =
  "sticky top-0 z-10 border-b border-line bg-surface-2/95 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted backdrop-blur first:pl-5 last:pr-5";
export const td = "border-b border-line px-4 py-3 align-top text-fg-2 first:pl-5 last:pr-5";
export const tr = "transition-colors hover:bg-surface-2/80";

/* ---------- layout ---------- */

export function PageHeader({ title, description, children }: { title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
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
    <section className={`mb-5 overflow-hidden rounded-xl bg-surface shadow-sm ring-1 ring-line ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? "" : "p-4 sm:p-5"}>{children}</div>
    </section>
  );
}

/* ---------- feedback ---------- */

type Tone = "error" | "success" | "warning" | "info";
const noticeTone: Record<Tone, { box: string; icon: ReactNode }> = {
  error: { box: "bg-danger-soft text-danger-fg ring-danger-line", icon: <IconAlert size={18} className="text-danger" /> },
  success: { box: "bg-success-soft text-success-fg ring-success-line", icon: <IconCheckCircle size={18} className="text-success" /> },
  warning: { box: "bg-warning-soft text-warning-fg ring-warning-line", icon: <IconAlert size={18} className="text-warning" /> },
  info: { box: "bg-primary-soft text-primary-soft-fg ring-primary-line", icon: <IconInfo size={18} className="text-primary-text" /> },
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
    <div role={tone === "error" ? "alert" : undefined} className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${t.box} ${className}`}>
      <span className="mt-0.5 shrink-0">{t.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={`whitespace-pre-wrap break-words ${title ? "mt-0.5 opacity-90" : ""}`}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {onDismiss && (
        <button type="button" aria-label="Dismiss" className="shrink-0 opacity-60 hover:opacity-100" onClick={onDismiss}>
          <IconX size={16} />
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
          <button type="button" className={`${btnSecondary} ${btnSmall}`} onClick={onRetry}>
            Retry
          </button>
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
  return <div className={`animate-pulse rounded-md bg-surface-3/70 ${className}`} />;
}

/** Generic block of skeleton rows (kept as `Loading` for existing callers). */
export function Loading({ rows = 4 }: { rows?: number; text?: string }) {
  return (
    <div className="rounded-xl bg-surface p-5 shadow-sm ring-1 ring-line" aria-busy="true" aria-label="Loading">
      <div className="space-y-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-sm ring-1 ring-line" aria-busy="true" aria-label="Loading">
      <div className="flex gap-4 border-b border-line bg-surface-2 px-5 py-3">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={`h-3 flex-1 ${c === 0 ? "max-w-48" : ""}`} />
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
    <div className={`flex flex-col items-center text-center ${compact ? "px-4 py-7" : "px-6 py-10"}`}>
      {icon && <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-3 text-muted">{icon}</div>}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Wraps EmptyState in a card-like box (for use where no Card surrounds it). */
export function EmptyCard(props: Parameters<typeof EmptyState>[0]) {
  return (
    <div className="rounded-xl bg-surface shadow-sm ring-1 ring-line">
      <EmptyState {...props} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

/* ---------- badges ---------- */

const emailStatusStyles: Record<EmailStatus, { cls: string; dot: string; label: string }> = {
  SCHEDULED: { cls: "bg-primary-soft text-primary-text ring-primary-line", dot: "bg-primary", label: "Scheduled" },
  SENDING: { cls: "bg-warning-soft text-warning-fg ring-warning-line", dot: "bg-warning animate-pulse", label: "Sending" },
  SENT: { cls: "bg-info-soft text-info-fg ring-info-line", dot: "bg-info", label: "Sent" },
  FAILED: { cls: "bg-danger-soft text-danger-fg ring-danger-line", dot: "bg-danger", label: "Failed" },
  CANCELLED: { cls: "bg-surface-3 text-fg-2 ring-line-strong", dot: "bg-subtle", label: "Cancelled" },
};

export const profStatusStyles: Record<ProfessorStatus, { cls: string; dot: string; label: string }> = {
  NOT_SENT: { cls: "bg-surface-3 text-fg-2 ring-line-strong", dot: "bg-subtle", label: "Not sent" },
  SENT: { cls: "bg-info-soft text-info-fg ring-info-line", dot: "bg-info", label: "Sent" },
  REPLIED: { cls: "bg-success-soft text-success-fg ring-success-line", dot: "bg-success", label: "Replied" },
  INTERESTED: { cls: "bg-accent-soft text-accent-fg ring-accent-line", dot: "bg-accent", label: "Interested" },
  DECLINED: { cls: "bg-danger-soft text-danger-fg ring-danger-line", dot: "bg-danger", label: "Declined" },
};

export function Badge({ className, dot, children }: { className: string; dot?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {children}
    </span>
  );
}

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  const s = emailStatusStyles[status];
  return (
    <Badge className={s.cls} dot={s.dot}>
      {s.label}
    </Badge>
  );
}

export function ProfessorStatusBadge({ status }: { status: ProfessorStatus }) {
  const s = profStatusStyles[status];
  return (
    <Badge className={s.cls} dot={s.dot}>
      {s.label}
    </Badge>
  );
}

export function professorStatusLabel(s: ProfessorStatus): string {
  return profStatusStyles[s].label;
}

export function TypeChip({ followUpNo }: { followUpNo: number }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
        followUpNo === 0 ? "bg-surface-3 text-fg-2" : "bg-accent-soft text-accent-fg"
      }`}
    >
      {followUpLabel(followUpNo)}
    </span>
  );
}

export function followUpLabel(n: number): string {
  return n === 0 ? "Initial" : `Follow-up #${n}`;
}

/* ---------- avatar ---------- */

const avatarColors = [
  "bg-primary-soft text-primary-text",
  "bg-info-soft text-info-fg",
  "bg-success-soft text-success-fg",
  "bg-warning-soft text-warning-fg",
  "bg-danger-soft text-danger-fg",
  "bg-accent-soft text-accent-fg",
  "bg-info-soft text-info-fg",
];

export function initials(name: string): string {
  const parts = name
    .replace(/^(prof\.?|dr\.?|professor)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const color = avatarColors[h % avatarColors.length];
  const dim = size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-14 w-14 text-lg" : "h-9 w-9 text-sm";
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${dim} ${color}`}>{initials(name)}</span>;
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-[2px] sm:p-10" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${wide ? "max-w-3xl" : "max-w-xl"} overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-line`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          <button type="button" aria-label="Close" className="rounded-md p-1 text-subtle hover:bg-surface-3 hover:text-fg-2" onClick={onClose}>
            <IconX size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
