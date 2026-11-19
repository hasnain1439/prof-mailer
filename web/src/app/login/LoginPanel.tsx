"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ACCOUNT_BLOCKED, ApiError, api, errorMessage } from "@/lib/api";
import { safeNext, useAuth } from "@/components/Auth";
import { AuthCard, AuthLink, AuthLinks, PasswordInput, ResendVerification } from "@/components/AuthCard";
import { Badge, Button, Field, Input, Notice } from "@/components/ui";

const IS_DEV = process.env.NODE_ENV !== "production";

/** Local QA sign-in without a password. Rendered only in development and only if the API exposes the endpoint. */
function DevLogin({ next }: { next: string }) {
  const [available, setAvailable] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Dev login never exists in production builds: don't probe the API there.
    if (process.env.NODE_ENV === "production") return;
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
        {busy ? "Signing in…" : "Sign in without a password"}
      </Button>
      <p className="text-[11px] text-muted">Only works when the API runs with DEV_LOGIN_ENABLED=true outside production.</p>
    </form>
  );
}

/** The sign-in card. Also the prerendered fallback before search params are known (interactive = false). */
export function LoginCard({ next = "/", interactive = true }: { next?: string; interactive?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!interactive) return;
    setBusy(true);
    setError(null);
    setUnverifiedEmail(null);
    setBlocked(false);
    try {
      await api.login({ email: email.trim(), password });
      window.location.assign(next); // full reload so the app starts clean for this user
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.code === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(email.trim());
      } else if (err instanceof ApiError && err.code === ACCOUNT_BLOCKED) {
        setBlocked(true);
      } else {
        setError(errorMessage(err));
      }
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Sign in" description="Schedule and track your Master's admissions emails to professors.">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email" htmlFor="login-email">
          <Input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="login-password">
          <PasswordInput
            id="login-password"
            required
            autoComplete="current-password"
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && (
          <Notice tone="error" className="">
            {error}
          </Notice>
        )}
        {blocked && (
          <Notice tone="error" title="This account has been blocked" className="">
            You can&apos;t sign in with it. If you think this is a mistake, contact the person who runs this app.
          </Notice>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={busy || !email.trim() || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {unverifiedEmail && (
        <div className="mt-4 space-y-3">
          <Notice tone="warning" title="Please verify your email first" className="">
            Open the link we sent to {unverifiedEmail}, then sign in again.
          </Notice>
          <ResendVerification email={unverifiedEmail} />
        </div>
      )}

      <AuthLinks>
        <AuthLink href="/signup">Create an account</AuthLink>
        <AuthLink href="/forgot-password">Forgot password?</AuthLink>
      </AuthLinks>

      {interactive && IS_DEV && <DevLogin next={next} />}
    </AuthCard>
  );
}

export function LoginPanel() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const next = safeNext(params.get("next"));

  // Already signed in (e.g. back button): go where they were heading.
  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  return <LoginCard next={next} />;
}
