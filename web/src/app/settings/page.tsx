"use client";

import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import type { SettingsInput, SettingsResponse } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { Card, ErrorBox, Loading, PageHeader, SuccessBox, btnPrimary, input, label } from "@/components/ui";

function SettingsForm({ initial, onSaved }: { initial: SettingsResponse; onSaved: (s: SettingsResponse) => void }) {
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
      onSaved(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const num = (k: "followUpAfterDays" | "maxFollowUps" | "dailySendLimit", title: string, min: number, max: number, help: string) => (
    <div>
      <label className={label} htmlFor={`s-${k}`}>
        {title}
      </label>
      <input
        id={`s-${k}`}
        type="number"
        required
        min={min}
        max={max}
        step={1}
        className={input}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
      <p className="mt-1 text-xs text-neutral-500">{help}</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorBox error={error} />
      {saved && <SuccessBox>Settings saved.</SuccessBox>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {num("followUpAfterDays", "Follow up after (days)", 1, 60, "1–60 days without a reply")}
        {num("maxFollowUps", "Max follow-ups", 0, 10, "0–10 per professor (0 disables)")}
        {num("dailySendLimit", "Daily send limit", 1, 500, "1–500 emails per Karachi day")}
      </div>
      <div>
        <label className={label} htmlFor="s-tpl">
          Follow-up template
        </label>
        <select
          id="s-tpl"
          className={input}
          value={form.followUpTemplateId}
          onChange={(e) => setForm({ ...form, followUpTemplateId: e.target.value })}
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
        {templates.error && <p className="mt-1 text-xs text-red-700">Could not load templates: {templates.error}</p>}
        <p className="mt-1 text-xs text-neutral-500">Only templates marked as follow-up are listed.</p>
      </div>
      <div className="flex justify-end">
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-neutral-100 py-2 text-sm last:border-0">
      <span className="text-neutral-500">{name}</span>
      <span className="text-right text-neutral-900">{children}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { data, error, loading, reload } = useApi(() => api.getSettings());
  const [latest, setLatest] = useState<SettingsResponse | null>(null);
  const s = latest ?? data;

  return (
    <div>
      <PageHeader title="Settings" />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && s && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <Card title="Sending & follow-ups">
            <SettingsForm initial={data} onSaved={setLatest} />
          </Card>
          <Card title="Environment (read-only)">
            <Row name="DRY_RUN">
              {s.dryRun ? <span className="font-semibold text-amber-700">ON</span> : <span className="font-semibold text-green-700">OFF (real sends)</span>}
            </Row>
            <Row name="Test recipient configured">{s.testRecipientSet ? "Yes" : "No"}</Row>
            <Row name="Timezone">{s.timezone}</Row>
            <Row name="Sent today">
              {s.sentToday} / {s.dailySendLimit}
            </Row>
            <p className="mt-3 text-xs text-neutral-500">
              {s.dryRun ? "No real emails are sent while DRY_RUN is on. " : ""}
              To send for real, set <code className="font-mono">DRY_RUN=false</code> in <code className="font-mono">api/.env</code> and restart the API.
              TEST_RECIPIENT is also configured in <code className="font-mono">api/.env</code>.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
