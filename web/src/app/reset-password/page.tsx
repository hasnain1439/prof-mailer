import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordCard, ResetPasswordPanel } from "./ResetPasswordPanel";

export const metadata: Metadata = {
  title: "Choose a new password · ApplyReach",
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordCard token={null} />}>
      <ResetPasswordPanel />
    </Suspense>
  );
}
