"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import { PROFESSOR_STATUSES, type Email, type ProfessorStatus } from "@/lib/types";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { EmailActions } from "@/components/EmailActions";
import { EmailBody, HtmlBadge } from "@/components/EmailBody";
import { useGmailStatus } from "@/components/GmailStatus";
import { IconArrowLeft, IconExternal, IconInbox, IconPencil, IconReply, IconTrash, IconUpload } from "@/components/icons";
import { ProfessorForm } from "@/components/ProfessorForm";
import { useToast } from "@/components/Toast";
import {
  Avatar,
  Card,
  EmailStatusBadge,
  EmptyState,
  ErrorBox,
  Modal,
  ProfessorStatusBadge,
  Skeleton,
  TypeChip,
  btnDanger,
  btnPrimary,
  btnSecondary,
  btnSmall,
  input,
  link,
  professorStatusLabel,
} from "@/components/ui";

function Field({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{name}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-fg">{children || <span className="text-subtle">—</span>}</dd>
    </div>
  );
}

const bubbleStyles: Record<Email["status"], string> = {
  SENT: "bg-primary text-primary-fg ring-primary",
  SENDING: "bg-primary-soft text-fg ring-primary-line",
  SCHEDULED: "bg-surface text-fg ring-primary-line border border-dashed border-primary-line",
  FAILED: "bg-danger-soft text-fg ring-danger-line",
  CANCELLED: "bg-surface-3 text-muted ring-line",
};

function Bubble({ e, sender, onChanged }: { e: Email; sender: string | null; onChanged: () => void }) {
  const sent = e.status === "SENT";
  const when =
    e.status === "SENT" ? `Sent ${formatKarachi(e.sentAt)}` : e.status === "CANCELLED" ? `Was scheduled ${formatKarachi(e.scheduledAt)}` : `Scheduled ${formatKarachi(e.scheduledAt)}`;
  return (
    <li className="flex flex-col items-end">
      <div className="mb-1 flex flex-wrap items-center justify-end gap-2 text-xs text-muted">
        <TypeChip followUpNo={e.followUpNo} />
        {e.isHtml && <HtmlBadge />}
        <EmailStatusBadge status={e.status} />
        <span>{when}</span>
      </div>
      <div className={`w-full max-w-[42rem] rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm ring-1 ${bubbleStyles[e.status]}`}>
        <p className={`text-sm font-semibold ${sent ? "text-primary-fg" : e.status === "CANCELLED" ? "line-through" : "text-fg"}`}>{e.subject}</p>
        {e.isHtml ? (
          <div className="mt-2">
            <EmailBody body={e.body} isHtml title={`Email: ${e.subject}`} />
          </div>
        ) : (
          <EmailBody body={e.body} isHtml={false} className="mt-2" textClassName={sent ? "text-primary-fg/90" : ""} />
        )}
        {sent && sender && <p className="mt-3 text-[11px] text-primary-fg/75">From {sender}</p>}
      </div>
      {e.status === "FAILED" && e.error && (
        <div className="mt-1.5 w-full max-w-[42rem] rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-fg ring-1 ring-danger-line">Error: {e.error}</div>
      )}
      {(e.status === "SCHEDULED" || e.status === "FAILED" || e.status === "CANCELLED") && (
        <div className="mt-2">
          <EmailActions email={e} onChanged={onChanged} />
        </div>
      )}
    </li>
  );
}

function ReplyMarker({ name, at }: { name: string; at: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <Avatar name={name} size="sm" />
      <div className="rounded-2xl rounded-tl-sm bg-success-soft px-4 py-3 text-sm text-success-fg shadow-sm ring-1 ring-success-line">
        <p className="flex items-center gap-1.5 font-semibold">
          <IconReply size={14} />
          {name} replied
        </p>
        <p className="mt-0.5 text-xs text-success-fg">{formatKarachi(at)} · read the reply in your Gmail inbox</p>
      </div>
    </li>
  );
}

