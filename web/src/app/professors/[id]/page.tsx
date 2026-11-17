import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { ProfessorDetail } from "./ProfessorDetail";

export default function ProfessorPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ProfessorDetail />
    </Suspense>
  );
}
