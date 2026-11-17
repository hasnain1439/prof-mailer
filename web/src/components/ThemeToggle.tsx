"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY as KEY } from "@/lib/theme";

export type ThemeChoice = "light" | "dark" | "system";
const EVENT = "prof-mailer-theme";

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function setChoice(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* storage unavailable: still apply for this page view */
  }
  apply(choice);
  window.dispatchEvent(new Event(EVENT));
}

const options: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun size={14} strokeWidth={1.75} aria-hidden="true" /> },
  { value: "dark", label: "Dark", icon: <Moon size={14} strokeWidth={1.75} aria-hidden="true" /> },
  { value: "system", label: "System", icon: <Monitor size={14} strokeWidth={1.75} aria-hidden="true" /> },
];

/** Light / Dark / System segmented control. `compact` hides the text labels. */
export function ThemeToggle({ compact }: { compact?: boolean }) {
  const choice = useSyncExternalStore(subscribe, read, () => "system" as ThemeChoice);

  // Follow OS changes while on "system".
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  return (
    <div role="radiogroup" aria-label="Colour theme" className={`flex rounded-md border border-border bg-bg p-0.5 ${compact ? "" : "w-full"}`}>
      {options.map((o) => {
        const active = choice === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${o.label} theme`}
            onClick={() => setChoice(o.value)}
            className={`flex h-6 flex-1 items-center justify-center gap-1 rounded-sm px-1.5 text-xs transition-colors ${
              active ? "bg-surface font-medium text-text" : "text-muted hover:text-text"
            }`}
          >
            {o.icon}
            {!compact && o.label}
            {compact && <span className="sr-only">{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
