"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/components/Auth";
import { AuthCard, AuthLink, AuthLinks, PasswordInput, ResendVerification } from "@/components/AuthCard";
import { Button, Field, Input, Notice } from "@/components/ui";

const MIN_PASSWORD = 8;

export function SignupPanel() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Already signed in: nothing to do here.
  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    const addr = email.trim();
    try {
      await api.signup({ name: name.trim(), email: addr, password });
      setSentTo(addr);
      setPassword("");
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
          We sent a verification link to {sentTo}. Open it to finish creating your account.
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
        <Field label="Name" htmlFor="signup-name">
          <Input
            id="signup-name"
            required
            autoComplete="name"
            placeholder="Your full name"
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
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
        <Field
          label="Password"
          htmlFor="signup-password"
          hint={<span className={tooShort ? "text-failed-fg" : undefined}>At least {MIN_PASSWORD} characters.</span>}
        >
          <PasswordInput
            id="signup-password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
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

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={busy || !name.trim() || !email.trim() || password.length < MIN_PASSWORD}
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
