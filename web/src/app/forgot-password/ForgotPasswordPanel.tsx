"use client";

import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { AuthCard, AuthLink, AuthLinks } from "@/components/AuthCard";
import { Button, Field, Input, Notice } from "@/components/ui";

export function ForgotPasswordPanel() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Reset your password" description="Enter the email you signed up with and we'll send you a link to choose a new password.">
      {sent ? (
        <>
          <Notice tone="success" className="">
            If an account exists, we sent a reset link.
          </Notice>
          <p className="mt-3 text-xs text-muted">The link expires in 1 hour. Check your spam folder if it doesn&apos;t arrive.</p>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Field label="Email" htmlFor="forgot-email">
            <Input
              id="forgot-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
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
          <Button type="submit" variant="primary" className="w-full" disabled={busy || !email.trim()}>
            {busy ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <AuthLinks>
        <AuthLink href="/login">Back to sign in</AuthLink>
      </AuthLinks>
    </AuthCard>
  );
}
