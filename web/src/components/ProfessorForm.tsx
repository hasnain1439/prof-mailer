"use client";

import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { PROFESSOR_STATUSES, type Professor, type ProfessorInput, type ProfessorStatus } from "@/lib/types";
import { Button, ErrorBox, Field, Input, Select, Textarea, professorStatusLabel } from "./ui";

type FormState = Required<{ [K in keyof ProfessorInput]: K extends "status" ? ProfessorStatus : string }>;

function initial(p?: Professor): FormState {
  return {
    name: p?.name ?? "",
    email: p?.email ?? "",
    university: p?.university ?? "",
    country: p?.country ?? "",
    researchFocus: p?.researchFocus ?? "",
    whyFits: p?.whyFits ?? "",
    profileUrl: p?.profileUrl ?? "",
    status: p?.status ?? "NOT_SENT",
    notes: p?.notes ?? "",
  };
}

/** Create (no `professor`) or edit form. Empty optional fields are sent as "" which the API stores as null. */
export function ProfessorForm({
  professor,
  onSaved,
  onCancel,
}: {
  professor?: Professor;
  onSaved: (p: Professor) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => initial(professor));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = professor ? await api.updateProfessor(professor.id, form) : await api.createProfessor(form);
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const text = (
    k: Exclude<keyof FormState, "status">,
    title: string,
    opts: { required?: boolean; type?: string; mono?: boolean } = {},
  ) => (
    <Field
      htmlFor={`pf-${k}`}
      label={
        <>
          {title}
          {opts.required && (
            <span className="text-failed-fg" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </>
      }
    >
      <Input
        id={`pf-${k}`}
        type={opts.type ?? "text"}
        required={opts.required}
        className={opts.mono ? "font-mono" : ""}
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      <ErrorBox error={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {text("name", "Name", { required: true })}
        {text("email", "Email", { required: true, type: "email", mono: true })}
        {text("university", "University", { required: true })}
        {text("country", "Country")}
        {text("profileUrl", "Profile URL", { type: "url", mono: true })}
        <Field label="Status" htmlFor="pf-status">
          <Select id="pf-status" value={form.status} onChange={(e) => set("status", e.target.value as ProfessorStatus)}>
            {PROFESSOR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {professorStatusLabel(s)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {text("researchFocus", "Research focus")}
      <Field label="Why I fit" htmlFor="pf-whyFits">
        <Textarea id="pf-whyFits" rows={3} value={form.whyFits} onChange={(e) => set("whyFits", e.target.value)} />
      </Field>
      <Field label="Notes" htmlFor="pf-notes">
        <Textarea id="pf-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <div className="-mx-4 -mb-4 mt-4 flex justify-end gap-2 border-t border-border bg-bg px-4 py-3">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : professor ? "Save changes" : "Create professor"}
        </Button>
      </div>
    </form>
  );
}
