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
    heading: "Setup",
    links: [
      { href: "/settings", label: "Settings", icon: <IconSettings /> },
      { href: "/gmail", label: "Gmail account", icon: <IconMail /> },
    ],
  },
];

export function NavLinks({ active, onNavigate }: { active: string | null; onNavigate?: () => void }) {
  return (
    <nav className="space-y-4">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.heading && <p className="mb-1 px-2 text-xs text-muted">{g.heading}</p>}
          <ul className="space-y-px">
            {g.links.map((l) => {
              const isActive = active !== null && (l.href === "/" ? active === "/" : active === l.href || active.startsWith(l.href + "/"));
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex h-8 items-center gap-2 rounded-md px-2 text-[13px] transition-colors ${
                      isActive ? "bg-bg font-medium text-text" : "text-muted hover:bg-bg hover:text-text"
                    }`}
                  >
                    <span className={isActive ? "text-accent" : ""}>{l.icon}</span>
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
