"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/professors", label: "Professors" },
  { href: "/templates", label: "Templates" },
  { href: "/import", label: "Import" },
  { href: "/queue", label: "Queue" },
  { href: "/sent", label: "Sent" },
  { href: "/settings", label: "Settings" },
  { href: "/gmail", label: "Gmail" },
];

export function NavLinks({ active }: { active: string | null }) {
  return (
    <nav className="flex flex-wrap gap-1">
      {links.map((l) => {
        const isActive = active !== null && (l.href === "/" ? active === "/" : active === l.href || active.startsWith(l.href + "/"));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-2.5 py-1.5 text-sm ${
              isActive ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Nav() {
  const pathname = usePathname();
  return <NavLinks active={pathname} />;
}
