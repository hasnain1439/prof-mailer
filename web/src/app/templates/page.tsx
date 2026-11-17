"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Template } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { EmailBody, HtmlBadge } from "@/components/EmailBody";
import { IconEye, IconFile, IconPencil, IconPlus, IconTemplate, IconTrash, IconUpload, IconX } from "@/components/icons";
import { MAX_HTML_UPLOAD_BYTES, PROFESSIONAL_LAYOUT, extractHtmlTitle } from "@/lib/emailLayout";
import { useToast } from "@/components/Toast";
import {
  Card,
  EmptyCard,
  ErrorBox,
  PageHeader,
  Skeleton,
  btnGhost,
  btnPrimary,
  btnSecondary,
  btnSmall,
  input,
  label,
  link,
} from "@/components/ui";

const PLACEHOLDERS = [
  { key: "{{name}}", help: "Professor's name" },
  { key: "{{university}}", help: "University" },
  { key: "{{researchFocus}}", help: "Research focus" },
  { key: "{{whyFits}}", help: "Why you fit their group" },
];

interface Draft {
  id: string | null;
  name: string;
  subject: string;
  body: string;
  isFollowUp: boolean;
  isHtml: boolean;
}

const emptyDraft: Draft = { id: null, name: "", subject: "", body: "", isFollowUp: false, isHtml: false };

function TemplateEditor({ draft, onSaved, onCancel }: { draft: Draft; onSaved: (t: Template) => void; onCancel: () => void }) {
  const [form, setForm] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocused = useRef<"subject" | "body">("body");
  const htmlFile = useRef<HTMLInputElement>(null);
  const [fileNote, setFileNote] = useState<string | null>(null);

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
      const body = { name: form.name, subject: form.subject, body: form.body, isFollowUp: form.isFollowUp, isHtml: form.isHtml };
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
        <div>
          <label className={label} htmlFor="t-name">
            Name *
          </label>
          <input id="t-name" required className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 ring-1 ring-inset ring-slate-300 has-[:checked]:bg-violet-50 has-[:checked]:text-violet-800 has-[:checked]:ring-violet-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-violet-600"
            checked={form.isFollowUp}
            onChange={(e) => setForm({ ...form, isFollowUp: e.target.checked })}
          />
          Follow-up template
        </label>
      </div>
      <div>
        <label className={label} htmlFor="t-subject">
          Subject *
        </label>
        <input
          id="t-subject"
          ref={subjectRef}
          required
          className={input}
          value={form.subject}
          onFocus={() => (lastFocused.current = "subject")}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
        />
      </div>
      <div className="rounded-lg bg-slate-50/70 p-3 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-600">Format</span>
          <div className="flex rounded-lg bg-slate-200/70 p-0.5" role="radiogroup" aria-label="Body format">
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
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  form.isHtml === o.v ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className={`${btnSecondary} ${btnSmall}`} onClick={() => htmlFile.current?.click()}>
              <IconUpload size={13} />
              Upload .html file
            </button>
            <button type="button" className={`${btnSecondary} ${btnSmall}`} onClick={applyLayout}>
              <IconFile size={13} />
              Start from professional layout
            </button>
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
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Tip: for professors, a simple, personal-looking email usually gets more replies than a heavily designed one — keep the HTML light.
        </p>
        {fileNote && <p className="mt-1 text-xs text-emerald-700">{fileNote}</p>}
      </div>
      <div className={form.isHtml ? "grid grid-cols-1 gap-4 xl:grid-cols-2" : ""}>
        <div>
          <label className={label} htmlFor="t-body">
            {form.isHtml ? "HTML body *" : "Body *"}
          </label>
          <textarea
            id="t-body"
            ref={bodyRef}
            required
            rows={form.isHtml ? 18 : 12}
            spellCheck={!form.isHtml}
            className={`${input} font-mono ${form.isHtml ? "text-xs leading-relaxed" : "text-[13px] leading-relaxed"}`}
            value={form.body}
            onFocus={() => (lastFocused.current = "body")}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
        </div>
        {form.isHtml && (
          <div>
            <p className={label}>Live preview (placeholders shown unfilled)</p>
            <EmailBody body={form.body} isHtml height={372} title="Template live preview" />
          </div>
        )}
      </div>
      <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
        <p className="mb-2 text-xs text-slate-600">Placeholders: click to insert at the cursor in the subject or body.</p>
        <div className="flex flex-wrap gap-2">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              title={p.help}
              className={`${btnSecondary} ${btnSmall} font-mono`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(p.key)}
            >
              {p.key}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? "Saving…" : form.id ? "Save template" : "Create template"}
        </button>
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
        <p className="text-sm text-slate-500">
          Add or{" "}
          <Link href="/import" className={link}>
            import
          </Link>{" "}
          a professor to preview this template with real data.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <label className={label} htmlFor="pv-prof">
            Preview for professor
          </label>
          <select id="pv-prof" className={input} value={professorId} onChange={(e) => setProfessorId(e.target.value)}>
            <option value="">Choose a professor…</option>
            {(professors.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.university})
              </option>
            ))}
          </select>
        </div>
        <button type="button" className={btnPrimary} disabled={!professorId || busy} onClick={run}>
          <IconEye size={16} />
          {busy ? "Rendering…" : "Preview"}
        </button>
      </div>
      <ErrorBox error={error} />
      {result && (
        <div className="overflow-hidden rounded-lg ring-1 ring-slate-200">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm">
            <span className="text-slate-500">Subject: </span>
            <span className="font-medium text-slate-900">{result.subject}</span>
          </div>
          <div className={result.isHtml ? "p-2" : "p-4"}>
            <EmailBody body={result.body} isHtml={!!result.isHtml} textClassName="text-slate-800" title="Rendered email preview" />
          </div>
        </div>
      )}
    </div>
  );
}

