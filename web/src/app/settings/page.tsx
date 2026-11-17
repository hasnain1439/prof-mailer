"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import type { SettingsInput, SettingsResponse } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useGmailStatus } from "@/components/GmailStatus";
import { useToast } from "@/components/Toast";
import { Card, ErrorBox, Notice, PageHeader, Skeleton, btnPrimary, input, label, link } from "@/components/ui";

function SettingsForm({ initial, onSaved }: { initial: SettingsResponse; onSaved: (s: SettingsResponse) => void }) {
  const toast = useToast();
  const templates = useApi(() => api.listTemplates(true));
  const [form, setForm] = useState({
    followUpAfterDays: String(initial.followUpAfterDays),
    maxFollowUps: String(initial.maxFollowUps),
    dailySendLimit: String(initial.dailySendLimit),
    followUpTemplateId: initial.followUpTemplateId ?? "",
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
    <div>
      <label className={label} htmlFor={`s-${k}`}>
        {title}
      </label>
      <div className="relative">
        <input
          id={`s-${k}`}
          type="number"
          required
          min={min}
          max={max}
          step={1}
          className={`${input} pr-16`}
          value={form[k]}
          onChange={(e) => {
            setSaved(false);
            setForm({ ...form, [k]: e.target.value });
          }}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{help}</p>
    </div>
  );

  const noFollowUps = templates.data && templates.data.length === 0;

  return (
    <form onSubmit={submit}>
      <div className="space-y-6 p-5">
        <ErrorBox error={error} />
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Sending</h3>
          <p className="mb-3 text-xs text-slate-500">Caps how many emails go out per Karachi calendar day.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {num("dailySendLimit", "Daily send limit", 1, 500, "1–500 emails per day", "emails")}
          </div>
        </div>
        <div className="border-t border-slate-100 pt-6">
          <h3 className="text-sm font-semibold text-slate-900">Follow-ups</h3>
          <p className="mb-3 text-xs text-slate-500">Automatically nudge professors who haven&apos;t replied.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {num("followUpAfterDays", "Follow up after", 1, 60, "1–60 days without a reply", "days")}
            {num("maxFollowUps", "Max follow-ups", 0, 10, "0–10 per professor (0 disables)", "max")}
          </div>
          <div className="mt-4">
            <label className={label} htmlFor="s-tpl">
              Follow-up template
            </label>
            <select
              id="s-tpl"
              className={input}
              value={form.followUpTemplateId}
              onChange={(e) => {
                setSaved(false);
                setForm({ ...form, followUpTemplateId: e.target.value });
              }}
            >
              <option value="">None</option>
              {(templates.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              {form.followUpTemplateId && templates.data && !templates.data.some((t) => t.id === form.followUpTemplateId) && (
                <option value={form.followUpTemplateId}>(unknown template)</option>
              )}
            </select>
            {templates.error && <p className="mt-1.5 text-xs text-red-600">Could not load templates: {templates.error}</p>}
            {noFollowUps ? (
              <p className="mt-1.5 text-xs text-amber-700">
                You have no follow-up templates yet.{" "}
                <Link href="/templates" className={link}>
                  Create one
                </Link>{" "}
                and tick “Follow-up template”.
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-slate-500">Only templates marked as follow-up are listed.</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
        {saved && <span className="text-sm text-emerald-700">Saved ✓</span>}
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <span className="text-slate-500">{name}</span>
      <span className="text-right font-medium text-slate-900">{children}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { data, error, loading, reload } = useApi(() => api.getSettings());
  const gmail = useGmailStatus();
  const [latest, setLatest] = useState<SettingsResponse | null>(null);
  const s = latest ?? data;

  return (
    <div>
      <PageHeader title="Settings" description="Send limits and follow-up behaviour. Environment flags are read-only and live in api/.env." />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      )}
      {data && s && (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[2fr_1fr]">
          <Card title="Sending & follow-ups" flush>
            <SettingsForm initial={data} onSaved={setLatest} />
          </Card>
          <div>
            <Card title="Environment" description="Read-only">
              <div className="-my-2.5 divide-y divide-slate-100">
                <Row name="Sending from">
                  {gmail.data?.connected ? (
                    <span className="break-all">{gmail.data.email ?? "Connected"}</span>
                  ) : (
                    <Link href="/gmail" className="text-amber-700 hover:underline">
                      Not connected
                    </Link>
                  )}
                </Row>
                <Row name="DRY_RUN">
                  {s.dryRun ? <span className="text-amber-700">ON (logged only)</span> : <span className="text-emerald-700">OFF (real sends)</span>}
                </Row>
                <Row name="Test recipient">{s.testRecipientSet ? "Configured" : "Not set"}</Row>
                <Row name="Timezone">{s.timezone}</Row>
                <Row name="Sent today">
                  {s.sentToday} / {s.dailySendLimit}
                </Row>
              </div>
            </Card>
            <Notice tone={s.dryRun ? "warning" : "info"}>
              {s.dryRun ? "No real emails are sent while DRY_RUN is on. " : ""}
              To change it, set <code className="font-mono">DRY_RUN</code> in <code className="font-mono">api/.env</code> and restart the API.
              TEST_RECIPIENT is also configured there.
            </Notice>
          </div>
        </div>
      )}
    </div>
  );
}
