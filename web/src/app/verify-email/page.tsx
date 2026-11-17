import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmailPanel, VerifyingCard } from "./VerifyEmailPanel";

export const metadata: Metadata = {
  title: "Verify email · prof-mailer",
};

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyingCard />}>
      <VerifyEmailPanel />
    </Suspense>
  );
}
