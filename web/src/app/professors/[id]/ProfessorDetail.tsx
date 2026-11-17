"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { PROFESSOR_STATUSES, type ProfessorStatus } from "@/lib/types";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { EmailActions } from "@/components/EmailActions";
import { ProfessorForm } from "@/components/ProfessorForm";
import {
  Card,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  PageHeader,
  ProfessorStatusBadge,
  EmailStatusBadge,
  btnDanger,
  btnSecondary,
  followUpLabel,
  input,
} from "@/components/ui";

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{name}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-neutral-900">{children || "—"}</dd>
    </div>
  );
}

export function ProfessorDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { data: prof, error, loading, reload } = useApi(() => api.getProfessor(id), [id]);
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function changeStatus(s: ProfessorStatus) {
    setActionError(null);
    try {
      await api.updateProfessor(id, { status: s });
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  async function remove() {
    if (!prof || !window.confirm(`Delete ${prof.name} and all their emails?`)) return;
    try {
      await api.deleteProfessor(id);
      router.push("/professors");
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  return (
    <div>
      <div className="mb-2 text-sm">
        <Link href="/professors" className="text-neutral-600 hover:underline">
          ← Professors
        </Link>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <ErrorBox error={actionError} />
      {loading && !prof && <Loading />}

      {prof && (
        <>
          <PageHeader title={prof.name}>
            <ProfessorStatusBadge status={prof.status} />
            <select
              aria-label="Status"
              className={`${input} !w-auto !py-1 text-sm`}
              value={prof.status}
              onChange={(e) => changeStatus(e.target.value as ProfessorStatus)}
            >
              {PROFESSOR_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button type="button" className={btnSecondary} onClick={() => setEditing(true)}>
              Edit
            </button>
            <button type="button" className={btnDanger} onClick={remove}>
              Delete
            </button>
          </PageHeader>

          <Card title="Profile">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field name="Email">
                <a href={`mailto:${prof.email}`} className="hover:underline">
                  {prof.email}
                </a>
              </Field>
              <Field name="University">{prof.university}</Field>
              <Field name="Country">{prof.country}</Field>
              <Field name="Profile">
                {prof.profileUrl && (
                  <a href={prof.profileUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                    {prof.profileUrl}
                  </a>
                )}
              </Field>
              <Field name="Research focus">{prof.researchFocus}</Field>
              <Field name="Added">{formatKarachi(prof.createdAt)}</Field>
              <div className="sm:col-span-2 lg:col-span-3">
                <Field name="Why I fit">{prof.whyFits}</Field>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Field name="Notes">{prof.notes}</Field>
              </div>
            </dl>
          </Card>

          <Card title={`Thread (${prof.emails.length})`}>
            {prof.emails.length === 0 ? (
              <Empty>No emails for this professor yet. Use Import to schedule one.</Empty>
            ) : (
              <ol className="space-y-4">
                {prof.emails.map((e) => (
                  <li key={e.id} className="rounded-md border border-neutral-200">
                    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-3 py-2">
                      <span className="text-xs font-semibold text-neutral-600">{followUpLabel(e.followUpNo)}</span>
                      <EmailStatusBadge status={e.status} />
                      <span className="font-medium text-neutral-900">{e.subject}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 px-3 py-2 text-xs text-neutral-600">
                      <span>Scheduled: {formatKarachi(e.scheduledAt)}</span>
                      <span>Sent: {formatKarachi(e.sentAt)}</span>
                      <span className={e.repliedAt ? "font-medium text-green-700" : undefined}>Replied: {formatKarachi(e.repliedAt)}</span>
                    </div>
                    {e.status === "FAILED" && e.error && (
                      <div className="mx-3 mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">Error: {e.error}</div>
                    )}
                    <pre className="mx-3 mb-3 whitespace-pre-wrap break-words rounded bg-neutral-50 p-3 font-sans text-sm text-neutral-800">
                      {e.body}
                    </pre>
                    {(e.status === "SCHEDULED" || e.status === "FAILED" || e.status === "CANCELLED") && (
                      <div className="px-3 pb-3">
                        <EmailActions email={e} onChanged={reload} />
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Modal open={editing} title="Edit professor" onClose={() => setEditing(false)} wide>
            {editing && (
              <ProfessorForm
                professor={prof}
                onCancel={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  reload();
                }}
              />
            )}
          </Modal>
        </>
      )}
    </div>
  );
}
