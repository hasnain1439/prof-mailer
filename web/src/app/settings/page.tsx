"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import type { CvInfo, CvSlot, SettingsInput, SettingsResponse, Template } from "@/lib/types";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/components/Auth";
import { useGmailStatus } from "@/components/GmailStatus";
import { IconCheck, IconDownload, IconFile, IconTrash, IconUpload } from "@/components/icons";
import { DocumentsCard } from "@/components/Documents";
import { SenderProfileCard } from "@/components/SenderProfile";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, ErrorBox, Loading, Mono, Notice, PageHeader, Select, Skeleton, btnSecondary, btnSmall, input, link } from "@/components/ui";

function SettingsForm({ initial, onSaved }: { initial: SettingsResponse; onSaved: (s: SettingsResponse) => void }) {
  const toast = useToast();
  const templates = useApi(() => api.listTemplates(true));
  const [form, setForm] = useState({
    followUpAfterDays: String(initial.followUpAfterDays),
    maxFollowUps: String(initial.maxFollowUps),
    dailySendLimit: String(initial.dailySendLimit),
    followUpTemplateId: initial.followUpTemplateId ?? "",
    companyFollowUpTemplateId: initial.companyFollowUpTemplateId ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const body: SettingsInput = {
        followUpAfterDays: Number(form.followUpAfterDays),
        maxFollowUps: Number(form.maxFollowUps),
        dailySendLimit: Number(form.dailySendLimit),
        followUpTemplateId: form.followUpTemplateId || null,
        companyFollowUpTemplateId: form.companyFollowUpTemplateId || null,
      };
      const res = await api.putSettings(body);
      setSaved(true);
      toast("Settings saved.");
      onSaved(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const num = (k: "followUpAfterDays" | "maxFollowUps" | "dailySendLimit", title: string, min: number, max: number, help: string, suffix: string) => (
    <FieldRow label={title} htmlFor={`s-${k}`} hint={help}>
      <div className="flex items-center gap-2">
        <input
          id={`s-${k}`}
          type="number"
          required
          min={min}
          max={max}
          step={1}
          className={`${input} !w-28 font-mono tabular-nums`}
          value={form[k]}
          onChange={(e) => {
            setSaved(false);
            setForm({ ...form, [k]: e.target.value });
          }}
        />
        <span className="text-xs text-muted">{suffix}</span>
      </div>
    </FieldRow>
  );

  const noFollowUps = templates.data && templates.data.length === 0;

  return (
    <form onSubmit={submit}>
      <div className="px-4">
        {error && (
          <div className="pt-4">
            <ErrorBox error={error} />
          </div>
        )}
        <Section title="Sending" description="Caps how many emails go out per Karachi calendar day.">
          {num("dailySendLimit", "Daily send limit", 1, 50, "Max 50 per day", "emails")}
        </Section>
        <Section title="Follow-ups" description="Automatically nudge contacts who haven't replied.">
          {num("followUpAfterDays", "Follow up after", 1, 60, "1–60 days without a reply", "days")}
          {num("maxFollowUps", "Max follow-ups", 0, 10, "0–10 per contact (0 disables)", "per contact")}
          <FieldRow
            label="Follow-up template"
            htmlFor="s-tpl"
            hint={
              <>
                {templates.error && <span className="block text-failed-fg">Could not load templates: {templates.error}</span>}
                {noFollowUps ? (
                  <span className="text-replied-fg">
                    You have no follow-up templates yet.{" "}
                    <Link href="/templates" className={link}>
                      Create one
                    </Link>{" "}
                    and tick “Follow-up template”.
                  </span>
                ) : (
                  "Used for professors. Only templates marked as follow-up are listed."
                )}
              </>
            }
          >
            <TemplateSelect
              id="s-tpl"
              templates={templates.data}
              value={form.followUpTemplateId}
              emptyLabel="None"
              onChange={(v) => {
                setSaved(false);
                setForm({ ...form, followUpTemplateId: v });
              }}
            />
          </FieldRow>
          <FieldRow
            label="Company follow-up template"
            htmlFor="s-ctpl"
            hint="Used for companies (job applications). If empty, the follow-up template above is used."
          >
            <TemplateSelect
              id="s-ctpl"
              templates={templates.data}
              value={form.companyFollowUpTemplateId}
              emptyLabel="Same as above"
              onChange={(v) => {
                setSaved(false);
                setForm({ ...form, companyFollowUpTemplateId: v });
              }}
            />
          </FieldRow>
        </Section>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-border px-4 py-3">
        {saved && (
          <span className="inline-flex items-center gap-1 text-[13px] text-sent-fg">
            <IconCheck size={14} />
            Saved
          </span>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}

function TemplateSelect({
  id,
  templates,
  value,
  emptyLabel,
  onChange,
}: {
  id: string;
  templates: Template[] | null | undefined;
  value: string;
  emptyLabel: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select id={id} className="max-w-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {(templates ?? []).map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
          {t.attachCv ? " (attaches CV)" : ""}
        </option>
      ))}
      {value && templates && !templates.some((t) => t.id === value) && <option value={value}>(unknown template)</option>}
    </Select>
  );
}

const CV_MAX_BYTES = 4 * 1024 * 1024;
const CV_EXT = /\.(pdf|docx?)$/i;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const SLOT_COPY: Record<CvSlot, { title: string; hint: string }> = {
  professor: { title: "CV for professors", hint: "Attached to emails to professors, e.g. your Europass or academic CV." },
  company: { title: "CV for job applications", hint: "Attached to emails to companies." },
  general: { title: "General CV", hint: "Used when the CV for that contact type is missing." },
};

/** One CV slot: upload / replace / download / remove. */
function CvSlotRow({ slot, info, onChanged }: { slot: CvSlot; info: CvInfo | null; onChanged: (cv: CvInfo | null) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"upload" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const copy = SLOT_COPY[slot];

  async function upload(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setError(null);
    if (!CV_EXT.test(file.name)) {
      setError(`"${file.name}" isn't a PDF, DOC or DOCX file.`);
      return;
    }
    if (file.size === 0) {
      setError(`"${file.name}" is empty.`);
      return;
    }
    if (file.size > CV_MAX_BYTES) {
      setError(`"${file.name}" is ${formatBytes(file.size)}; the limit is 4 MB.`);
      return;
    }
    setBusy("upload");
    try {
      const res = await api.uploadCv(file, slot);
      onChanged(res.cv);
      toast(info ? `${copy.title} replaced.` : `${copy.title} uploaded.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove your ${copy.title.toLowerCase()}?`)) return;
    setError(null);
    setBusy("delete");
    try {
      await api.deleteCv(slot);
      onChanged(null);
      toast(`${copy.title} removed.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0">
      <p className="text-[13px] font-semibold text-text">{copy.title}</p>
      <p className="mb-2 text-xs text-muted">{copy.hint}</p>
      <ErrorBox error={error} />
      <div className="flex flex-wrap items-center gap-3">
        {info ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-bg text-muted">
              <IconFile />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-text" title={info.filename}>
                {info.filename}
              </p>
              <p className="text-xs text-muted">
                <Mono className="!text-xs">{formatBytes(info.size)}</Mono> · updated <Mono className="!text-xs">{formatKarachi(info.updatedAt)}</Mono>
              </p>
            </div>
          </div>
        ) : (
          <p className="flex-1 text-[13px] text-muted">Not uploaded.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {info && (
            <a href={api.cvDownloadUrl(slot)} download className={`${btnSecondary} ${btnSmall}`}>
              <IconDownload size={14} />
              Download
            </a>
          )}
          <Button size="sm" variant={info ? "secondary" : "primary"} disabled={busy !== null} onClick={() => fileRef.current?.click()}>
            <IconUpload size={14} />
            {busy === "upload" ? "Uploading…" : info ? "Replace" : "Upload"}
          </Button>
          {info && (
            <Button size="sm" variant="danger" disabled={busy !== null} onClick={remove}>
              <IconTrash size={14} />
              {busy === "delete" ? "Removing…" : "Remove"}
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </div>
      </div>
    </div>
  );
}

/** CVs attached to emails whose template (or import) has "Attach my CV": one per contact type, plus a general fallback. */
function CvCard() {
  const cv = useApi(() => api.getCv());
  const [overrides, setOverrides] = useState<Partial<Record<CvSlot, CvInfo | null>>>({});
  const get = (slot: CvSlot): CvInfo | null => (slot in overrides ? overrides[slot]! : (cv.data?.cvs[slot] ?? null));
  // The general slot is only shown when it holds a CV (older single-CV accounts).
  const slots: CvSlot[] = get("general") ? ["professor", "company", "general"] : ["professor", "company"];

  return (
    <Card title="CVs" description="Attached to emails with “Attach my CV”. The right CV is picked by contact type. PDF, DOC or DOCX, max 4 MB each.">
      <ErrorBox error={cv.error} onRetry={cv.reload} />
      {cv.loading && !cv.data && <Skeleton className="h-10 w-full" />}
      {cv.data &&
        slots.map((slot) => (
          <CvSlotRow key={slot} slot={slot} info={get(slot)} onChanged={(info) => setOverrides((o) => ({ ...o, [slot]: info }))} />
        ))}
    </Card>
  );
}

/** A titled group of field rows; groups are separated by a 1px rule. */
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="border-b border-border py-4 last:border-b-0">
      <h3 className="text-[13px] font-semibold text-text">{title}</h3>
      <p className="text-xs text-muted">{description}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

/** Label on the left, compact control (and hint) on the right; stacks on small screens. */
function FieldRow({ label: text, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-text sm:pt-1.5">
        {text}
      </label>
      <div className="min-w-0">
        {children}
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

function Row({ name, children }: { name: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-[13px]">
      <dt className="shrink-0 text-muted">{name}</dt>
      <dd className="min-w-0 text-right text-text">{children}</dd>
    </div>
  );
}

export default function SettingsPage() {
  const { data, error, loading, reload } = useApi(() => api.getSettings());
  const gmail = useGmailStatus();
  const { user } = useAuth();
  const [latest, setLatest] = useState<SettingsResponse | null>(null);
  const s = latest ?? data;

  return (
    <div>
      <PageHeader title="Settings" description="Send limits, follow-ups, your profile for templates and your CV. Server flags are read-only." />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && (
        <div className="grid max-w-6xl grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
          <Loading rows={5} />
          <Loading rows={4} />
        </div>
      )}
      {data && s && (
        <div className="grid max-w-6xl grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
          <div>
            <Card title="Sending and follow-ups" flush>
              <SettingsForm initial={data} onSaved={setLatest} />
            </Card>
            <SenderProfileCard />
            <CvCard />
            <DocumentsCard />
          </div>
          <div>
            <Card title="Account" description="Read-only">
              <dl className="-my-2 divide-y divide-border">
                <Row name="Signed in as">
                  <Mono className="break-all">{user?.email ?? "—"}</Mono>
                </Row>
                <Row name="Password">
                  <Link href="/forgot-password" className={link}>
                    Change password
                  </Link>
                </Row>
                <Row name="Sending from">
                  {gmail.data?.connected ? (
                    <Mono className="break-all">{gmail.data.email ?? "Connected"}</Mono>
                  ) : (
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone="replied">Not connected</Badge>
                      <Link href="/gmail" className={link}>
                        Connect
                      </Link>
                    </span>
                  )}
                </Row>
                <Row name={<Mono className="!text-xs">DRY_RUN</Mono>}>
                  {s.dryRun ? <Badge tone="replied">On: logged only</Badge> : <Badge tone="sent">Off: real sends</Badge>}
                </Row>
                <Row name="Timezone">
                  <Mono>{s.timezone}</Mono>
                </Row>
                <Row name="Sent today">
                  <Mono>
                    {s.sentToday} / {s.dailySendLimit}
                  </Mono>
                </Row>
              </dl>
            </Card>
            <Notice tone={s.dryRun ? "warning" : "info"}>
              {s.dryRun ? "No real emails are sent while DRY_RUN is on. " : ""}
              <code className="font-mono">DRY_RUN</code> is a server setting controlled by the app owner.
            </Notice>
          </div>
        </div>
      )}
    </div>
  );
}
