"use client";

import Link from "next/link";
import { useState, type ComponentProps, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import { IconEye, IconEyeOff, IconLogo } from "./icons";
import { Button, Notice, input, link } from "./ui";

/** Public auth pages (login, signup, verify, reset): no sidebar, a small centered bordered card. */
export function AuthCard({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-md border border-border bg-surface p-6">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-on-accent">
            <IconLogo size={14} />
          </span>
          <span className="text-sm font-semibold text-text">prof-mailer</span>
        </div>
        <h1 className="mt-4 text-[15px] font-semibold text-text">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
        {children && <div className="mt-5">{children}</div>}
      </div>
    </main>
  );
}

/** Small row of secondary links under an auth form. */
export function AuthLinks({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted">{children}</div>;
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={link}>
      {children}
    </Link>
  );
}

/** Password input with a show/hide toggle. */
export function PasswordInput({ className = "", ...rest }: Omit<ComponentProps<"input">, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? "text" : "password"} spellCheck={false} className={`${input} pr-9 ${className}`} {...rest} />
      <button
        type="button"
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        title={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-md text-muted hover:text-text"
        onClick={() => setShow((v) => !v)}
      >
        {show ? <IconEyeOff size={14} /> : <IconEye size={14} />}
      </button>
    </div>
  );
}

/** "Resend verification email" button with its own busy / sent / error state. */
export function ResendVerification({ email, variant = "secondary" }: { email: string; variant?: "primary" | "secondary" }) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setState("busy");
    setError(null);
    try {
      await api.resendVerification(email.trim());
      setState("sent");
    } catch (e) {
      setError(errorMessage(e));
      setState("idle");
    }
  }

  return (
    <div className="space-y-2">
      <Button variant={variant} className="w-full" disabled={state === "busy" || !email.trim()} onClick={resend}>
        {state === "busy" ? "Sending…" : state === "sent" ? "Send again" : "Resend verification email"}
      </Button>
      {state === "sent" && (
        <p className="text-xs text-muted" role="status">
          If that account still needs verifying, a new link is on its way.
        </p>
      )}
      {error && (
        <Notice tone="error" className="">
          {error}
        </Notice>
      )}
    </div>
  );
}
