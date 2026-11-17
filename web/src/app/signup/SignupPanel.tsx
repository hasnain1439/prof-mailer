"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/components/Auth";
import { AuthCard, AuthLink, AuthLinks, ResendVerification } from "@/components/AuthCard";
import { Button, Field, Input, Notice } from "@/components/ui";

export function SignupPanel() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Already signed in: nothing to do here.
  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const addr = email.trim();
    try {
      await api.signup({ email: addr });
      setSentTo(addr);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthCard title="Check your inbox">
        <Notice tone="success" className="">
          We sent a link to {sentTo}. Open it to confirm your email and choose your name and password.
        </Notice>
        <p className="mt-3 text-xs text-muted">The link expires in 24 hours. Didn&apos;t get it? Check your spam folder, or send it again.</p>
        <div className="mt-4">
          <ResendVerification email={sentTo} />
        </div>
        <AuthLinks>
          <AuthLink href="/login">Back to sign in</AuthLink>
        </AuthLinks>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create an account" description="Schedule and track your Master's admissions emails to professors.">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email" htmlFor="signup-email">
          <Input
            id="signup-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <p className="text-xs text-muted">We&apos;ll email you a link to confirm your address, then you choose your name and password.</p>

        {error && (
          <Notice tone="error" className="">
            {error}
          </Notice>
        )}

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={busy || !email.trim()}
        >
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <AuthLinks>
        <span>
          Already have an account? <AuthLink href="/login">Sign in</AuthLink>
        </span>
      </AuthLinks>
    </AuthCard>
  );
}
