"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { AuthCard, AuthLink, AuthLinks, ResendVerification } from "@/components/AuthCard";
import { Field, Input, Notice } from "@/components/ui";

type State = { kind: "verifying" } | { kind: "done" } | { kind: "failed"; error: string };

/** Shown while the token is read from the URL and checked. */
export function VerifyingCard() {
  return <AuthCard title="Verifying your email…" description="This only takes a moment." />;
}

function ResendForm() {
  const [email, setEmail] = useState("");
  return (
    <div className="mt-4 space-y-3">
      <Field label="Email" htmlFor="resend-email" hint="We'll send a new verification link if the account still needs one.">
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

export function VerifyEmailPanel() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>(token ? { kind: "verifying" } : { kind: "failed", error: "This link is missing its token." });
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use: post exactly once, even under StrictMode's double effect run.
    if (!token || started.current) return;
    started.current = true;
    api.verifyEmail(token).then(
      () => {
        setState({ kind: "done" });
        // Full reload so the new session cookie is picked up by AuthProvider.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.setTimeout(() => window.location.assign("/"), 1200);
      },
      (e: unknown) => setState({ kind: "failed", error: errorMessage(e) }),
    );
  }, [token]);

  if (state.kind === "verifying") return <VerifyingCard />;

  if (state.kind === "done") {
    return (
      <AuthCard title="Email verified">
        <Notice tone="success" className="">
          Your account is ready. Taking you to the app…
        </Notice>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Couldn't verify your email">
      <Notice tone="error" className="">
        {state.error} The link may have expired (links last 24 hours) or already been used.
      </Notice>
      <ResendForm />
      <AuthLinks>
        <AuthLink href="/login">Back to sign in</AuthLink>
      </AuthLinks>
    </AuthCard>
  );
}
