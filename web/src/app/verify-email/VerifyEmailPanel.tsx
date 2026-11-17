"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { AuthCard, AuthLink, AuthLinks, PasswordInput, ResendVerification } from "@/components/AuthCard";
import { Button, Field, Input, Notice } from "@/components/ui";

const MIN_PASSWORD = 8;

type State = { kind: "form" } | { kind: "done" } | { kind: "failed"; error: string };

/** Shown while the token is read from the URL. */
export function VerifyingCard() {
  return <AuthCard title="Confirm your email" description="Loading…" />;
}

function ResendForm() {
  const [email, setEmail] = useState("");
  return (
    <div className="mt-4 space-y-3">
      <Field label="Email" htmlFor="resend-email" hint="We'll send a new link if the account still needs one.">
        <Input
          id="resend-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <ResendVerification email={email} />
    </div>
  );
}

/**
 * The verification link is the only place a new account gets its password: whoever controls the
 * mailbox chooses it here, so signing up with someone else's address gives no access.
 */
export function VerifyEmailPanel() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>(token ? { kind: "form" } : { kind: "failed", error: "This link is missing its token." });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await api.verifyEmail(token, password);
      setState({ kind: "done" });
      // Full reload (not router.push) so the new session cookie is picked up by AuthProvider.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.setTimeout(() => window.location.assign("/"), 1000);
    } catch (err) {
      const msg = errorMessage(err);
      // An invalid/expired token can't be fixed by retyping the password.
      if (/invalid|expired/i.test(msg)) setState({ kind: "failed", error: msg });
      else setError(msg);
    } finally {
      setBusy(false);
      setPassword("");
      setConfirm("");
    }
  }

  if (state.kind === "done") {
    return (
      <AuthCard title="Email confirmed">
        <Notice tone="success" className="">
          Your account is ready. Taking you to the app…
        </Notice>
      </AuthCard>
    );
  }

  if (state.kind === "failed") {
    return (
      <AuthCard title="Couldn't confirm your email">
        <Notice tone="error" className="">
          {state.error} Links last 24 hours and can only be used once.
        </Notice>
        <ResendForm />
        <AuthLinks>
          <AuthLink href="/login">Back to sign in</AuthLink>
        </AuthLinks>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose your password" description="Confirm your email by setting the password you'll use to sign in.">
      <form onSubmit={submit} className="space-y-3">
        <Field
          label="Password"
          htmlFor="verify-password"
          hint={<span className={tooShort ? "text-failed-fg" : undefined}>At least {MIN_PASSWORD} characters.</span>}
        >
          <PasswordInput
            id="verify-password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field
          label="Confirm password"
          htmlFor="verify-confirm"
          hint={mismatch ? <span className="text-failed-fg">Passwords don&apos;t match.</span> : undefined}
        >
          <PasswordInput
            id="verify-confirm"
            required
            autoComplete="new-password"
            value={confirm}
            disabled={busy}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>

        {error && (
          <Notice tone="error" className="">
            {error}
          </Notice>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={busy || password.length < MIN_PASSWORD || password !== confirm}>
          {busy ? "Saving…" : "Confirm email and sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}
