import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { ProfessorDetail } from "@/app/professors/[id]/ProfessorDetail";

export default function CompanyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ProfessorDetail />
    </Suspense>
  );
}
