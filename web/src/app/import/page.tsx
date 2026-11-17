"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import type { ImportCommitResult, ImportPreview } from "@/lib/types";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { Card, ErrorBox, PageHeader, SuccessBox, btnPrimary, btnSecondary, input, label, table, td, th } from "@/components/ui";

export default function ImportPage() {
  const templates = useApi(() => api.listTemplates(false));
  const [file, setFile] = useState<File | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  // templateId the current preview was produced with (commit must use the same one)
  const [previewTemplateId, setPreviewTemplateId] = useState("");
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);

  const validRows = preview?.rows.filter((r) => r.errors.length === 0) ?? [];

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
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="Import">
        <a href={api.sampleCsvUrl} className={btnSecondary} download>
          Download sample CSV
        </a>
      </PageHeader>

      <Card title="Upload">
        <p className="mb-3 text-sm text-neutral-600">
          Columns: <code className="font-mono text-xs">name, email, university, country, researchFocus, whyFits, profileUrl, subject, body, scheduledAt</code>.{" "}
          <code className="font-mono text-xs">scheduledAt</code> is Karachi time, <code className="font-mono text-xs">YYYY-MM-DD HH:mm</code>. Leave
          subject/body empty to use the selected template.
        </p>
        <form onSubmit={runPreview} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className={label} htmlFor="imp-file">
              File (.csv, .xlsx)
            </label>
            <input
              id="imp-file"
              type="file"
              accept=".csv,.xlsx"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setResult(null);
              }}
            />
          </div>
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
          </div>
          <button type="submit" className={btnPrimary} disabled={!file || busy !== null}>
            {busy === "preview" ? "Previewing…" : "Preview"}
          </button>
        </form>
        {templates.error && <p className="mt-2 text-xs text-red-700">Could not load templates: {templates.error}</p>}
      </Card>

      <ErrorBox error={error} />

      {result && (
        <SuccessBox>
          Imported: {result.professorsCreated} professor(s) created, {result.professorsUpdated} updated, {result.emailsCreated} email(s) scheduled.{" "}
          <Link href="/queue" className="font-medium underline">
            View queue →
          </Link>
        </SuccessBox>
      )}

      {preview && (
        <Card
          title={`Preview: ${preview.validCount} valid, ${preview.errorCount} invalid`}
          actions={
            <button type="button" className={btnPrimary} disabled={validRows.length === 0 || busy !== null} onClick={commit}>
              {busy === "commit" ? "Importing…" : `Import ${validRows.length} valid row${validRows.length === 1 ? "" : "s"}`}
            </button>
          }
        >
          {previewTemplateId !== templateId && (
            <p className="mb-3 text-xs text-amber-800">The template selection changed since this preview; import will use the template from the preview. Re-run Preview to update.</p>
          )}
          <div className="overflow-x-auto">
            <table className={table}>
              <thead>
                <tr>
                  <th className={th}>Row</th>
                  <th className={th}>Name</th>
                  <th className={th}>Email</th>
                  <th className={th}>University</th>
                  <th className={th}>Scheduled (raw)</th>
                  <th className={th}>Scheduled (PKT)</th>
                  <th className={th}>Subject</th>
                  <th className={th}>Errors</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const bad = r.errors.length > 0;
                  return (
                    <tr key={r.rowNumber} className={bad ? "bg-red-50" : undefined}>
                      <td className={td}>{r.rowNumber}</td>
                      <td className={td}>
                        {r.data.name || "—"}
                        {r.professorExists && <div className="text-xs text-neutral-500">existing (will update)</div>}
                      </td>
                      <td className={td}>{r.data.email || "—"}</td>
                      <td className={td}>{r.data.university || "—"}</td>
                      <td className={`${td} whitespace-nowrap font-mono text-xs`}>{r.data.scheduledAt || "—"}</td>
                      <td className={`${td} whitespace-nowrap`}>{formatKarachi(r.scheduledAtUtc)}</td>
                      <td className={td} title={r.body}>
                        {r.subject || "—"}
                      </td>
                      <td className={`${td} text-red-700`}>
                        {bad ? (
                          <ul className="list-disc pl-4">
                            {r.errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-green-700">OK</span>
                        )}
                      </td>
                    </tr>
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
