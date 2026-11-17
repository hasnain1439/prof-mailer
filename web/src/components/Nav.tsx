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
          {g.heading && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.heading}</p>}
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
                      isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <span className={isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"}>{l.icon}</span>
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
