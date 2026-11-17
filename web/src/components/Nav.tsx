"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconClock, IconDashboard, IconMail, IconSend, IconSettings, IconTemplate, IconUpload, IconUsers } from "./icons";

const groups: { heading?: string; links: { href: string; label: string; icon: ReactNode }[] }[] = [
  {
    links: [
      { href: "/", label: "Dashboard", icon: <IconDashboard /> },
      { href: "/professors", label: "Professors", icon: <IconUsers /> },
      { href: "/templates", label: "Templates", icon: <IconTemplate /> },
      { href: "/import", label: "Import", icon: <IconUpload /> },
    ],
  },
  {
    heading: "Mail",
    links: [
      { href: "/queue", label: "Queue", icon: <IconClock /> },
      { href: "/sent", label: "Sent", icon: <IconSend /> },
    ],
  },
  {
    heading: "Configure",
    links: [
      { href: "/settings", label: "Settings", icon: <IconSettings /> },
      { href: "/gmail", label: "Gmail account", icon: <IconMail /> },
    ],
  },
];

export function NavLinks({ active, onNavigate }: { active: string | null; onNavigate?: () => void }) {
  return (
    <nav className="space-y-6">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.heading && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-subtle">{g.heading}</p>}
          <ul className="space-y-0.5">
            {g.links.map((l) => {
              const isActive =
                active !== null && (l.href === "/" ? active === "/" : active === l.href || active.startsWith(l.href + "/"));
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? "bg-primary-soft text-primary-text" : "text-fg-2 hover:bg-surface-3 hover:text-fg"
                    }`}
                  >
                    <span className={isActive ? "text-primary-text" : "text-subtle group-hover:text-fg-2"}>{l.icon}</span>
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <NavLinks active={pathname} onNavigate={onNavigate} />;
}