const pill = "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset";

export default function TemplatesPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi(() => api.listTemplates());
  const settings = useApi(() => api.getSettings());
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
  const initial = data?.filter((t) => !t.isFollowUp) ?? [];
  const followUps = data?.filter((t) => t.isFollowUp) ?? [];

  const renderTemplate = (t: Template) => (
    <div key={t.id} className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5 transition hover:shadow-md">
      <div className="px-5 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-semibold text-slate-900">{t.name}</h3>
          {t.isFollowUp ? (
            <span className={`${pill} bg-violet-50 text-violet-700 ring-violet-600/20`}>Follow-up</span>
          ) : (
            <span className={`${pill} bg-slate-100 text-slate-600 ring-slate-500/15`}>Initial</span>
          )}
          {t.isHtml && <HtmlBadge />}
          {t.isFollowUp && t.id === followUpId && (
            <span className={`${pill} bg-emerald-50 text-emerald-700 ring-emerald-600/20`}>Used for follow-ups</span>
          )}
        </div>
        <p className="mt-1 truncate text-sm text-slate-600" title={t.subject}>
          <span className="text-slate-400">Subject:</span> {t.subject}
        </p>
      </div>
      {t.isHtml ? (
        <div className="mx-5 mt-3 flex-1">
          <EmailBody body={t.body} isHtml height={144} title={`${t.name} preview`} />
        </div>
      ) : (
        <pre className="mx-5 mt-3 max-h-36 flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans text-xs leading-relaxed text-slate-600">
          {t.body}
        </pre>
      )}
      <div className="mt-3 flex items-center gap-1 border-t border-slate-100 px-3 py-2">
        <button
          type="button"
          className={`${btnGhost} !text-xs`}
          onClick={() => {
            setDraft(null);
            setPreviewing(t);
          }}
        >
          <IconEye size={14} />
          Preview
        </button>
        <button
          type="button"
          className={`${btnGhost} !text-xs`}
          onClick={() => {
            setPreviewing(null);
            setDraft({ id: t.id, name: t.name, subject: t.subject, body: t.body, isFollowUp: t.isFollowUp, isHtml: !!t.isHtml });
          }}
        >
          <IconPencil size={14} />
          Edit
        </button>
        <button type="button" className={`${btnGhost} ml-auto !text-xs !text-red-600 hover:!bg-red-50`} onClick={() => remove(t)}>
          <IconTrash size={14} />
          Delete
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Templates" description="Reusable emails with placeholders like {{name}} that are filled in for each professor.">
        <button type="button" className={btnPrimary} onClick={() => startNew()}>
          <IconPlus size={16} />
          New template
        </button>
      </PageHeader>

      <ErrorBox error={error} onRetry={reload} />
      <ErrorBox error={actionError} />

      {draft && (
        <Card
          title={draft.id ? `Edit "${draft.name}"` : draft.isFollowUp ? "New follow-up template" : "New template"}
          actions={
            <button type="button" aria-label="Close editor" className={btnGhost} onClick={() => setDraft(null)}>
              <IconX size={16} />
            </button>
          }
        >
          <TemplateEditor
            key={draft.id ?? `new-${draft.isFollowUp}`}
            draft={draft}
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
            <button type="button" className={`${btnSecondary} ${btnSmall}`} onClick={() => setPreviewing(null)}>
              Close
            </button>
          }
        >
          <TemplatePreview key={previewing.id} template={previewing} />
        </Card>
      )}

      {loading && !data && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      )}
      {data &&
        (data.length === 0 ? (
          !draft && (
            <EmptyCard
              icon={<IconTemplate size={20} />}
              title="No templates yet"
              action={
                <>
                  <button type="button" className={btnPrimary} onClick={() => startNew(false)}>
                    Create initial email
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => startNew(true)}>
                    Create follow-up
                  </button>
                </>
              }
            >
              Start with an initial email template, then add a follow-up template for professors who don&apos;t reply.
            </EmptyCard>
          )
        ) : (
          <div className="space-y-8">
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Initial emails ({initial.length})</h2>
              {initial.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 px-5 py-6 text-center text-sm text-slate-500">
                  No initial templates.{" "}
                  <button type="button" className={link} onClick={() => startNew(false)}>
                    Create one
                  </button>
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{initial.map(renderTemplate)}</div>
              )}
            </section>
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Follow-ups ({followUps.length})</h2>
              {followUps.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 px-5 py-6 text-center text-sm text-slate-500">
                  No follow-up templates.{" "}
                  <button type="button" className={link} onClick={() => startNew(true)}>
                    Create one
                  </button>{" "}
                  and select it in Settings.
                </p>
              ) : (
                <>
                  {settings.data && !followUps.some((t) => t.id === followUpId) && (
                    <p className="mb-3 text-xs text-amber-700">
                      None of these is selected for follow-ups yet.{" "}
                      <Link href="/settings" className={link}>
                        Choose one in Settings
                      </Link>
                      .
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{followUps.map(renderTemplate)}</div>
                </>
              )}
            </section>
          </div>
        ))}
    </div>
  );
}
