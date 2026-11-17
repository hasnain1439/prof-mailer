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
  Button,
  Card,
  EmailStatusBadge,
  EmptyState,
  ErrorBox,
  Modal,
  Mono,
  Notice,
  PageHeader,
  ProfessorStatusBadge,
  Select,
  Skeleton,
  TypeChip,
  btnPrimary,
  btnSmall,
  link,
  professorStatusLabel,
} from "@/components/ui";

/** One key/value row of the profile panel. */
function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 border-b border-border px-4 py-2 last:border-b-0">
      <dt className="text-xs leading-5 font-medium text-muted">{name}</dt>
      <dd className="min-w-0 text-[13px] leading-5 break-words whitespace-pre-wrap text-text">{children || <span className="text-muted">—</span>}</dd>
    </div>
  );
}

function MessageBlock({ e, sender, onChanged }: { e: Email; sender: string | null; onChanged: () => void }) {
  const cancelled = e.status === "CANCELLED";
  const showActions = e.status === "SCHEDULED" || e.status === "FAILED" || e.status === "CANCELLED";
  return (
    <li className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg px-3 py-2">
        <EmailStatusBadge status={e.status} />
        <TypeChip followUpNo={e.followUpNo} />
        {e.isHtml && <HtmlBadge />}
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          {e.status === "SENT" ? (
            <span>
              Sent <Mono className="!text-xs text-text">{formatKarachi(e.sentAt)}</Mono>
            </span>
          ) : (
            <span>
              {cancelled ? "Was scheduled" : "Scheduled"} <Mono className="!text-xs text-text">{formatKarachi(e.scheduledAt)}</Mono>
            </span>
          )}
          {e.status === "SENT" && sender && (
            <span>
              From <Mono className="!text-xs">{sender}</Mono>
            </span>
          )}
        </div>
      </div>
      <div className="px-4 py-3">
        <p className={`text-sm font-semibold ${cancelled ? "text-muted line-through" : "text-text"}`}>{e.subject}</p>
        <div className="mt-2">
          {e.isHtml ? (
            <EmailBody body={e.body} isHtml title={`Email: ${e.subject}`} />
          ) : (
            <EmailBody body={e.body} isHtml={false} textClassName={cancelled ? "text-muted" : "text-text"} />
          )}
        </div>
        {e.status === "FAILED" && e.error && (
          <Notice tone="error" className="mt-3">
            {e.error}
          </Notice>
        )}
      </div>
      {showActions && (
        <div className="border-t border-border px-4 py-2">
          <EmailActions email={e} onChanged={onChanged} />
        </div>
      )}
    </li>
  );
}

function ReplyMarker({ name, at }: { name: string; at: string }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-border bg-replied-bg px-3 py-2 text-[13px] text-replied-fg">
      <IconReply />
      <span className="font-medium">{name} replied</span>
      <Mono className="!text-xs">{formatKarachi(at)}</Mono>
      <span className="text-xs">· read the reply in your Gmail inbox</span>
    </li>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-4 space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
        <Skeleton className="h-72 rounded-md" />
        <Skeleton className="h-72 rounded-md" />
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
      <Link href="/professors" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-text">
        <IconArrowLeft size={14} />
        Professors
      </Link>
      <ErrorBox error={error} onRetry={reload} />
      <ErrorBox error={actionError} />
      {loading && !prof && <DetailSkeleton />}

      {prof && (
        <>
          <PageHeader
            title={
              <span className="flex flex-wrap items-center gap-2">
                {prof.name}
                <ProfessorStatusBadge status={prof.status} />
              </span>
            }
            description={
              <>
                {prof.university}
                {prof.country && ` · ${prof.country}`}
              </>
            }
          >
            <Select aria-label="Status" className="!w-auto" value={prof.status} onChange={(e) => changeStatus(e.target.value as ProfessorStatus)}>
              {PROFESSOR_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {professorStatusLabel(s)}
                </option>
              ))}
            </Select>
            <Button onClick={() => setEditing(true)}>
              <IconPencil size={14} />
              Edit
            </Button>
            <Button variant="danger" onClick={remove}>
              <IconTrash size={14} />
              Delete
            </Button>
          </PageHeader>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[22rem_1fr]">
            <Card title="Profile" flush className="lg:sticky lg:top-4">
              <dl>
                <Row name="Email">
                  <a href={`mailto:${prof.email}`} className={`${link} font-mono text-[13px] font-normal break-all`}>
                    {prof.email}
                  </a>
                </Row>
                <Row name="University">{prof.university}</Row>
                <Row name="Country">{prof.country}</Row>
                <Row name="Profile">
                  {prof.profileUrl && (
                    <a
                      href={prof.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`${link} inline-flex items-center gap-1 font-mono text-[13px] font-normal break-all`}
                    >
                      {prof.profileUrl.replace(/^https?:\/\//, "")}
                      <IconExternal size={12} className="shrink-0" />
                    </a>
                  )}
                </Row>
                <Row name="Research focus">{prof.researchFocus}</Row>
                <Row name="Why I fit">{prof.whyFits}</Row>
                <Row name="Notes">{prof.notes}</Row>
                <Row name="Added">
                  <Mono>{formatKarachi(prof.createdAt)}</Mono>
                </Row>
              </dl>
            </Card>

            <section className="min-w-0">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-text">Conversation</h2>
                <p className="text-xs text-muted">
                  <Mono className="!text-xs">{prof.emails.length}</Mono> email{prof.emails.length === 1 ? "" : "s"}
                  {sender && (
                    <>
                      {" "}
                      · from <Mono className="!text-xs">{sender}</Mono>
                    </>
                  )}
                </p>
              </div>
              {prof.emails.length === 0 ? (
                <div className="rounded-md border border-border bg-surface">
                  <EmptyState
                    compact
                    icon={<IconInbox />}
                    title="No emails yet"
                    action={
                      <Link href="/import" className={`${btnPrimary} ${btnSmall}`}>
                        <IconUpload size={14} />
                        Schedule via import
                      </Link>
                    }
                  >
                    Emails to {prof.name} will show up here in order.
                  </EmptyState>
                </div>
              ) : (
                <ol className="space-y-3">
                  {prof.emails.map((e) => (
                    <FragmentWithReply key={e.id} e={e} name={prof.name} sender={sender} onChanged={reload} />
                  ))}
                </ol>
              )}
            </section>
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
      <MessageBlock e={e} sender={sender} onChanged={onChanged} />
      {e.repliedAt && <ReplyMarker name={name} at={e.repliedAt} />}
    </>
  );
}
