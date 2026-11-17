import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DryRunBadge } from "@/components/DryRunBadge";
import { Nav, NavLinks } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "prof-mailer",
  description: "Schedule and track Master's admissions emails to professors",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
            <Link href="/" className="font-semibold text-neutral-900">
              prof-mailer
            </Link>
            <DryRunBadge />
            <div className="ml-auto">
              <Suspense fallback={<NavLinks active={null} />}>
                <Nav />
              </Suspense>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
        <footer className="mx-auto w-full max-w-7xl px-4 py-4 text-xs text-neutral-400">All times shown in Asia/Karachi (PKT, UTC+5).</footer>
      </body>
    </html>
  );
}
