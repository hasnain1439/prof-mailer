"use client";

import { useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { UserFile } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { IconDownload, IconFile, IconTrash, IconUpload } from "./icons";
import { useToast } from "./Toast";
import { Button, Card, ErrorBox, Input, Mono, Skeleton, btnSecondary, btnSmall } from "./ui";

const MAX_BYTES = 4 * 1024 * 1024;
const EXT = /\.(pdf|docx?)$/i;
const MAX_FILES = 5;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Settings card: extra documents (transcript, cover letter, ...) that templates can attach. */
export function DocumentsCard() {
  const toast = useToast();
  const { data, error, reload } = useApi(() => api.listFiles());
  const [items, setItems] = useState<UserFile[] | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = items ?? data ?? [];

  async function upload(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setActionError(null);
    if (!EXT.test(file.name)) return setActionError(`"${file.name}" isn't a PDF, DOC or DOCX file.`);
    if (file.size === 0) return setActionError(`"${file.name}" is empty.`);
    if (file.size > MAX_BYTES) return setActionError(`"${file.name}" is ${formatBytes(file.size)}; the limit is 4 MB.`);
    setBusy("upload");
    try {
      const f = await api.uploadFile(file, label.trim());
      setItems([...list, f]);
      setLabel("");
      toast(`${f.label} uploaded.`);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(f: UserFile) {
    if (!window.confirm(`Remove "${f.label}"? Templates that attach it will stop attaching it.`)) return;
    setBusy(f.id);
    setActionError(null);
    try {
      await api.deleteFile(f.id);
      setItems(list.filter((x) => x.id !== f.id));
      toast(`${f.label} removed.`);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="Other documents"
      description="Transcript, cover letter, certificates… Tick them in a template to attach them besides your CV. PDF, DOC or DOCX, max 4 MB each, up to 5."
    >
      <ErrorBox error={error} onRetry={reload} />
      <ErrorBox error={actionError} />
      {!data && !error && <Skeleton className="h-10 w-full" />}
      {data && (
        <>
          {list.length > 0 && (
            <ul className="mb-3 divide-y divide-border">
              {list.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-bg text-muted">
                    <IconFile />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-text">{f.label}</p>
                    <p className="truncate text-xs text-muted">
                      {f.filename} · <Mono className="!text-xs">{formatBytes(f.size)}</Mono>
                    </p>
                  </div>
                  <a href={api.fileDownloadUrl(f.id)} download className={`${btnSecondary} ${btnSmall}`}>
                    <IconDownload size={14} />
                    Download
                  </a>
                  <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => remove(f)}>
                    <IconTrash size={14} />
                    {busy === f.id ? "Removing…" : "Remove"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {list.length < MAX_FILES ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Document name"
                className="!w-56"
                placeholder="Name, e.g. Transcript"
                maxLength={60}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
                <IconUpload size={14} />
                {busy === "upload" ? "Uploading…" : "Upload document"}
              </Button>
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
          ) : (
            <p className="text-xs text-muted">You have 5 documents; remove one to add another.</p>
          )}
        </>
      )}
    </Card>
  );
}
