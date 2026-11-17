import type { Metadata } from "next";
import { SignupPanel } from "./SignupPanel";

export const metadata: Metadata = {
  title: "Create an account · prof-mailer",
};

export default function SignupPage() {
  return <SignupPanel />;
}
