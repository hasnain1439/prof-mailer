"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Template } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { EmailBody } from "@/components/EmailBody";
import { IconEye, IconFile, IconPaperclip, IconPencil, IconPlus, IconTemplate, IconTrash, IconUpload, IconX } from "@/components/icons";
import { MAX_HTML_UPLOAD_BYTES, PROFESSIONAL_LAYOUT, extractHtmlTitle } from "@/lib/emailLayout";
import { useToast } from "@/components/Toast";
import {
  Badge,
  Button,
  Card,
  CvClip,
  EmptyCard,
  ErrorBox,
  Field,
  Input,
  Mono,
  Notice,
  PageHeader,
  Select,
  Table,
  TableSkeleton,
  Td,
  Th,
  btnSecondary,
  btnSmall,
  input,
  label,
  link,
  textareaCls,
  tr,
} from "@/components/ui";

const PLACEHOLDERS = [
  { key: "{{name}}", help: "Contact's name (professor, recruiter or hiring team)" },
  { key: "{{university}}", help: "University (for companies: the company name)" },
  { key: "{{company}}", help: "Company name (same value as {{university}})" },
  { key: "{{role}}", help: "Job title (companies)" },
  { key: "{{jobUrl}}", help: "Job posting link (companies)" },
  { key: "{{researchFocus}}", help: "Research focus (companies: skills / stack)" },
  { key: "{{whyFits}}", help: "Why you fit their group or role" },
  { key: "{{myName}}", help: "Your name (Settings → Your profile)" },
  { key: "{{myTitle}}", help: "Your title, e.g. Full Stack Developer" },
  { key: "{{mySummary}}", help: "Your experience paragraph" },
  { key: "{{myEducation}}", help: "Your degree and university" },
  { key: "{{myEmail}}", help: "Your contact email (defaults to your Gmail)" },
  { key: "{{myPhone}}", help: "Your phone" },
  { key: "{{myLinkedIn}}", help: "Your LinkedIn URL" },
  { key: "{{myPortfolio}}", help: "Your portfolio or GitHub URL" },
];

interface Draft {
  id: string | null;
  name: string;
  subject: string;
  body: string;
  isFollowUp: boolean;
  isHtml: boolean;
  attachCv: boolean;
  attachFileIds: string[];
  cc: string;
  bcc: string;
  trackOpens: boolean;
}

const emptyDraft: Draft = {
  id: null,
  name: "",
  subject: "",
  body: "",
  isFollowUp: false,
  isHtml: false,
  attachCv: false,
  attachFileIds: [],
  cc: "",
  bcc: "",
  trackOpens: false,
};

