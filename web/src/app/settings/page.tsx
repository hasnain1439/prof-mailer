"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import type { SettingsInput, SettingsResponse } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useGmailStatus } from "@/components/GmailStatus";
import { IconCheck } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, ErrorBox, Loading, Mono, Notice, PageHeader, Select, input, link } from "@/components/ui";

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
    <FieldRow label={title} htmlFor={`s-${k}`} hint={help}>
      <div className="flex items-center gap-2">
        <input
          id={`s-${k}`}
          type="number"
          required
          min={min}
          max={max}
          step={1}
          className={`${input} !w-28 font-mono tabular-nums`}
          value={form[k]}
          onChange={(e) => {
            setSaved(false);
            setForm({ ...form, [k]: e.target.value });
          }}
        />
        <span className="text-xs text-muted">{suffix}</span>
      </div>
    </FieldRow>
  );

  const noFollowUps = templates.data && templates.data.length === 0;

  return (
    <form onSubmit={submit}>
      <div className="px-4">
        {error && (
          <div className="pt-4">
            <ErrorBox error={error} />
          </div>
        )}
        <Section title="Sending" description="Caps how many emails go out per Karachi calendar day.">
          {num("dailySendLimit", "Daily send limit", 1, 500, "1–500 emails per day", "emails")}
        </Section>
        <Section title="Follow-ups" description="Automatically nudge professors who haven't replied.">
          {num("followUpAfterDays", "Follow up after", 1, 60, "1–60 days without a reply", "days")}
          {num("maxFollowUps", "Max follow-ups", 0, 10, "0–10 per professor (0 disables)", "per professor")}
          <FieldRow
            label="Follow-up template"
            htmlFor="s-tpl"
            hint={
              <>
                {templates.error && <span className="block text-failed-fg">Could not load templates: {templates.error}</span>}
                {noFollowUps ? (
                  <span className="text-replied-fg">
                    You have no follow-up templates yet.{" "}
                    <Link href="/templates" className={link}>
                      Create one
                    </Link>{" "}
                    and tick “Follow-up template”.
                  </span>
                ) : (
                  "Only templates marked as follow-up are listed."
                )}
              </>
            }
          >
            <Select
              id="s-tpl"
              className="max-w-sm"
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
            </Select>
          </FieldRow>
        </Section>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-border px-4 py-3">
        {saved && (
          <span className="inline-flex items-center gap-1 text-[13px] text-sent-fg">
            <IconCheck size={14} />
            Saved
          </span>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}

/** A titled group of field rows; groups are separated by a 1px rule. */
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="border-b border-border py-4 last:border-b-0">
      <h3 className="text-[13px] font-semibold text-text">{title}</h3>
      <p className="text-xs text-muted">{description}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

/** Label on the left, compact control (and hint) on the right; stacks on small screens. */
function FieldRow({ label: text, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-text sm:pt-1.5">
        {text}
      </label>
      <div className="min-w-0">
        {children}
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

function Row({ name, children }: { name: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-[13px]">
      <dt className="shrink-0 text-muted">{name}</dt>
      <dd className="min-w-0 text-right text-text">{children}</dd>
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
        <div className="grid max-w-6xl grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
          <Loading rows={5} />
          <Loading rows={4} />
        </div>
      )}
      {data && s && (
        <div className="grid max-w-6xl grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
          <Card title="Sending and follow-ups" flush>
            <SettingsForm initial={data} onSaved={setLatest} />
          </Card>
          <div>
            <Card title="Environment" description="Read-only">
              <dl className="-my-2 divide-y divide-border">
                <Row name="Sending from">
                  {gmail.data?.connected ? (
                    <Mono className="break-all">{gmail.data.email ?? "Connected"}</Mono>
                  ) : (
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone="replied">Not connected</Badge>
                      <Link href="/gmail" className={link}>
                        Connect
                      </Link>
                    </span>
                  )}
                </Row>
                <Row name={<Mono className="!text-xs">DRY_RUN</Mono>}>
                  {s.dryRun ? <Badge tone="replied">On: logged only</Badge> : <Badge tone="sent">Off: real sends</Badge>}
                </Row>
                <Row name="Test recipient">{s.testRecipientSet ? "Configured" : "Not set"}</Row>
                <Row name="Timezone">
                  <Mono>{s.timezone}</Mono>
                </Row>
                <Row name="Sent today">
                  <Mono>
                    {s.sentToday} / {s.dailySendLimit}
                  </Mono>
                </Row>
              </dl>
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
