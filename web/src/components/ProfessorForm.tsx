"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import { PROFESSOR_STATUSES, type ContactKind, type Professor, type ProfessorInput, type ProfessorStatus } from "@/lib/types";
import { IconBuilding, IconGraduation } from "./icons";
import { Button, ErrorBox, Field, Input, Select, Textarea, professorStatusLabel } from "./ui";

type FormState = Required<{ [K in keyof ProfessorInput]: K extends "status" ? ProfessorStatus : K extends "kind" ? ContactKind : string }>;

function initial(p?: Professor, kind?: ContactKind): FormState {
  return {
    kind: p?.kind ?? kind ?? "PROFESSOR",
    name: p?.name ?? "",
    email: p?.email ?? "",
    university: p?.university ?? "",
    country: p?.country ?? "",
    researchFocus: p?.researchFocus ?? "",
    whyFits: p?.whyFits ?? "",
    profileUrl: p?.profileUrl ?? "",
    role: p?.role ?? "",
    jobUrl: p?.jobUrl ?? "",
    status: p?.status ?? "NOT_SENT",
    notes: p?.notes ?? "",
  };
}

/** Create (no `professor`) or edit form for a contact (professor or company). Empty optional fields are sent as "" which the API stores as null. */
export function ProfessorForm({
  professor,
  kind,
  onSaved,
  onCancel,
}: {
  professor?: Professor;
  /** Fixes the contact type (hides the Professor / Company switch). */
  kind?: ContactKind;
  onSaved: (p: Professor) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => initial(professor, kind));
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
    k: Exclude<keyof FormState, "status" | "kind">,
    title: string,
    opts: { required?: boolean; type?: string; mono?: boolean; placeholder?: string } = {},
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
        placeholder={opts.placeholder}
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
      />
    </Field>
  );

  const company = form.kind === "COMPANY";
  const statusField = (
    <Field label="Status" htmlFor="pf-status">
      <Select id="pf-status" value={form.status} onChange={(e) => set("status", e.target.value as ProfessorStatus)}>
        {PROFESSOR_STATUSES.map((s) => (
          <option key={s} value={s}>
            {professorStatusLabel(s, form.kind)}
          </option>
        ))}
      </Select>
    </Field>
  );

  const kindOption = (k: ContactKind, title: string, icon: ReactNode) => {
    const active = form.kind === k;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => set("kind", k)}
        className={`inline-flex h-7 items-center gap-1.5 rounded-[5px] border px-2.5 text-[13px] font-medium transition-colors ${
          active ? "border-border bg-surface text-text" : "border-transparent text-muted hover:text-text"
        }`}
      >
        {icon}
        {title}
      </button>
    );
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <ErrorBox error={error} />
      {!kind && (
        <div role="radiogroup" aria-label="Contact type" className="inline-flex gap-0.5 rounded-md border border-border bg-bg p-0.5">
          {kindOption("PROFESSOR", "Professor", <IconGraduation size={14} />)}
          {kindOption("COMPANY", "Company", <IconBuilding size={14} />)}
        </div>
      )}
      {company ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {text("university", "Company", { required: true })}
            {text("role", "Role", { placeholder: "e.g. Junior Backend Engineer" })}
            {text("name", "Contact person", { required: true, placeholder: "Recruiter name, or Hiring Team" })}
            {text("email", "Email", { required: true, type: "email", mono: true })}
            {text("jobUrl", "Job link", { type: "url", mono: true })}
            {text("country", "Country")}
            {statusField}
          </div>
          {text("researchFocus", "Skills / stack", { placeholder: "Optional, e.g. TypeScript, Node.js, PostgreSQL" })}
          <Field label="Why you fit" htmlFor="pf-whyFits">
            <Textarea id="pf-whyFits" rows={3} value={form.whyFits} onChange={(e) => set("whyFits", e.target.value)} />
          </Field>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {text("name", "Name", { required: true })}
            {text("email", "Email", { required: true, type: "email", mono: true })}
            {text("university", "University", { required: true })}
            {text("country", "Country")}
            {text("profileUrl", "Profile URL", { type: "url", mono: true })}
            {statusField}
          </div>
          {text("researchFocus", "Research focus")}
          <Field label="Why I fit" htmlFor="pf-whyFits">
            <Textarea id="pf-whyFits" rows={3} value={form.whyFits} onChange={(e) => set("whyFits", e.target.value)} />
          </Field>
        </>
      )}
      <Field label="Notes" htmlFor="pf-notes">
        <Textarea id="pf-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <div className="-mx-4 -mb-4 mt-4 flex justify-end gap-2 border-t border-border bg-bg px-4 py-3">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : professor ? "Save changes" : company ? "Create company" : "Create professor"}
        </Button>
      </div>
    </form>
  );
}