function DetailSkeleton() {
  return (
    <div>
      <div className="mb-5 flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[20rem_1fr]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

export function ProfessorDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const toast = useToast();
  const gmail = useGmailStatus();
  const { data: prof, error, loading, reload } = useApi(() => api.getProfessor(id), [id]);
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function changeStatus(s: ProfessorStatus) {
    setActionError(null);
    try {
      await api.updateProfessor(id, { status: s });
      toast(`Status set to ${professorStatusLabel(s)}.`);
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  async function remove() {
    if (!prof || !window.confirm(`Delete ${prof.name} and all their emails?`)) return;
    try {
      await api.deleteProfessor(id);
      toast(`${prof.name} deleted.`);
      router.push("/professors");
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  const sender = gmail.data?.connected ? gmail.data.email : null;

  return (
    <div>
      <Link href="/professors" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <IconArrowLeft size={15} />
        Professors
      </Link>
      <ErrorBox error={error} onRetry={reload} />
      <ErrorBox error={actionError} />
      {loading && !prof && <DetailSkeleton />}

      {prof && (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-4">
            <Avatar name={prof.name} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-fg">{prof.name}</h1>
                <ProfessorStatusBadge status={prof.status} />
              </div>
              <p className="mt-0.5 text-sm text-muted">
                {prof.university}
                {prof.country && ` · ${prof.country}`} ·{" "}
                <a href={`mailto:${prof.email}`} className="hover:text-fg hover:underline">
                  {prof.email}
                </a>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Status"
                className={`${input} !w-auto`}
                value={prof.status}
                onChange={(e) => changeStatus(e.target.value as ProfessorStatus)}
              >
                {PROFESSOR_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {professorStatusLabel(s)}
                  </option>
                ))}
              </select>
              <button type="button" className={btnSecondary} onClick={() => setEditing(true)}>
                <IconPencil size={15} />
                Edit
              </button>
              <button type="button" className={btnDanger} onClick={remove}>
                <IconTrash size={15} />
                Delete
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[20rem_1fr]">
            <Card title="Profile" className="lg:sticky lg:top-6">
              <dl className="space-y-4">
                <Field name="Email">
                  <a href={`mailto:${prof.email}`} className={link}>
                    {prof.email}
                  </a>
                </Field>
                <Field name="University">{prof.university}</Field>
                <Field name="Country">{prof.country}</Field>
                <Field name="Profile">
                  {prof.profileUrl && (
                    <a href={prof.profileUrl} target="_blank" rel="noreferrer" className={`${link} inline-flex items-center gap-1 break-all`}>
                      {prof.profileUrl.replace(/^https?:\/\//, "")}
                      <IconExternal size={12} />
                    </a>
                  )}
                </Field>
                <Field name="Research focus">{prof.researchFocus}</Field>
                <Field name="Why I fit">{prof.whyFits}</Field>
                <Field name="Notes">{prof.notes}</Field>
                <Field name="Added">{formatKarachi(prof.createdAt)}</Field>
              </dl>
            </Card>

            <Card
              title="Conversation"
              description={`${prof.emails.length} email${prof.emails.length === 1 ? "" : "s"}${sender ? ` · from ${sender}` : ""}`}
            >
              {prof.emails.length === 0 ? (
                <EmptyState
                  compact
                  icon={<IconInbox size={20} />}
                  title="No emails yet"
                  action={
                    <Link href="/import" className={`${btnPrimary} ${btnSmall}`}>
                      <IconUpload size={14} />
                      Schedule via Import
                    </Link>
                  }
                >
                  Emails to {prof.name} will show up here as a conversation.
                </EmptyState>
              ) : (
                <ol className="space-y-6">
                  {prof.emails.map((e) => (
                    <FragmentWithReply key={e.id} e={e} name={prof.name} sender={sender} onChanged={reload} />
                  ))}
                </ol>
              )}
            </Card>
          </div>

          <Modal open={editing} title="Edit professor" onClose={() => setEditing(false)} wide>
            {editing && (
              <ProfessorForm
                professor={prof}
                onCancel={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  toast("Professor saved.");
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

function FragmentWithReply({ e, name, sender, onChanged }: { e: Email; name: string; sender: string | null; onChanged: () => void }) {
  return (
    <>
      <Bubble e={e} sender={sender} onChanged={onChanged} />
      {e.repliedAt && <ReplyMarker name={name} at={e.repliedAt} />}
    </>
  );
}
