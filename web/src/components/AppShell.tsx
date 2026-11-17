"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { GmailStatusProvider, useGmailStatus } from "./GmailStatus";
import { IconLogo, IconMenu, IconX } from "./icons";
import { Nav, NavLinks } from "./Nav";
import { SendingFrom } from "./SendingFrom";
import { ThemeToggle } from "./ThemeToggle";
import { ToastProvider } from "./Toast";

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-fg shadow-sm">
        <IconLogo size={18} />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-fg">prof-mailer</span>
        <span className="hidden text-[11px] text-muted min-[400px]:block">Master&apos;s outreach</span>
      </span>
    </Link>
  );
}

function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4 pb-5">
        <Brand onNavigate={onNavigate} />
      </div>
      <div className="flex-1 overflow-y-auto px-3">
        <Suspense fallback={<NavLinks active={null} />}>
          <Nav onNavigate={onNavigate} />
        </Suspense>
      </div>
      <div className="space-y-2.5 border-t border-line p-3">
        <SendingFrom onNavigate={onNavigate} />
        <ThemeToggle />
        <p className="px-1 text-[11px] text-subtle">All times in Asia/Karachi (PKT, UTC+5)</p>
      </div>
    </div>
  );
}

/** Compact connection dot for the mobile top bar. */
function MobileStatusDot() {
  const { data, error } = useGmailStatus();
  const color = error && !data ? "bg-subtle" : data?.connected ? "bg-success" : data ? "bg-warning" : "bg-line-strong";
  const title = error && !data ? "API offline" : !data ? "Checking Gmail…" : data.connected ? `Sending from ${data.email ?? "connected account"}` : "No Gmail connected";
  return (
    <Link href="/gmail" title={title} className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-fg-2 ring-1 ring-line">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="hidden max-w-[10rem] truncate min-[480px]:inline">{data?.connected ? data.email : error && !data ? "API offline" : data ? "No Gmail" : "Gmail"}</span>
      {data?.dryRun && <span className="rounded bg-warning-soft px-1 text-[10px] font-bold text-warning-fg">DRY</span>}
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
    <div className="flex min-h-screen">
      {/* Desktop sidebar: a sticky flex column (not position:fixed), so it always takes its own space at >= lg. */}
      <aside className="sticky top-0 z-30 hidden h-screen w-60 shrink-0 border-r border-line bg-surface lg:block">
        <SidebarContents />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          className="-ml-1 rounded-md p-1.5 text-fg-2 hover:bg-surface-3"
          onClick={() => setOpen(true)}
        >
          <IconMenu size={20} />
        </button>
        <Brand />
        <div className="ml-auto flex items-center gap-2">
          <MobileStatusDot />
          <ThemeToggle compact />
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={close} />
          <aside className="drawer-in absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface shadow-xl">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute top-5 right-3 rounded-md p-1.5 text-muted hover:bg-surface-3"
              onClick={close}
            >
              <IconX size={18} />
            </button>
            <SidebarContents onNavigate={close} />
          </aside>
        </div>
      )}

      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">{children}</div>
      </main>
      </div>
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
