"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { AuthProvider, isPublicPath, useAuth } from "./Auth";
import { GmailStatusProvider, useGmailStatus } from "./GmailStatus";
import { IconLogOut, IconLogo, IconMenu, IconRefresh, IconX } from "./icons";
import { Nav, NavLinks } from "./Nav";
import { SendingFrom } from "./SendingFrom";
import { ThemeToggle } from "./ThemeToggle";
import { ToastProvider } from "./Toast";
import { Button, Loading, Notice, Skeleton, initials } from "./ui";

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" onClick={onNavigate} className="flex items-center gap-2 rounded-md">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-on-accent">
        <IconLogo size={14} />
      </span>
      <span className="text-sm font-semibold text-text">prof-mailer</span>
    </Link>
  );
}

/** Sidebar footer: who is signed in, and sign out. */
function UserBlock() {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const display = user.name || user.email;
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-bg text-xs font-medium text-muted">
        {initials(display)}
      </span>
      <div className="min-w-0 flex-1" title={user.email}>
        {user.name && <p className="truncate text-xs font-medium text-text">{user.name}</p>}
        <p className="truncate font-mono text-[11px] text-muted">{user.email}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="!px-1.5"
        aria-label="Sign out"
        title="Sign out"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signOut();
        }}
      >
        <IconLogOut size={14} />
      </Button>
    </div>
  );
}

function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center px-4">
        <Brand onNavigate={onNavigate} />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <Suspense fallback={<NavLinks active={null} />}>
          <Nav onNavigate={onNavigate} />
        </Suspense>
      </div>
      <div className="space-y-2 border-t border-border p-3">
        <SendingFrom onNavigate={onNavigate} />
        <ThemeToggle />
        <p className="text-[11px] text-muted">Times in Asia/Karachi (PKT)</p>
        <div className="border-t border-border pt-2">
          <UserBlock />
        </div>
      </div>
    </div>
  );
}

/** Compact connection indicator for the mobile top bar. */
function MobileStatus() {
  const { data, error } = useGmailStatus();
  const dot = error && !data ? "bg-muted" : data?.connected ? "bg-accent" : "bg-replied-fg";
  const text = error && !data ? "API offline" : data?.connected ? data.email : data ? "No Gmail" : "Gmail";
  return (
    <Link href="/gmail" className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-text">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="hidden max-w-[10rem] truncate font-mono min-[480px]:inline">{text}</span>
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
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 border-r border-border bg-surface lg:block">
        <SidebarContents />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
          <button type="button" aria-label="Open navigation" className="-ml-1 rounded-md p-1.5 text-muted hover:bg-bg hover:text-text" onClick={() => setOpen(true)}>
            <IconMenu />
          </button>
          <Brand />
          <div className="ml-auto">
            <MobileStatus />
          </div>
        </header>

        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={close} />
            <aside className="drawer-in absolute inset-y-0 left-0 w-[260px] max-w-[85vw] border-r border-border bg-surface">
              <button type="button" aria-label="Close navigation" className="absolute top-3 right-3 rounded-md p-1.5 text-muted hover:bg-bg" onClick={close}>
                <IconX />
              </button>
              <SidebarContents onNavigate={close} />
            </aside>
          </div>
        )}

        <main className="flex-1">
          <div className="w-full p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Placeholder while the session is being checked: sidebar outline + content rows. */
function ShellSkeleton() {
  return (
    <div className="flex min-h-screen" aria-busy="true" aria-label="Loading">
      <aside className="hidden w-[220px] shrink-0 border-r border-border bg-surface lg:block">
        <div className="flex h-12 items-center px-4">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-2 px-4 py-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-3 w-28" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-12 border-b border-border bg-surface lg:hidden" />
        <div className="w-full space-y-4 p-6">
          <Skeleton className="h-5 w-40" />
          <Loading rows={3} />
        </div>
      </div>
    </div>
  );
}

const LOGIN_PATH = "/login";

/** Decides between a public auth page (no sidebar), a redirect to it, and the signed-in app. */
function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, error, refresh } = useAuth();
  const onPublic = isPublicPath(pathname);
  const mustRedirect = !onPublic && !loading && !user && !error;

  useEffect(() => {
    if (!mustRedirect) return;
    const here = window.location.pathname + window.location.search;
    router.replace(`${LOGIN_PATH}?next=${encodeURIComponent(here)}`);
  }, [mustRedirect, router]);

  // Login, signup, email verification and password reset render on their own, without the shell.
  if (onPublic) return <>{children}</>;

  if (error && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Notice
            tone="error"
            title="Can't reach the server"
            className=""
            action={
              <Button size="sm" onClick={refresh}>
                <IconRefresh size={14} />
                Retry
              </Button>
            }
          >
            {error}
          </Notice>
        </div>
      </div>
    );
  }

  if (loading || !user) return <ShellSkeleton />;

  return (
    <GmailStatusProvider>
      <Shell>{children}</Shell>
    </GmailStatusProvider>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        {/* usePathname suspends on routes with unknown dynamic params (cacheComponents). */}
        <Suspense fallback={<ShellSkeleton />}>
          <AuthGate>{children}</AuthGate>
        </Suspense>
      </AuthProvider>
    </ToastProvider>
  );
}
