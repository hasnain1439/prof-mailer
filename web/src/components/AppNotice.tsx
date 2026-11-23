"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import type { AppNotice } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { IconInfo, IconX } from "./icons";
import { useToast } from "./Toast";
import { Button, Card, ErrorBox, Field, Input, Loading, Textarea } from "./ui";

const DISMISS_KEY = "pm:notice-dismissed";

/** The admin's notice, on the dashboard, until dismissed. A newer version (updatedAt) shows again. */
export function NoticeBanner() {
  const { data } = useApi(() => api.notice());
  const [dismissed, setDismissed] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    // localStorage is only available in the browser, after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(window.localStorage.getItem(DISMISS_KEY));
  }, []);

  const n = data?.notice;
  if (!n || dismissed === undefined || dismissed === n.updatedAt) return null;

  function dismiss() {
    if (!n) return;
    window.localStorage.setItem(DISMISS_KEY, n.updatedAt);
    setDismissed(n.updatedAt);
  }

  return (
    <section className="mb-4 rounded-md border border-border bg-surface" aria-label="Notice">
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="mt-0.5 shrink-0 text-accent">
          <IconInfo />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-text">{n.title}</h2>
          <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap text-muted">{n.body}</p>
          <Button size="sm" variant="primary" className="mt-3" onClick={dismiss}>
            Got it
          </Button>
        </div>
        <button type="button" aria-label="Dismiss notice" className="shrink-0 rounded-sm p-0.5 text-muted hover:text-text" onClick={dismiss}>
          <IconX />
        </button>
      </div>
    </section>
  );
}

/** Admin panel editor for the notice. */
export function NoticeEditor() {
  const toast = useToast();
  const { data, error, reload } = useApi(() => api.adminNotice());
  const [form, setForm] = useState<{ enabled: boolean; title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const current: AppNotice | undefined = data?.notice;
  const f = form ?? (current ? { enabled: current.enabled, title: current.title, body: current.body } : null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setBusy(true);
    setSaveError(null);
    try {
      await api.adminSaveNotice(f);
      setForm(null);
      reload();
      toast(f.enabled ? "Notice saved. Every user will see it on their dashboard." : "Notice saved and hidden.");
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Notice for all users"
      description="Shown on every user's dashboard until they click Got it. Saving shows it again to everyone, new users included."
    >
      <ErrorBox error={error} onRetry={reload} />
      {!f ? (
        !error && <Loading rows={2} />
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <ErrorBox error={saveError} />
          <label className="flex items-center gap-2 text-[13px] text-text">
            <input type="checkbox" checked={f.enabled} onChange={(e) => setForm({ ...f, enabled: e.target.checked })} />
            Show this notice
          </label>
          <Field label="Title" htmlFor="notice-title">
            <Input id="notice-title" required maxLength={120} value={f.title} onChange={(e) => setForm({ ...f, title: e.target.value })} />
          </Field>
          <Field label="Message (plain text; new lines are kept)" htmlFor="notice-body">
            <Textarea id="notice-body" required rows={10} maxLength={4000} value={f.body} onChange={(e) => setForm({ ...f, body: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Saving…" : "Save and show to everyone"}
            </Button>
            {data?.defaultNotice && (
              <Button
                variant="ghost"
                onClick={() => setForm({ enabled: true, title: data.defaultNotice.title, body: data.defaultNotice.body })}
              >
                Reset to the default tips
              </Button>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}
