"use client";

import { useRef, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Template } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import {
  Card,
  Empty,
  ErrorBox,
  Loading,
  PageHeader,
  btnDanger,
  btnPrimary,
  btnSecondary,
  btnSmall,
  input,
  label,
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
}

const emptyDraft: Draft = { id: null, name: "", subject: "", body: "", isFollowUp: false };

function TemplateEditor({ draft, onSaved, onCancel }: { draft: Draft; onSaved: (t: Template) => void; onCancel: () => void }) {
  const [form, setForm] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocused = useRef<"subject" | "body">("body");

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
      const body = { name: form.name, subject: form.subject, body: form.body, isFollowUp: form.isFollowUp };
      const saved = form.id ? await api.updateTemplate(form.id, body) : await api.createTemplate(body);
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <ErrorBox error={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label className={label} htmlFor="t-name">
            Name *
          </label>
          <input id="t-name" required className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-sm">
          <input type="checkbox" checked={form.isFollowUp} onChange={(e) => setForm({ ...form, isFollowUp: e.target.checked })} />
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
      <div>
        <label className={label} htmlFor="t-body">
          Body *
        </label>
        <textarea
          id="t-body"
          ref={bodyRef}
          required
          rows={12}
          className={`${input} font-mono`}
          value={form.body}
          onFocus={() => (lastFocused.current = "body")}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
      </div>
      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
        <p className="mb-2 text-xs text-neutral-600">Placeholders (click to insert at the cursor in the subject or body):</p>
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
  const [result, setResult] = useState<{ subject: string; body: string } | null>(null);
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
    <div className="space-y-3">
      <ErrorBox error={professors.error} onRetry={professors.reload} />
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
          {busy ? "Rendering…" : "Preview"}
        </button>
      </div>
      <ErrorBox error={error} />
      {result && (
        <div className="rounded-md border border-neutral-200">
          <div className="border-b border-neutral-100 bg-neutral-50 px-3 py-2 text-sm">
            <span className="text-neutral-500">Subject: </span>
            <span className="font-medium">{result.subject}</span>
          </div>
          <pre className="whitespace-pre-wrap break-words p-3 font-sans text-sm">{result.body}</pre>
        </div>
      )}
    </div>
  );
}

export default function TemplatesPage() {
  const { data, error, loading, reload } = useApi(() => api.listTemplates());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [previewing, setPreviewing] = useState<Template | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function remove(t: Template) {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    setActionError(null);
    try {
      await api.deleteTemplate(t.id);
      if (previewing?.id === t.id) setPreviewing(null);
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  return (
    <div>
      <PageHeader title="Templates">
        <button
          type="button"
          className={btnPrimary}
          onClick={() => {
            setPreviewing(null);
            setDraft({ ...emptyDraft });
          }}
        >
          New template
        </button>
      </PageHeader>

      <ErrorBox error={error} onRetry={reload} />
      <ErrorBox error={actionError} />

      {draft && (
        <Card title={draft.id ? `Edit "${draft.name}"` : "New template"}>
          <TemplateEditor
            key={draft.id ?? "new"}
            draft={draft}
            onCancel={() => setDraft(null)}
            onSaved={() => {
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

      {loading && !data && <Loading />}
      {data &&
        (data.length === 0 ? (
          <Empty>No templates yet.</Empty>
        ) : (
          <div className="space-y-3">
            {data.map((t) => (
              <div key={t.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-neutral-900">{t.name}</h2>
                      {t.isFollowUp && (
                        <span className="rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-xs text-purple-800">Follow-up</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-neutral-700">
                      <span className="text-neutral-500">Subject:</span> {t.subject}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={`${btnSecondary} ${btnSmall}`}
                      onClick={() => {
                        setDraft(null);
                        setPreviewing(t);
                      }}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className={`${btnSecondary} ${btnSmall}`}
                      onClick={() => {
                        setPreviewing(null);
                        setDraft({ id: t.id, name: t.name, subject: t.subject, body: t.body, isFollowUp: t.isFollowUp });
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" className={`${btnDanger} ${btnSmall}`} onClick={() => remove(t)}>
                      Delete
                    </button>
                  </div>
                </div>
                <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded bg-neutral-50 p-2 font-sans text-xs text-neutral-700">
                  {t.body}
                </pre>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
