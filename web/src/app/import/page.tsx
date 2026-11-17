"use client";

import Link from "next/link";
import { Fragment, useRef, useState, type DragEvent, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import type { ImportCommitResult, ImportPreview } from "@/lib/types";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { IconArrowRight, IconCheck, IconCheckCircle, IconDownload, IconFile, IconUpload, IconX } from "@/components/icons";
import { EmailBody, HtmlBadge } from "@/components/EmailBody";
import { useToast } from "@/components/Toast";
import {
  Card,
  ErrorBox,
  Notice,
  PageHeader,
  btnPrimary,
  btnSecondary,
  input,
  label,
  link,
  table,
  tableWrap,
  td,
  th,
  tr,
} from "@/components/ui";

const ACCEPTED = [".csv", ".xlsx"];

function StepIndicator({ step }: { step: 1 | 2 | 3 | 4 }) {
  const steps = ["Upload", "Preview", "Import"];
  return (
    <ol className="mb-6 flex items-center gap-2 sm:gap-3">
      {steps.map((name, i) => {
        const n = i + 1;
        const done = step > n;
        const current = step === n;
        return (
          <li key={name} className="flex items-center gap-2 sm:gap-3">
            <span className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  done ? "bg-indigo-600 text-white" : current ? "bg-white text-indigo-700 ring-2 ring-indigo-600" : "bg-white text-slate-400 ring-1 ring-slate-300"
                }`}
              >
                {done ? <IconCheck size={14} /> : n}
              </span>
              <span className={`text-sm font-medium ${current ? "text-slate-900" : done ? "text-slate-700" : "text-slate-400"}`}>{name}</span>
            </span>
            {n < steps.length && <span className={`h-px w-8 sm:w-16 ${done ? "bg-indigo-600" : "bg-slate-300"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ImportPage() {
  const toast = useToast();
  const templates = useApi(() => api.listTemplates(false));
  const [file, setFile] = useState<File | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  // templateId the current preview was produced with (commit must use the same one)
  const [previewTemplateId, setPreviewTemplateId] = useState("");
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [dragging, setDragging] = useState(false);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const validRows = preview?.rows.filter((r) => r.errors.length === 0) ?? [];
  const step: 1 | 2 | 3 | 4 = result ? 4 : preview ? (busy === "commit" ? 3 : 2) : 1;

  function chooseFile(f: File | null) {
    if (f && !ACCEPTED.some((ext) => f.name.toLowerCase().endsWith(ext))) {
      setError(`"${f.name}" isn't a .csv or .xlsx file.`);
      return;
    }
    setError(null);
    setFile(f);
    setPreview(null);
    setResult(null);
    if (!f && fileInput.current) fileInput.current.value = "";
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) chooseFile(f);
  }

  async function runPreview(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy("preview");
    setError(null);
    setResult(null);
    try {
      setPreview(await api.importPreview(file, templateId || undefined));
      setPreviewTemplateId(templateId);
    } catch (err) {
      setPreview(null);
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    if (validRows.length === 0) return;
    setBusy("commit");
    setError(null);
    try {
      const res = await api.importCommit(
        validRows.map((r) => r.data),
        previewTemplateId || undefined,
      );
      setResult(res);
      setPreview(null);
      toast(`Imported ${res.professorsCreated + res.professorsUpdated} professor(s), ${res.emailsCreated} email(s) scheduled.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    chooseFile(null);
    setResult(null);
  }

  return (
    <div>
      <PageHeader title="Import" description="Upload a spreadsheet of professors and schedule an email to each one.">
        <a href={api.sampleCsvUrl} className={btnSecondary} download>
          <IconDownload size={16} />
          Download sample CSV
        </a>
      </PageHeader>

      <StepIndicator step={step} />

      <ErrorBox error={error} />

      {result && (
        <Card>
          <div className="flex flex-col items-center py-6 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <IconCheckCircle size={26} />
            </span>
            <p className="text-lg font-semibold text-slate-900">Import complete</p>
            <div className="mt-4 grid w-full max-w-md grid-cols-3 gap-3">
              {[
                ["Created", result.professorsCreated],
                ["Updated", result.professorsUpdated],
                ["Emails scheduled", result.emailsCreated],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-slate-50 px-3 py-3 ring-1 ring-slate-200">
                  <p className="text-2xl font-semibold text-slate-900">{v}</p>
                  <p className="text-xs text-slate-500">{k}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link href="/queue" className={btnPrimary}>
                View queue
                <IconArrowRight size={16} />
              </Link>
              <Link href="/professors" className={btnSecondary}>
                Professors
              </Link>
              <button type="button" className={btnSecondary} onClick={reset}>
                Import another file
              </button>
            </div>
          </div>
        </Card>
      )}

      {!result && (
        <Card title="1. Upload your file" description="CSV or Excel (.xlsx), one professor per row">
          <form onSubmit={runPreview} className="space-y-5">
            <label
              htmlFor="imp-file"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                dragging ? "border-indigo-500 bg-indigo-50" : file ? "border-slate-300 bg-slate-50" : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"
              }`}
            >
              {file ? (
                <span className="flex items-center gap-3 rounded-lg bg-white px-4 py-3 text-left shadow-sm ring-1 ring-slate-200">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <IconFile size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">{file.name}</span>
                    <span className="block text-xs text-slate-500">{formatSize(file.size)} · click or drop to replace</span>
                  </span>
                  <button
                    type="button"
                    aria-label="Remove file"
                    className="ml-2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    onClick={(e) => {
                      e.preventDefault();
                      chooseFile(null);
                    }}
                  >
                    <IconX size={16} />
                  </button>
                </span>
              ) : (
                <>
                  <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                    <IconUpload size={20} />
                  </span>
                  <span className="text-sm font-medium text-slate-900">
                    <span className="text-indigo-600">Click to choose a file</span> or drag and drop
                  </span>
                  <span className="mt-1 text-xs text-slate-500">.csv or .xlsx</span>
                </>
              )}
              <input
                id="imp-file"
                ref={fileInput}
                type="file"
                accept=".csv,.xlsx"
                className="sr-only"
                onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label className={label} htmlFor="imp-template">
                  Template (optional)
                </label>
                <select id="imp-template" className={input} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  <option value="">None (use subject/body columns)</option>
                  {(templates.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {templates.error && <p className="mt-1.5 text-xs text-red-600">Could not load templates: {templates.error}</p>}
                {templates.data && templates.data.length === 0 && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    No initial templates yet.{" "}
                    <Link href="/templates" className={link}>
                      Create one
                    </Link>{" "}
                    or fill subject/body in the file.
                  </p>
                )}
              </div>
              <button type="submit" className={btnPrimary} disabled={!file || busy !== null}>
                {busy === "preview" ? "Reading file…" : "Preview"}
                <IconArrowRight size={16} />
              </button>
            </div>

            <details className="rounded-lg bg-slate-50 text-sm ring-1 ring-slate-200">
              <summary className="cursor-pointer select-none px-4 py-2.5 font-medium text-slate-700">File format</summary>
              <div className="space-y-2 border-t border-slate-200 px-4 py-3 text-slate-600">
                <p>
                  Columns:{" "}
                  <code className="font-mono text-xs">name, email, university, country, researchFocus, whyFits, profileUrl, subject, body, scheduledAt</code>
                </p>
                <p>
                  <code className="font-mono text-xs">scheduledAt</code> is Karachi time, <code className="font-mono text-xs">YYYY-MM-DD HH:mm</code>. Leave
                  subject/body empty to use the selected template.
                </p>
              </div>
            </details>
          </form>
        </Card>
      )}

      {preview && (
        <Card
          title="2. Review rows"
          description={`${preview.rows.length} row${preview.rows.length === 1 ? "" : "s"} read from ${file?.name ?? "file"}`}
          flush
          actions={
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                {preview.validCount} valid
              </span>
              {preview.errorCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/15">
                  {preview.errorCount} with errors
                </span>
              )}
              <button type="button" className={btnPrimary} disabled={validRows.length === 0 || busy !== null} onClick={commit}>
                {busy === "commit" ? "Importing…" : `Import ${validRows.length} valid row${validRows.length === 1 ? "" : "s"}`}
              </button>
            </>
          }
        >
          {previewTemplateId !== templateId && (
            <Notice tone="warning" className="m-4">
              The template selection changed since this preview; import will use the template from the preview. Re-run Preview to update.
            </Notice>
          )}
          {preview.errorCount > 0 && (
            <p className="border-b border-slate-100 px-5 py-2.5 text-xs text-slate-500">Rows with errors are highlighted and will be skipped.</p>
          )}
          <div className={tableWrap}>
            <table className={table}>
              <thead>
                <tr>
                  <th className={th}>Row</th>
                  <th className={th}>Professor</th>
                  <th className={th}>University</th>
                  <th className={th}>Scheduled (raw)</th>
                  <th className={th}>Scheduled (PKT)</th>
                  <th className={th}>Subject</th>
                  <th className={th}>Check</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const bad = r.errors.length > 0;
                  return (
                    <Fragment key={r.rowNumber}>
                    <tr className={bad ? "bg-red-50/60" : tr}>
                      <td className={`${td} tabular-nums text-slate-400`}>{r.rowNumber}</td>
                      <td className={td}>
                        <div className="font-medium text-slate-900">{r.data.name || "—"}</div>
                        <div className="text-xs text-slate-500">{r.data.email || "—"}</div>
                        {r.professorExists && (
                          <span className="mt-1 inline-block rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">Existing · will update</span>
                        )}
                      </td>
                      <td className={td}>{r.data.university || "—"}</td>
                      <td className={`${td} whitespace-nowrap font-mono text-xs`}>{r.data.scheduledAt || "—"}</td>
                      <td className={`${td} whitespace-nowrap text-xs`}>{formatKarachi(r.scheduledAtUtc)}</td>
                      <td className={`${td} max-w-xs`}>
                        <div>{r.subject || "—"}</div>
                        {r.body && (
                          <div className="mt-1 flex items-center gap-2">
                            <button
                              type="button"
                              className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                              aria-expanded={openRow === r.rowNumber}
                              onClick={() => setOpenRow(openRow === r.rowNumber ? null : r.rowNumber)}
                            >
                              {openRow === r.rowNumber ? "Hide body" : "View body"}
                            </button>
                            {r.isHtml && <HtmlBadge />}
                          </div>
                        )}
                      </td>
                      <td className={td}>
                        {bad ? (
                          <ul className="list-disc space-y-0.5 pl-4 text-xs text-red-700">
                            {r.errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <IconCheck size={14} />
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                    {openRow === r.rowNumber && (
                      <tr>
                        <td colSpan={7} className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
                          {r.isHtml ? (
                            <EmailBody body={r.body} isHtml title={`Row ${r.rowNumber} email`} />
                          ) : (
                            <EmailBody body={r.body} isHtml={false} className="max-h-96 overflow-y-auto rounded-lg bg-white p-4 ring-1 ring-slate-200" textClassName="text-slate-800" />
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