function TemplateEditor({
  draft,
  hasCv,
  onSaved,
  onCancel,
}: {
  draft: Draft;
  /** null while unknown (loading or the CV endpoint failed) */
  hasCv: boolean | null;
  onSaved: (t: Template) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocused = useRef<"subject" | "body">("body");
  const htmlFile = useRef<HTMLInputElement>(null);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const docs = useApi(() => api.listFiles(), []);

  function loadHtmlFile(file: File | undefined) {
    if (htmlFile.current) htmlFile.current.value = "";
    if (!file) return;
    setFileNote(null);
    if (!/\.html?$/i.test(file.name)) {
      setError(`"${file.name}" isn't an .html or .htm file.`);
      return;
    }
    if (file.size > MAX_HTML_UPLOAD_BYTES) {
      setError(`"${file.name}" is ${(file.size / 1024).toFixed(0)} KB; the limit is 500 KB.`);
      return;
    }
    if (form.body.trim() && !window.confirm("Replace the current body with the uploaded file?")) return;
    const subjectEmpty = !form.subject.trim();
    const reader = new FileReader();
    reader.onload = () => {
      const html = String(reader.result ?? "");
      const title = extractHtmlTitle(html);
      setError(null);
      setForm((f) => ({ ...f, body: html, isHtml: true, subject: f.subject.trim() ? f.subject : (title ?? f.subject) }));
      setFileNote(`Loaded ${file.name}${title && subjectEmpty ? " (subject taken from its <title>)" : ""}.`);
    };
    reader.onerror = () => setError(`Could not read "${file.name}".`);
    reader.readAsText(file);
  }

  function applyLayout() {
    if (form.body.trim() && !window.confirm("Replace the current body with the professional layout?")) return;
    setFileNote(null);
    setForm((f) => ({ ...f, body: PROFESSIONAL_LAYOUT, isHtml: true }));
  }

  function insert(token: string) {
    const field = lastFocused.current;
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    const current = form[field];
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    setForm((f) => ({ ...f, [field]: next }));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        subject: form.subject,
        body: form.body,
        isFollowUp: form.isFollowUp,
        isHtml: form.isHtml,
        attachCv: form.attachCv,
        attachFileIds: form.attachFileIds,
        cc: form.cc.trim() || null,
        bcc: form.bcc.trim() || null,
        trackOpens: form.isHtml && form.trackOpens,
      };
      const saved = form.id ? await api.updateTemplate(form.id, body) : await api.createTemplate(body);
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorBox error={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Name *" htmlFor="t-name">
          <Input id="t-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <label className="flex h-8 cursor-pointer items-center gap-2 text-[13px] text-text">
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={form.isFollowUp}
            onChange={(e) => setForm({ ...form, isFollowUp: e.target.checked })}
          />
          Follow-up template
        </label>
      </div>
      <div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-text">
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={form.attachCv}
            onChange={(e) => setForm({ ...form, attachCv: e.target.checked })}
          />
          <IconPaperclip size={14} className="text-muted" />
          Attach my CV
        </label>
        {form.attachCv && hasCv === false && (
          <p className="mt-1 text-xs text-replied-fg">
            You haven&apos;t uploaded a CV yet. Emails that need it will fail until you{" "}
            <Link href="/settings" className={link}>
              upload one in Settings
            </Link>
            .
          </p>
        )}
        {!form.attachCv && <p className="mt-1 text-xs text-muted">Useful for job applications: the CV from Settings is attached to every email from this template.</p>}
      </div>
      {docs.data && docs.data.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted">Also attach</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {docs.data.map((d) => (
              <label key={d.id} className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-text">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent"
                  checked={form.attachFileIds.includes(d.id)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      attachFileIds: e.target.checked ? [...form.attachFileIds, d.id] : form.attachFileIds.filter((x) => x !== d.id),
                    })
                  }
                />
                {d.label}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="CC (optional)" htmlFor="t-cc" hint="Comma-separated, e.g. a lab assistant. Import rows can override it.">
          <Input id="t-cc" placeholder="name@lab.edu" value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} />
        </Field>
        <Field label="BCC (optional)" htmlFor="t-bcc" hint="Hidden copy, e.g. your own address for records.">
          <Input id="t-bcc" placeholder="me@example.com" value={form.bcc} onChange={(e) => setForm({ ...form, bcc: e.target.value })} />
        </Field>
      </div>
      <Field label="Subject *" htmlFor="t-subject">
        <input
          id="t-subject"
          ref={subjectRef}
          className={input}
          required
          value={form.subject}
          onFocus={() => (lastFocused.current = "subject")}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2 border-y border-border py-3">
        <span className="text-xs font-medium text-muted">Format</span>
        <div className="inline-flex rounded-md border border-border bg-bg p-0.5" role="radiogroup" aria-label="Body format">
          {[
            { v: false, l: "Plain text" },
            { v: true, l: "HTML" },
          ].map((o) => (
            <button
              key={o.l}
              type="button"
              role="radio"
              aria-checked={form.isHtml === o.v}
              onClick={() => setForm((f) => ({ ...f, isHtml: o.v }))}
              className={`h-6 rounded-sm border px-2.5 text-xs font-medium transition-colors ${
                form.isHtml === o.v ? "border-border bg-surface text-text" : "border-transparent text-muted hover:text-text"
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" onClick={() => htmlFile.current?.click()}>
            <IconUpload size={14} />
            Upload .html file
          </Button>
          <Button size="sm" onClick={applyLayout}>
            <IconFile size={14} />
            Start from professional layout
          </Button>
          <input
            ref={htmlFile}
            type="file"
            accept=".html,.htm,text/html"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => loadHtmlFile(e.target.files?.[0])}
          />
        </div>
        <p className="w-full text-xs text-muted">
          A simple, personal-looking email usually gets more replies than a heavily designed one. Keep the HTML light.
        </p>
        {fileNote && <p className="w-full text-xs text-sent-fg">{fileNote}</p>}
        {form.isHtml && (
          <label className="flex w-full cursor-pointer items-start gap-2 text-[13px] text-text">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-accent"
              checked={form.trackOpens}
              onChange={(e) => setForm({ ...form, trackOpens: e.target.checked })}
            />
            <span>
              Track opens
              <span className="block text-xs text-muted">
                Adds an invisible image to see when the email was opened. Approximate (many clients block images, Gmail may pre-load them)
                and it can make emails more likely to be filtered, so leave it off for professors.
              </span>
            </span>
          </label>
        )}
      </div>
      <div className={form.isHtml ? "grid grid-cols-1 gap-4 xl:grid-cols-2" : ""}>
        <Field label={form.isHtml ? "HTML body *" : "Body *"} htmlFor="t-body">
          <textarea
            id="t-body"
            ref={bodyRef}
            required
            rows={form.isHtml ? 18 : 12}
            spellCheck={!form.isHtml}
            className={`${textareaCls} leading-relaxed ${form.isHtml ? "!bg-bg font-mono !text-xs" : ""}`}
            value={form.body}
            onFocus={() => (lastFocused.current = "body")}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
        </Field>
        {form.isHtml && (
          <div>
            <p className={label}>Live preview (placeholders shown unfilled)</p>
            <EmailBody body={form.body} isHtml height={372} title="Template live preview" />
          </div>
        )}
      </div>
      <div>
        <p className="mb-1.5 text-xs text-muted">Placeholders: click to insert at the cursor in the subject or body.</p>
        <div className="flex flex-wrap gap-1.5">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              title={p.help}
              className="h-6 rounded-md border border-border bg-bg px-2 font-mono text-xs text-text transition-colors hover:border-accent hover:text-accent"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(p.key)}
            >
              {p.key}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : form.id ? "Save template" : "Create template"}
        </Button>
      </div>
    </form>
  );
}

function TemplatePreview({ template }: { template: Template }) {
  const professors = useApi(() => api.listProfessors());
  const [professorId, setProfessorId] = useState("");
  const [result, setResult] = useState<{ subject: string; body: string; isHtml: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!professorId) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.previewTemplate(template.id, professorId));
    } catch (e) {
      setResult(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ErrorBox error={professors.error} onRetry={professors.reload} />
      {professors.data && professors.data.length === 0 && (
        <p className="text-[13px] text-muted">
          Add or{" "}
          <Link href="/import" className={link}>
            import
          </Link>{" "}
          a contact to preview this template with real data.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <Field label="Preview for contact" htmlFor="pv-prof">
            <Select id="pv-prof" value={professorId} onChange={(e) => setProfessorId(e.target.value)}>
              <option value="">Choose a contact…</option>
              {(professors.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.kind === "COMPANY" && p.role ? `${p.university} · ${p.role}` : p.university})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button variant="primary" disabled={!professorId || busy} onClick={run}>
          <IconEye />
          {busy ? "Rendering…" : "Preview"}
        </Button>
      </div>
      <ErrorBox error={error} />
      {result && (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="border-b border-border bg-bg px-3 py-2 text-[13px]">
            <span className="text-muted">Subject: </span>
            <span className="font-medium text-text">{result.subject}</span>
          </div>
          <div className={result.isHtml ? "p-2" : "p-4"}>
            <EmailBody body={result.body} isHtml={!!result.isHtml} textClassName="text-text" title="Rendered email preview" />
          </div>
        </div>
      )}
    </div>
  );
}

const outlineBadge = "border border-border bg-surface text-muted";

export default function TemplatesPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi(() => api.listTemplates());
  const settings = useApi(() => api.getSettings());
  const cv = useApi(() => api.getCv());
  const hasCv = cv.data ? cv.data.cv !== null : null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [previewing, setPreviewing] = useState<Template | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function remove(t: Template) {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    setActionError(null);
    try {
      await api.deleteTemplate(t.id);
      if (previewing?.id === t.id) setPreviewing(null);
      toast(`Template "${t.name}" deleted.`);
      reload();
      settings.reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  function startNew(isFollowUp = false) {
    setPreviewing(null);
    setDraft({ ...emptyDraft, isFollowUp });
  }

  const followUpId = settings.data?.followUpTemplateId ?? null;
  const companyFollowUpId = settings.data?.companyFollowUpTemplateId ?? null;
  const missingCv = hasCv === false && (data ?? []).some((t) => t.attachCv);
  const initial = data?.filter((t) => !t.isFollowUp) ?? [];
  const followUps = data?.filter((t) => t.isFollowUp) ?? [];

  const rows = [...initial, ...followUps];
  const noFollowUpSelected = !!settings.data && followUps.length > 0 && !followUps.some((t) => t.id === followUpId);

  const renderRow = (t: Template) => (
    <tr key={t.id} className={tr}>
      <Td className="max-w-64">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium" title={t.name}>
            {t.name}
          </span>
          {t.attachCv && <CvClip />}
        </span>
      </Td>
      <Td className="max-w-md">
        <span className="block truncate text-muted" title={t.subject}>
          {t.subject}
        </span>
      </Td>
      <Td>
        <div className="flex flex-wrap items-center gap-1.5">
          {t.isFollowUp ? <Badge tone="scheduled">Follow-up</Badge> : <Badge className={outlineBadge}>Initial</Badge>}
          {t.isHtml && <Badge className={`${outlineBadge} font-mono`}>HTML</Badge>}
          {t.isFollowUp && t.id === followUpId && <Badge tone="sent">Used for follow-ups</Badge>}
          {t.isFollowUp && t.id === companyFollowUpId && <Badge tone="sent">Company follow-ups</Badge>}
        </div>
      </Td>
      <Td className="text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(null);
              setPreviewing(t);
            }}
          >
            <IconEye size={14} />
            Preview
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPreviewing(null);
              setDraft({
                id: t.id,
                name: t.name,
                subject: t.subject,
                body: t.body,
                isFollowUp: t.isFollowUp,
                isHtml: !!t.isHtml,
                attachCv: !!t.attachCv,
                attachFileIds: t.attachFileIds ?? [],
                cc: t.cc ?? "",
                bcc: t.bcc ?? "",
                trackOpens: !!t.trackOpens,
              });
            }}
          >
            <IconPencil size={14} />
            Edit
          </Button>
          <Button size="sm" variant="ghost" className="!text-failed-fg hover:!bg-failed-bg" aria-label={`Delete ${t.name}`} onClick={() => remove(t)}>
            <IconTrash size={14} />
            Delete
          </Button>
        </div>
      </Td>
    </tr>
  );

  return (
    <div>
      <PageHeader title="Templates" description="Reusable emails with placeholders like {{name}} that are filled in for each contact.">
        <Button variant="primary" onClick={() => startNew()}>
          <IconPlus />
          New template
        </Button>
      </PageHeader>

      <ErrorBox error={error} onRetry={reload} />
      <ErrorBox error={actionError} />

      {draft && (
        <Card
          title={draft.id ? `Edit "${draft.name}"` : draft.isFollowUp ? "New follow-up template" : "New template"}
          actions={
            <Button size="sm" variant="ghost" aria-label="Close editor" onClick={() => setDraft(null)}>
              <IconX />
            </Button>
          }
        >
          <TemplateEditor
            key={draft.id ?? `new-${draft.isFollowUp}`}
            draft={draft}
            hasCv={hasCv}
            onCancel={() => setDraft(null)}
            onSaved={(t) => {
              toast(draft.id ? `Template "${t.name}" saved.` : `Template "${t.name}" created.`);
              setDraft(null);
              reload();
            }}
          />
        </Card>
      )}

      {previewing && (
        <Card
          title={`Preview: ${previewing.name}`}
          actions={
            <Button size="sm" onClick={() => setPreviewing(null)}>
              Close
            </Button>
          }
        >
          <TemplatePreview key={previewing.id} template={previewing} />
        </Card>
      )}

      {loading && !data && <TableSkeleton rows={4} cols={4} />}
      {data &&
        (data.length === 0 ? (
          !draft && (
            <EmptyCard
              icon={<IconTemplate size={20} />}
              title="No templates yet"
              action={
                <>
                  <Button variant="primary" onClick={() => startNew(false)}>
                    Create initial email
                  </Button>
                  <Button onClick={() => startNew(true)}>Create follow-up</Button>
                </>
              }
            >
              Start with an initial email template, then add a follow-up template for contacts who don&apos;t reply.
            </EmptyCard>
          )
        ) : (
          <>
            {missingCv && (
              <Notice
                tone="warning"
                action={
                  <Link href="/settings" className={`${btnSecondary} ${btnSmall}`}>
                    Upload CV
                  </Link>
                }
              >
                Some templates attach your CV, but you haven&apos;t uploaded one yet. Those emails will fail until you do.
              </Notice>
            )}
            {noFollowUpSelected && (
              <Notice
                tone="warning"
                action={
                  <Link href="/settings" className={`${btnSecondary} ${btnSmall}`}>
                    Open settings
                  </Link>
                }
              >
                None of your follow-up templates is selected for follow-ups yet.
              </Notice>
            )}
            <Card
              flush
              title="All templates"
              description={
                <>
                  <Mono className="!text-xs">{initial.length}</Mono> initial · <Mono className="!text-xs">{followUps.length}</Mono> follow-up
                </>
              }
            >
              <Table
                scroll={false}
                head={
                  <>
                    <Th>Name</Th>
                    <Th>Subject</Th>
                    <Th>Type</Th>
                    <Th className="text-right">Actions</Th>
                  </>
                }
              >
                {rows.map(renderRow)}
              </Table>
              {(initial.length === 0 || followUps.length === 0) && (
                <p className="px-4 py-2.5 text-xs text-muted">
                  {initial.length === 0 ? (
                    <>
                      No initial templates.{" "}
                      <button type="button" className={link} onClick={() => startNew(false)}>
                        Create one
                      </button>
                    </>
                  ) : (
                    <>
                      No follow-up templates.{" "}
                      <button type="button" className={link} onClick={() => startNew(true)}>
                        Create one
                      </button>{" "}
                      and select it in Settings.
                    </>
                  )}
                </p>
              )}
            </Card>
          </>
        ))}
    </div>
  );
}
