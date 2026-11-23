import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginCard, LoginPanel } from "./LoginPanel";

export const metadata: Metadata = {
  title: "Sign in · ApplyReach",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginCard interactive={false} />}>
      <LoginPanel />
    </Suspense>
  );
}
