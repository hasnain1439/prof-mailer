import type { Metadata } from "next";
import { ForgotPasswordPanel } from "./ForgotPasswordPanel";

export const metadata: Metadata = {
  title: "Reset password · ApplyReach",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordPanel />;
}
