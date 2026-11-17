import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "prof-mailer",
  description: "Schedule and track Master's admissions emails to professors",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Applies the saved light/dark theme before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-background font-sans text-fg">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
