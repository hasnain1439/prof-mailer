"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { AuthCard, AuthLink, AuthLinks, PasswordInput } from "@/components/AuthCard";
import { Button, Field, Notice } from "@/components/ui";

const MIN_PASSWORD = 8;

/** The form, also used as the prerendered fallback (token = null: inert until search params are known). */
export function ResetPasswordCard({ token }: { token: string | null }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword({ token, password });
      setDone(true);
      // Full reload so the new session cookie is picked up by AuthProvider.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.setTimeout(() => window.location.assign("/"), 1200);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthCard title="Password updated">
        <Notice tone="success" className="">
          You&apos;re signed in. Other sessions were signed out. Taking you to the app…
        </Notice>
      </AuthCard>
    );
  }

  if (token === "") {
    return (
      <AuthCard title="Choose a new password">
        <Notice tone="error" className="">
          This link is missing its token. Request a new reset link.
        </Notice>
        <AuthLinks>
          <AuthLink href="/forgot-password">Request a new link</AuthLink>
          <AuthLink href="/login">Back to sign in</AuthLink>
        </AuthLinks>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="space-y-3">
        <Field
          label="New password"
          htmlFor="reset-password"
          hint={<span className={tooShort ? "text-failed-fg" : undefined}>At least {MIN_PASSWORD} characters.</span>}
        >
          <PasswordInput
            id="reset-password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field
          label="Confirm new password"
          htmlFor="reset-confirm"
          hint={mismatch ? <span className="text-failed-fg">The passwords don&apos;t match.</span> : undefined}
        >
          <PasswordInput
            id="reset-confirm"
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
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={busy || !token || password.length < MIN_PASSWORD || password !== confirm}
        >
          {busy ? "Saving…" : "Set new password"}
        </Button>
      </form>
      <AuthLinks>
        <AuthLink href="/forgot-password">Request a new link</AuthLink>
        <AuthLink href="/login">Back to sign in</AuthLink>
      </AuthLinks>
    </AuthCard>
  );
}

export function ResetPasswordPanel() {
  const params = useSearchParams();
  return <ResetPasswordCard token={params.get("token") ?? ""} />;
}
