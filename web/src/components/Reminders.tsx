"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { formatKarachi, karachiInputFromNow, karachiInputToUtcIso, utcIsoToKarachiInput } from "@/lib/time";
import { contactHref, type ProfessorListItem, type Reminder } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { IconBell, IconCheck, IconPencil, IconPlus, IconTrash } from "./icons";
import { useToast } from "./Toast";
import { Badge, Button, EmptyState, ErrorBox, Field, Input, KindIcon, Loading, Select, Textarea, link } from "./ui";

interface FormState {
  title: string;
  note: string;
  due: string;
  contactId: string;
}

/** Quick due-time presets, in minutes from now. */
const PRESETS: { label: string; minutes: number }[] = [
  { label: "1 hour", minutes: 60 },
  { label: "Tomorrow", minutes: 24 * 60 },
  { label: "3 days", minutes: 3 * 24 * 60 },
  { label: "1 week", minutes: 7 * 24 * 60 },
];

export function ReminderForm({
  initial,
  contacts,
  fixedContactId,
  onSaved,
  onCancel,
}: {
  initial?: Reminder;
  /** Options for the "Related to" select; omitted when the contact is fixed. */
  contacts?: ProfessorListItem[];
  fixedContactId?: string;
  onSaved: (r: Reminder) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>({
    title: initial?.title ?? "",
    note: initial?.note ?? "",
    due: initial ? utcIsoToKarachiInput(initial.dueAt) : karachiInputFromNow(24 * 60),
    contactId: initial?.contactId ?? fixedContactId ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let dueAt: string;
    try {
      dueAt = karachiInputToUtcIso(form.due);
    } catch (err) {
      setError(errorMessage(err));
      return;
    }
    setBusy(true);
    try {
      const body = {
        title: form.title,
        note: form.note || null,
        dueAt,
        contactId: form.contactId || null,
      };
      const saved = initial ? await api.updateReminder(initial.id, body) : await api.createReminder(body);
      onSaved(saved);
      if (!initial) setForm((f) => ({ ...f, title: "", note: "" }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <ErrorBox error={error} />
      <Field label="What to remember" htmlFor="rem-title">
        <Input
          id="rem-title"
          required
          maxLength={200}
          placeholder="e.g. Follow up on the scholarship deadline"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="When (PKT)" htmlFor="rem-due">
          <Input id="rem-due" type="datetime-local" required value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <Button key={p.label} size="sm" variant="ghost" onClick={() => setForm({ ...form, due: karachiInputFromNow(p.minutes) })}>
                {p.label}
              </Button>
            ))}
          </div>
        </Field>
        {!fixedContactId && contacts && (
          <Field label="Related to (optional)" htmlFor="rem-contact">
            <Select id="rem-contact" value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })}>
              <option value="">Nothing specific</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.university}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <Field label="Note (optional)" htmlFor="rem-note">
        <Textarea id="rem-note" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : initial ? "Save reminder" : "Add reminder"}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** Current time, refreshed every minute (keeps "overdue" correct without calling Date.now during render). */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function ReminderRow({
  reminder: r,
  showContact = true,
  onChanged,
  onDeleted,
  onEdit,
}: {
  reminder: Reminder;
  showContact?: boolean;
  onChanged: (r: Reminder) => void;
  onDeleted: (id: string) => void;
  onEdit?: (r: Reminder) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function toggleDone() {
    setBusy(true);
    try {
      onChanged(await api.updateReminder(r.id, { done: !r.doneAt }));
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete reminder "${r.title}"?`)) return;
    setBusy(true);
    try {
      await api.deleteReminder(r.id);
      onDeleted(r.id);
    } catch (err) {
      toast(errorMessage(err), "error");
      setBusy(false);
    }
  }

  const now = useNow();
  const overdue = !r.doneAt && Date.parse(r.dueAt) <= now;
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <button
        type="button"
        aria-label={r.doneAt ? "Mark as not done" : "Mark as done"}
        disabled={busy}
        onClick={toggleDone}
        className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border ${
          r.doneAt ? "border-accent bg-accent text-on-accent" : "border-border-input bg-surface hover:border-accent"
        }`}
      >
        {r.doneAt && <IconCheck size={12} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-[13px] font-medium ${r.doneAt ? "text-muted line-through" : "text-text"}`}>{r.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>{formatKarachi(r.dueAt)}</span>
          {overdue && <Badge tone="failed">Overdue</Badge>}
          {showContact && r.contact && (
            <Link href={contactHref(r.contact)} className={`${link} inline-flex items-center gap-1`}>
              <KindIcon kind={r.contact.kind} size={12} />
              {r.contact.name} · {r.contact.university}
            </Link>
          )}
        </p>
        {r.note && <p className="mt-1 text-xs whitespace-pre-wrap text-muted">{r.note}</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        {onEdit && !r.doneAt && (
          <Button size="sm" variant="ghost" aria-label="Edit reminder" disabled={busy} onClick={() => onEdit(r)}>
            <IconPencil />
          </Button>
        )}
        <Button size="sm" variant="ghost" aria-label="Delete reminder" disabled={busy} onClick={remove}>
          <IconTrash />
        </Button>
      </div>
    </li>
  );
}

/** Reminders for one contact, with an inline add form (used on the contact page). */
export function ContactReminders({ contactId }: { contactId: string }) {
  const { data, error, loading, reload } = useApi(() => api.listReminders({ contactId, status: "all" }), [contactId]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [items, setItems] = useState<Reminder[] | null>(null);
  const list = items ?? data ?? [];
  const sorted = [...list].sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt) || Date.parse(a.dueAt) - Date.parse(b.dueAt));

  const upsert = (r: Reminder) => setItems([...list.filter((x) => x.id !== r.id), r]);

  return (
    <section className="mb-4 overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text">
          <IconBell /> Reminders
        </h2>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <IconPlus /> Add reminder
          </Button>
        )}
      </div>
      {(adding || editing) && (
        <div className="border-b border-border p-4">
          <ReminderForm
            key={editing?.id ?? "new"}
            initial={editing ?? undefined}
            fixedContactId={contactId}
            onSaved={(r) => {
              upsert(r);
              setAdding(false);
              setEditing(null);
            }}
            onCancel={() => {
              setAdding(false);
              setEditing(null);
            }}
          />
        </div>
      )}
      {loading && !data ? (
        <div className="p-4">
          <Loading rows={2} />
        </div>
      ) : error ? (
        <div className="p-4">
          <ErrorBox error={error} onRetry={reload} />
        </div>
      ) : sorted.length === 0 ? (
        !adding && (
          <EmptyState compact title="No reminders">
            Add one to follow up, prepare for an interview or track a deadline. You get an email when it is due.
          </EmptyState>
        )
      ) : (
        <ul className="divide-y divide-border">
          {sorted.map((r) => (
            <ReminderRow
              key={r.id}
              reminder={r}
              showContact={false}
              onChanged={upsert}
              onDeleted={(id) => setItems(list.filter((x) => x.id !== id))}
              onEdit={(x) => {
                setAdding(false);
                setEditing(x);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
