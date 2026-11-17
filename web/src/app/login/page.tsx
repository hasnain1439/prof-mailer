import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginCard, LoginPanel } from "./LoginPanel";

export const metadata: Metadata = {
  title: "Sign in · prof-mailer",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginCard next="/" error={null} />}>
      <LoginPanel />
    </Suspense>
  );
}
