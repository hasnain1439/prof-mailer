"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { GmailStatusProvider, useGmailStatus } from "./GmailStatus";
import { IconLogo, IconMenu, IconX } from "./icons";
import { Nav, NavLinks } from "./Nav";
import { SendingFrom } from "./SendingFrom";
import { ToastProvider } from "./Toast";

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
        <IconLogo size={18} />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-slate-900">prof-mailer</span>
        <span className="block text-[11px] text-slate-500">Master&apos;s outreach</span>
      </span>
    </Link>
  );
}

function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5 pb-6">
        <Brand onNavigate={onNavigate} />
      </div>
      <div className="flex-1 overflow-y-auto px-3">
        <Suspense fallback={<NavLinks active={null} />}>
          <Nav onNavigate={onNavigate} />
        </Suspense>
      </div>
      <div className="space-y-3 border-t border-slate-200 p-3">
        <SendingFrom onNavigate={onNavigate} />
        <p className="px-1 text-[11px] text-slate-400">All times in Asia/Karachi (PKT, UTC+5)</p>
      </div>
    </div>
  );
}

/** Compact connection dot for the mobile top bar. */
function MobileStatusDot() {
  const { data, error } = useGmailStatus();
  const color = error && !data ? "bg-slate-400" : data?.connected ? "bg-emerald-500" : data ? "bg-amber-500" : "bg-slate-300";
  const title = error && !data ? "API offline" : !data ? "Checking Gmail…" : data.connected ? `Sending from ${data.email ?? "connected account"}` : "No Gmail connected";
  return (
    <Link href="/gmail" title={title} className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="max-w-[9rem] truncate">{data?.connected ? data.email : error && !data ? "API offline" : data ? "No Gmail" : "Gmail"}</span>
      {data?.dryRun && <span className="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-900">DRY</span>}
    </Link>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <SidebarContents />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          className="-ml-1 rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
          onClick={() => setOpen(true)}
        >
          <IconMenu size={20} />
        </button>
        <Brand />
        <div className="ml-auto">
          <MobileStatusDot />
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={close} />
          <aside className="drawer-in absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute top-5 right-3 rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
              onClick={close}
            >
              <IconX size={18} />
            </button>
            <SidebarContents onNavigate={close} />
          </aside>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <GmailStatusProvider>
        <Shell>{children}</Shell>
      </GmailStatusProvider>
    </ToastProvider>
  );
}
