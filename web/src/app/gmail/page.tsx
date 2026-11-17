import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { GmailPanel } from "./GmailPanel";

export default function GmailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <GmailPanel />
    </Suspense>
  );
}
