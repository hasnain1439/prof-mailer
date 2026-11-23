"use client";

import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import type { SenderProfile } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useToast } from "./Toast";
import { Button, Card, ErrorBox, Field, Input, Loading, Textarea } from "./ui";

type Key = keyof SenderProfile;

const FIELDS: { key: Key; label: string; placeholder: string; type?: string }[] = [
  { key: "myName", label: "Full name", placeholder: "Hasnain Iqbal" },
  { key: "myTitle", label: "Title / headline", placeholder: "Full Stack Developer" },
  { key: "myEmail", label: "Contact email", placeholder: "Defaults to your Gmail", type: "email" },
  { key: "myPhone", label: "Phone", placeholder: "+92 300 1234567" },
  { key: "myLinkedIn", label: "LinkedIn URL", placeholder: "https://linkedin.com/in/…", type: "url" },
  { key: "myPortfolio", label: "Portfolio / GitHub URL", placeholder: "https://…", type: "url" },
  { key: "myEducation", label: "Education", placeholder: "BS Computer Science, FAST NUCES" },
];

const EMPTY: Record<Key, string> = {
  myName: "",
  myTitle: "",
  myEmail: "",
  myPhone: "",
  myLinkedIn: "",
  myPortfolio: "",
  myEducation: "",
  mySummary: "",
};

/** Settings card: the user's own details, filled into templates as {{myName}}, {{myTitle}}, ... */
export function SenderProfileCard() {
  const toast = useToast();
  const { data, error, reload } = useApi(() => api.getSenderProfile());
  const [form, setForm] = useState<Record<Key, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loaded = data?.profile;
  const f: Record<Key, string> | null =
    form ?? (loaded ? (Object.fromEntries(Object.keys(EMPTY).map((k) => [k, loaded[k as Key] ?? ""])) as Record<Key, string>) : null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setBusy(true);
    setSaveError(null);
    try {
      await api.saveSenderProfile(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null])) as unknown as SenderProfile);
      setForm(null);
      reload();
      toast("Profile saved. New emails use it.");
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Your profile"
      description="Used in templates as {{myName}}, {{myTitle}}, {{myEmail}}, {{myPhone}}, {{myLinkedIn}}, {{myPortfolio}}, {{myEducation}} and {{mySummary}}, so a template has no personal details typed in."
    >
      <ErrorBox error={error} onRetry={reload} />
      {!f ? (
        !error && <Loading rows={3} />
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <ErrorBox error={saveError} />
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((x) => (
              <Field key={x.key} label={x.label} htmlFor={`sp-${x.key}`} hint={<code className="font-mono">{`{{${x.key}}}`}</code>}>
                <Input
                  id={`sp-${x.key}`}
                  type={x.type ?? "text"}
                  placeholder={x.placeholder}
                  value={f[x.key]}
                  onChange={(e) => setForm({ ...f, [x.key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <Field
            label="Summary (a short paragraph about your experience)"
            htmlFor="sp-mySummary"
            hint={
              <>
                <code className="font-mono">{"{{mySummary}}"}</code>, e.g. your years of experience, current job and one result you are proud of.
              </>
            }
          >
            <Textarea
              id="sp-mySummary"
              rows={5}
              maxLength={2000}
              placeholder="I have over two years of experience building web and mobile applications with React, Next.js, Node.js…"
              value={f.mySummary}
              onChange={(e) => setForm({ ...f, mySummary: e.target.value })}
            />
          </Field>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </Button>
        </form>
      )}
    </Card>
  );
}
