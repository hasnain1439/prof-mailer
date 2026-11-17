"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import { safeNext, useAuth } from "@/components/Auth";
import { IconLogo } from "@/components/icons";
import { Badge, Button, Field, Input, Notice, btnSecondary } from "@/components/ui";

const IS_DEV = process.env.NODE_ENV !== "production";

/** The standard Google "G" mark. */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Local QA sign-in without Google. Rendered only in development and only if the API exposes the endpoint. */
function DevLogin({ next }: { next: string }) {
  const [available, setAvailable] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Probe with an empty body: a disabled endpoint answers 404, an enabled one rejects the missing email.
    api.devLogin({ email: "" }).then(
      () => !cancelled && setAvailable(true),
      (e: unknown) => {
        if (cancelled) return;
        setAvailable(e instanceof ApiError && e.status !== 404 && e.status !== 0 && e.status < 500);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!available) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.devLogin({ email: email.trim() });
      window.location.assign(next); // full reload so the app starts clean for this user
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-3 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-text">Dev login</p>
        <Badge tone="replied">Development only</Badge>
      </div>
      <Field label="Email" htmlFor="dev-email">
        <Input
          id="dev-email"
          type="email"
          required
          placeholder="tester@example.com"
          className="font-mono"
          value={email}
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      {error && (
        <Notice tone="error" className="">
          {error}
        </Notice>
      )}
      <Button type="submit" className="w-full" disabled={busy || !email.trim()}>
        {busy ? "Signing in…" : "Sign in without Google"}
      </Button>
      <p className="text-[11px] text-muted">Skips Google. Only works when the API runs with DEV_LOGIN_ENABLED=true outside production.</p>
    </form>
  );
}

/** The sign-in card. Pure, so it can also be the prerendered fallback before search params are known. */
export function LoginCard({ next, error, devLogin }: { next: string; error: string | null; devLogin?: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-md border border-border bg-surface p-6">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-on-accent">
            <IconLogo size={14} />
          </span>
          <h1 className="text-sm font-semibold text-text">prof-mailer</h1>
        </div>
        <p className="mt-3 text-[13px] text-muted">Schedule and track your Master&apos;s admissions emails to professors.</p>

        {error && (
          <Notice tone="error" title="Sign-in failed" className="mt-4">
            {error}
          </Notice>
        )}

        <a href={api.googleSignInUrl(next === "/" ? undefined : next)} className={`${btnSecondary} mt-5 w-full`}>
          <GoogleMark />
          Sign in with Google
        </a>

        <p className="mt-3 text-xs text-muted">
          We only read your name and email to sign you in. Gmail access is requested separately when you connect your account.
        </p>

        {devLogin && IS_DEV && <DevLogin next={next} />}
      </div>
    </main>
  );
}

export function LoginPanel() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const next = safeNext(params.get("next"));
  const error = params.get("error");

  // Already signed in (e.g. back button): go where they were heading.
  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  return <LoginCard next={next} error={error} devLogin />;
}
