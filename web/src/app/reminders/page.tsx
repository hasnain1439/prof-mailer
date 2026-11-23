"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Reminder } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { IconBell, IconPlus } from "@/components/icons";
import { ReminderForm, ReminderRow, useNow } from "@/components/Reminders";
import { Button, Card, EmptyCard, ErrorBox, Loading, Modal, PageHeader } from "@/components/ui";

type Tab = "open" | "done";

export default function RemindersPage() {
  const [tab, setTab] = useState<Tab>("open");
  const { data, error, loading, reload } = useApi(() => api.listReminders({ status: tab }), [tab]);
  const contacts = useApi(() => api.listProfessors(), []);
  const [items, setItems] = useState<{ tab: Tab; list: Reminder[] } | null>(null);
  const [modal, setModal] = useState<{ editing: Reminder | null } | null>(null);

  const list = items?.tab === tab ? items.list : (data ?? []);
  const setList = (next: Reminder[]) => setItems({ tab, list: next });

  /** Keep a saved/toggled reminder only if it still belongs to the current tab. */
  function upsert(r: Reminder) {
    const belongs = tab === "open" ? !r.doneAt : !!r.doneAt;
    const rest = list.filter((x) => x.id !== r.id);
    setList(belongs ? [...rest, r].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)) : rest);
  }

  const now = useNow();
  const overdue = tab === "open" ? list.filter((r) => Date.parse(r.dueAt) <= now) : [];
  const upcoming = tab === "open" ? list.filter((r) => Date.parse(r.dueAt) > now) : list;

  const rows = (rs: Reminder[]) => (
    <ul className="divide-y divide-border">
      {rs.map((r) => (
        <ReminderRow
          key={r.id}
          reminder={r}
          onChanged={upsert}
          onDeleted={(id) => setList(list.filter((x) => x.id !== id))}
          onEdit={(x) => setModal({ editing: x })}
        />
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader
        title="Reminders"
        description="Anything you want to remember: follow-ups, deadlines, interviews. Link one to a professor or company if it is about them. You get an email when it is due."
      >
        <Button variant="primary" onClick={() => setModal({ editing: null })}>
          <IconPlus /> New reminder
        </Button>
      </PageHeader>

      <div role="tablist" aria-label="Reminder status" className="mb-4 inline-flex rounded-md border border-border bg-surface p-0.5">
        {(["open", "done"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-7 rounded-sm px-3 text-[13px] ${tab === t ? "bg-bg font-medium text-text" : "text-muted hover:text-text"}`}
          >
            {t === "open" ? "To do" : "Done"}
          </button>
        ))}
      </div>

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Loading rows={4} />
      ) : list.length === 0 ? (
        <EmptyCard
          icon={<IconBell size={20} />}
          title={tab === "open" ? "Nothing to remember yet" : "No finished reminders"}
          action={
            tab === "open" && (
              <Button variant="primary" onClick={() => setModal({ editing: null })}>
                <IconPlus /> New reminder
              </Button>
            )
          }
        >
          {tab === "open" ? "Add a reminder for a deadline, an interview or a follow-up." : "Reminders you tick off show up here."}
        </EmptyCard>
      ) : (
        <>
          {overdue.length > 0 && (
            <Card title={`Overdue (${overdue.length})`} flush>
              {rows(overdue)}
            </Card>
          )}
          {upcoming.length > 0 && (
            <Card title={tab === "open" ? `Upcoming (${upcoming.length})` : `Done (${upcoming.length})`} flush>
              {rows(upcoming)}
            </Card>
          )}
        </>
      )}

      <Modal open={modal !== null} title={modal?.editing ? "Edit reminder" : "New reminder"} onClose={() => setModal(null)}>
        {modal && (
          <ReminderForm
            key={modal.editing?.id ?? "new"}
            initial={modal.editing ?? undefined}
            contacts={contacts.data}
            onSaved={(r) => {
              upsert(r);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
    </>
  );
}
