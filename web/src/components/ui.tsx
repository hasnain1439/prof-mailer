"use client";

import { useEffect, type ReactNode } from "react";
import type { EmailStatus, ProfessorStatus } from "@/lib/types";

export const btn =
  "inline-flex items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary = `${btn} border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-700`;
export const btnSecondary = `${btn} border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100`;
export const btnDanger = `${btn} border-red-300 bg-white text-red-700 hover:bg-red-50`;
export const btnSmall = "!px-2 !py-1 !text-xs";
export const input =
  "w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-400";
export const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500";
export const table = "w-full border-collapse text-sm";
export const th = "border-b border-neutral-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500";
export const td = "border-b border-neutral-100 px-3 py-2 align-top";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="mb-6 rounded-lg border border-neutral-200 bg-white">
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-neutral-800">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function ErrorBox({ error, onRetry }: { error: string | null | undefined; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <span className="whitespace-pre-wrap break-words">{error}</span>
      {onRetry && (
        <button type="button" className={`${btnSecondary} ${btnSmall}`} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function SuccessBox({ children }: { children: ReactNode }) {
  return <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{children}</div>;
}

export function Loading({ text = "Loading…" }: { text?: string }) {
  return <p className="py-4 text-sm text-neutral-500">{text}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-sm text-neutral-500">{children}</p>;
}

const emailStatusColors: Record<EmailStatus, string> = {
  SCHEDULED: "bg-blue-50 text-blue-800 border-blue-200",
  SENDING: "bg-amber-50 text-amber-800 border-amber-200",
  SENT: "bg-green-50 text-green-800 border-green-200",
  FAILED: "bg-red-50 text-red-800 border-red-200",
  CANCELLED: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

const profStatusColors: Record<ProfessorStatus, string> = {
  NOT_SENT: "bg-neutral-100 text-neutral-700 border-neutral-200",
  SENT: "bg-blue-50 text-blue-800 border-blue-200",
  REPLIED: "bg-green-50 text-green-800 border-green-200",
  INTERESTED: "bg-emerald-100 text-emerald-900 border-emerald-300",
  DECLINED: "bg-red-50 text-red-800 border-red-200",
};

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium ${className}`}>{children}</span>
  );
}

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  return <Badge className={emailStatusColors[status]}>{status}</Badge>;
}

export function ProfessorStatusBadge({ status }: { status: ProfessorStatus }) {
  return <Badge className={profStatusColors[status]}>{status.replace("_", " ")}</Badge>;
}

export function followUpLabel(n: number): string {
  return n === 0 ? "Initial" : `Follow-up #${n}`;
}

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
        className={`w-full ${wide ? "max-w-3xl" : "max-w-xl"} rounded-lg bg-white shadow-xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 className="font-semibold text-neutral-900">{title}</h2>
          <button type="button" aria-label="Close" className="text-xl leading-none text-neutral-500 hover:text-neutral-900" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
