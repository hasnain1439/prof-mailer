"use client";

import Link from "next/link";
import { Fragment, useRef, useState, type DragEvent, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import type { ImportCommitResult, ImportPreview } from "@/lib/types";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { IconAlert, IconArrowRight, IconCheck, IconDownload, IconFile, IconX } from "@/components/icons";
import { EmailBody, HtmlBadge } from "@/components/EmailBody";
import { useToast } from "@/components/Toast";
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Field,
  Mono,
  Notice,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
  btnPrimary,
  btnSecondary,
  link,
  tr,
} from "@/components/ui";

const ACCEPTED = [".csv", ".xlsx"];

/** "1 Upload · 2 Preview · 3 Import" with the current step in accent. */
function StepIndicator({ step }: { step: 1 | 2 | 3 | 4 }) {
  const steps = ["Upload", "Preview", "Import"];
  return (
    <ol className="mb-4 flex flex-wrap items-center gap-x-2 text-[13px]" aria-label="Import steps">
      {steps.map((name, i) => {
        const n = i + 1;
        const done = step > n;
        const current = step === n;
        return (
          <li key={name} className="flex items-center gap-2" aria-current={current ? "step" : undefined}>
            <span className={current ? "font-semibold text-accent" : done ? "text-text" : "text-muted"}>
              <span className="font-mono">{n}</span> {name}
              {done && <IconCheck size={13} className="ml-1 inline-block align-[-2px] text-sent-fg" />}
            </span>
            {n < steps.length && (
              <span className="text-muted" aria-hidden="true">
                ·
              </span>
            )}
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
  const warningCount = validRows.filter((r) => (r.warnings?.length ?? 0) > 0).length;
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
          <IconDownload />
          Download sample CSV
        </a>
      </PageHeader>

      <StepIndicator step={step} />

      <ErrorBox error={error} />

      {result && (
        <Card title="Import complete">
          <dl className="grid max-w-lg grid-cols-3 overflow-hidden rounded-md border border-border">
            {(
              [
                ["Created", result.professorsCreated],
                ["Updated", result.professorsUpdated],
                ["Emails scheduled", result.emailsCreated],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="border-r border-border px-3 py-2 last:border-r-0">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-mono text-lg font-semibold tabular-nums text-text">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/queue" className={btnPrimary}>
              View queue
              <IconArrowRight />
            </Link>
            <Link href="/professors" className={btnSecondary}>
              Professors
            </Link>
            <Button onClick={reset}>Import another file</Button>
          </div>
        </Card>
      )}

      {!result && (
        <Card title="Upload file" description="CSV or Excel (.xlsx), one professor per row">
          <form onSubmit={runPreview} className="space-y-4">
            <label
              htmlFor="imp-file"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-6 text-center transition-colors ${
                dragging ? "border-accent bg-bg" : "border-border hover:border-accent hover:bg-bg"
              }`}
            >
              {file ? (
                <span className="flex items-center gap-2 text-left">
                  <IconFile className="shrink-0 text-muted" />
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[13px] text-text">{file.name}</span>
                    <span className="block text-xs text-muted">
                      <Mono className="!text-xs">{formatSize(file.size)}</Mono> · click or drop to replace
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label="Remove file"
                    className="ml-2 rounded-md p-1 text-muted hover:bg-surface hover:text-text"
                    onClick={(e) => {
                      e.preventDefault();
                      chooseFile(null);
                    }}
                  >
                    <IconX />
                  </button>
                </span>
              ) : (
                <>
                  <span className="text-[13px] text-text">
                    <span className="font-medium text-accent">Choose a file</span> or drag it here
                  </span>
                  <span className="mt-0.5 font-mono text-xs text-muted">.csv · .xlsx</span>
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

            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full sm:w-80">
                <Field label="Template (optional)" htmlFor="imp-template">
                  <Select id="imp-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    <option value="">None (use subject/body columns)</option>
                    {(templates.data ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button type="submit" variant="primary" disabled={!file || busy !== null}>
                {busy === "preview" ? "Reading file…" : "Preview"}
                <IconArrowRight />
              </Button>
            </div>
            {templates.error && <p className="-mt-2 text-xs text-failed-fg">Could not load templates: {templates.error}</p>}
            {templates.data && templates.data.length === 0 && (
              <p className="-mt-2 text-xs text-muted">
                No initial templates yet.{" "}
                <Link href="/templates" className={link}>
                  Create one
                </Link>{" "}
                or fill subject/body in the file.
              </p>
            )}

            <details className="rounded-md border border-border text-[13px]">
              <summary className="cursor-pointer px-3 py-2 font-medium text-text select-none">File format</summary>
              <div className="space-y-1.5 border-t border-border px-3 py-2.5 text-muted">
                <p>
                  Columns:{" "}
                  <code className="font-mono text-xs text-text">name, email, university, country, researchFocus, whyFits, profileUrl, subject, body, scheduledAt</code>
                </p>
                <p>
                  <code className="font-mono text-xs text-text">scheduledAt</code> is Karachi time,{" "}
                  <code className="font-mono text-xs text-text">YYYY-MM-DD HH:mm</code>. Leave subject/body empty to use the selected template.
                </p>
              </div>
            </details>
          </form>
        </Card>
      )}

      {preview && (
        <Card
          title="Preview rows"
          description={
            <>
              <Mono className="!text-xs">{preview.rows.length}</Mono> row{preview.rows.length === 1 ? "" : "s"} read from{" "}
              <span className="font-mono">{file?.name ?? "file"}</span>
            </>
          }
          flush
          actions={
            <>
              <Badge tone="sent">
                <span className="mr-1 font-mono">{preview.validCount}</span> valid
              </Badge>
              {warningCount > 0 && (
                <Badge tone="replied">
                  <span className="mr-1 font-mono">{warningCount}</span> with warnings
                </Badge>
              )}
              {preview.errorCount > 0 && (
                <Badge tone="failed">
                  <span className="mr-1 font-mono">{preview.errorCount}</span> with errors
                </Badge>
              )}
              <Button variant="primary" disabled={validRows.length === 0 || busy !== null} onClick={commit}>
                {busy === "commit" ? "Importing…" : `Import ${validRows.length} valid row${validRows.length === 1 ? "" : "s"}`}
              </Button>
            </>
          }
        >
          {previewTemplateId !== templateId && (
            <Notice tone="warning" className="m-3">
              The template selection changed since this preview; import will use the template from the preview. Re-run Preview to update.
            </Notice>
          )}
          {preview.errorCount > 0 && <p className="border-b border-border px-4 py-2 text-xs text-muted">Rows with errors are highlighted and will be skipped.</p>}
          {warningCount > 0 && (
            <p className="border-b border-border px-4 py-2 text-xs text-muted">
              Rows with warnings (amber) will still be imported. Check them before you import.
            </p>
          )}
          <Table
            head={
              <>
                <Th numeric>Row</Th>
                <Th>Professor</Th>
                <Th>Email</Th>
                <Th>University</Th>
                <Th>Scheduled (raw)</Th>
                <Th>Scheduled (PKT)</Th>
                <Th>Subject</Th>
                <Th>Check</Th>
              </>
            }
          >
            {preview.rows.map((r) => {
              const bad = r.errors.length > 0;
              const warnings = r.warnings ?? [];
              const open = openRow === r.rowNumber;
              return (
                <Fragment key={r.rowNumber}>
                  <tr className={bad ? "bg-failed-bg" : warnings.length > 0 ? "bg-replied-bg" : tr}>
                    <Td numeric className="text-muted">
                      {r.rowNumber}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className="font-medium">{r.data.name || "—"}</span>
                      {r.professorExists && (
                        <Badge tone="scheduled" className="ml-2">
                          Existing · will update
                        </Badge>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <Mono className="text-muted">{r.data.email || "—"}</Mono>
                    </Td>
                    <Td>{r.data.university || "—"}</Td>
                    <Td className="whitespace-nowrap">
                      <Mono className="text-muted">{r.data.scheduledAt || "—"}</Mono>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <Mono>{formatKarachi(r.scheduledAtUtc)}</Mono>
                    </Td>
                    <Td className="max-w-xs">
                      <div className="truncate">{r.subject || "—"}</div>
                      {r.body && (
                        <div className="mt-0.5 flex items-center gap-2">
                          <button
                            type="button"
                            className="text-xs font-medium text-accent underline-offset-2 hover:underline"
                            aria-expanded={open}
                            onClick={() => setOpenRow(open ? null : r.rowNumber)}
                          >
                            {open ? "Hide body" : "View body"}
                          </button>
                          {r.isHtml && <HtmlBadge />}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {bad ? (
                        <ul className="list-disc space-y-0.5 pl-4 text-xs text-failed-fg">
                          {r.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      ) : warnings.length > 0 ? (
                        <ul className="space-y-0.5 text-xs text-replied-fg">
                          {warnings.map((w, i) => (
                            <li key={i} className="flex items-start gap-1">
                              <IconAlert size={14} className="mt-px shrink-0" />
                              <span>{w}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-sent-fg">
                          <IconCheck size={14} />
                          OK
                        </span>
                      )}
                    </Td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={8} className="border-b border-border bg-bg px-4 py-3">
                        {r.isHtml ? (
                          <EmailBody body={r.body} isHtml title={`Row ${r.rowNumber} email`} />
                        ) : (
                          <EmailBody
                            body={r.body}
                            isHtml={false}
                            className="max-h-96 overflow-y-auto rounded-md border border-border bg-surface p-3"
                            textClassName="text-text"
                          />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </Table>
        </Card>
      )}
    </div>
  );
}
