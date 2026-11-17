"use client";

import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { PROFESSOR_STATUSES, type Professor, type ProfessorInput, type ProfessorStatus } from "@/lib/types";
import { ErrorBox, btnPrimary, btnSecondary, input, label } from "./ui";

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

  const text = (k: Exclude<keyof FormState, "status">, title: string, opts: { required?: boolean; type?: string } = {}) => (
    <div>
      <label className={label} htmlFor={`pf-${k}`}>
        {title}
        {opts.required && " *"}
      </label>
      <input
        id={`pf-${k}`}
        type={opts.type ?? "text"}
        required={opts.required}
        className={input}
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
      />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      <ErrorBox error={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {text("name", "Name", { required: true })}
        {text("email", "Email", { required: true, type: "email" })}
        {text("university", "University", { required: true })}
        {text("country", "Country")}
        {text("profileUrl", "Profile URL", { type: "url" })}
        <div>
          <label className={label} htmlFor="pf-status">
            Status
          </label>
          <select id="pf-status" className={input} value={form.status} onChange={(e) => set("status", e.target.value as ProfessorStatus)}>
            {PROFESSOR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      {text("researchFocus", "Research focus")}
      <div>
        <label className={label} htmlFor="pf-whyFits">
          Why I fit
        </label>
        <textarea id="pf-whyFits" rows={3} className={input} value={form.whyFits} onChange={(e) => set("whyFits", e.target.value)} />
      </div>
      <div>
        <label className={label} htmlFor="pf-notes">
          Notes
        </label>
        <textarea id="pf-notes" rows={2} className={input} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={btnSecondary} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? "Saving…" : professor ? "Save changes" : "Create professor"}
        </button>
      </div>
    </form>
  );
}
