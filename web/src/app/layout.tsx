import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "prof-mailer",
  description: "Schedule and track Master's admissions emails to professors",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 font-sans text-slate-900">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
