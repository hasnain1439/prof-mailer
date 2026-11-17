"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { PROFESSOR_STATUSES, type ProfessorListItem, type ProfessorStatus } from "@/lib/types";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { IconPencil, IconPlus, IconSearch, IconTrash, IconUpload, IconUsers } from "@/components/icons";
import { ProfessorForm } from "@/components/ProfessorForm";
import { useToast } from "@/components/Toast";
import {
  Avatar,
  EmptyCard,
  ErrorBox,
  Modal,
  PageHeader,
  TableSkeleton,
  btnDanger,
  btnPrimary,
  btnSecondary,
  btnSmall,
  input,
  label,
  profStatusStyles,
  professorStatusLabel,
  table,
  tableWrap,
  td,
  th,
  tr,
} from "@/components/ui";

export default function ProfessorsPage() {
  const toast = useToast();
  const [status, setStatus] = useState<ProfessorStatus | "">("");
  const [country, setCountry] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ProfessorListItem | "new" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const list = useApi(() => api.listProfessors({ status, country, q: q.trim() }), [status, country, q]);
  const countries = useApi(() => api.countries());
  const filtered = status !== "" || country !== "" || q.trim() !== "";

  function afterChange() {
    list.reload();
    countries.reload();
  }

  async function changeStatus(p: ProfessorListItem, s: ProfessorStatus) {
    setActionError(null);
    try {
      await api.updateProfessor(p.id, { status: s });
      toast(`${p.name} marked as ${professorStatusLabel(s)}.`);
      list.reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  async function remove(p: ProfessorListItem) {
    if (!window.confirm(`Delete ${p.name}? This also deletes all ${p.emailCount} of their emails.`)) return;
    setActionError(null);
    try {
      await api.deleteProfessor(p.id);
      toast(`${p.name} deleted.`);
      afterChange();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  return (
    <div>
      <PageHeader title="Professors" description="Everyone you're reaching out to, with their status and email history.">
        <Link href="/import" className={btnSecondary}>
          <IconUpload size={16} />
          Import
        </Link>
        <button type="button" className={btnPrimary} onClick={() => setEditing("new")}>
          <IconPlus size={16} />
          New professor
        </button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5 sm:grid-cols-[2fr_1fr_1fr]">
        <div>
          <label className={label} htmlFor="f-q">
            Search
          </label>
          <div className="relative">
            <IconSearch size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input id="f-q" className={`${input} pl-9`} placeholder="Name, email or university" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="f-status">
            Status
          </label>
          <select id="f-status" className={input} value={status} onChange={(e) => setStatus(e.target.value as ProfessorStatus | "")}>
            <option value="">All statuses</option>
            {PROFESSOR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {professorStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="f-country">
            Country
          </label>
          <select id="f-country" className={input} value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All countries</option>
            {(countries.data ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ErrorBox error={actionError} />
      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.loading && !list.data && <TableSkeleton cols={6} />}

      {list.data &&
        (list.data.length === 0 ? (
          filtered ? (
            <EmptyCard
              icon={<IconSearch size={20} />}
              title="No professors match your filters"
              action={
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => {
                    setQ("");
                    setStatus("");
                    setCountry("");
                  }}
                >
                  Clear filters
                </button>
              }
            >
              Try a different search term, status or country.
            </EmptyCard>
          ) : (
            <EmptyCard
              icon={<IconUsers size={20} />}
              title="No professors yet"
              action={
                <>
                  <Link href="/import" className={btnPrimary}>
                    <IconUpload size={16} />
                    Import from CSV/XLSX
                  </Link>
                  <button type="button" className={btnSecondary} onClick={() => setEditing("new")}>
                    Add one manually
                  </button>
                </>
              }
            >
              Import a spreadsheet of professors to schedule emails in bulk, or add them one at a time.
            </EmptyCard>
          )
        ) : (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
            <div className="border-b border-slate-100 px-5 py-2.5 text-xs text-slate-500">
              {list.data.length} professor{list.data.length === 1 ? "" : "s"}
              {filtered && " matching filters"}
            </div>
            <div className={tableWrap}>
              <table className={table}>
                <thead>
                  <tr>
                    <th className={th}>Professor</th>
                    <th className={th}>University</th>
                    <th className={th}>Status</th>
                    <th className={`${th} text-right`}>Emails</th>
                    <th className={th}>Last sent</th>
                    <th className={th}>Next scheduled</th>
                    <th className={th}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((p) => (
                    <tr key={p.id} className={tr}>
                      <td className={td}>
                        <div className="flex items-center gap-3">
                          <Avatar name={p.name} size="sm" />
                          <div className="min-w-0">
                            <Link href={`/professors/${p.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                              {p.name}
                            </Link>
                            <div className="truncate text-xs text-slate-500">{p.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className={td}>
                        <div className="text-slate-800">{p.university}</div>
                        {p.country && <div className="text-xs text-slate-500">{p.country}</div>}
                      </td>
                      <td className={td}>
                        <select
                          aria-label={`Status for ${p.name}`}
                          className={`cursor-pointer rounded-full border-0 py-0.5 pr-7 pl-2.5 text-xs font-medium ring-1 ring-inset focus:ring-2 focus:ring-indigo-500 focus:outline-none ${profStatusStyles[p.status].cls}`}
                          value={p.status}
                          onChange={(e) => changeStatus(p, e.target.value as ProfessorStatus)}
                        >
                          {PROFESSOR_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {professorStatusLabel(s)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={`${td} text-right tabular-nums`}>{p.emailCount}</td>
                      <td className={`${td} whitespace-nowrap text-xs`}>{formatKarachi(p.lastSentAt)}</td>
                      <td className={`${td} whitespace-nowrap text-xs`}>{formatKarachi(p.nextScheduledAt)}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        <div className="flex justify-end gap-1.5">
                          <button type="button" className={`${btnSecondary} ${btnSmall}`} onClick={() => setEditing(p)}>
                            <IconPencil size={13} />
                            Edit
                          </button>
                          <button type="button" aria-label={`Delete ${p.name}`} className={`${btnDanger} ${btnSmall}`} onClick={() => remove(p)}>
                            <IconTrash size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      <Modal open={editing !== null} title={editing === "new" ? "New professor" : "Edit professor"} onClose={() => setEditing(null)} wide>
        {editing !== null && (
          <ProfessorForm
            key={editing === "new" ? "new" : editing.id}
            professor={editing === "new" ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSaved={(p) => {
              toast(editing === "new" ? `${p.name} added.` : `${p.name} saved.`);
              setEditing(null);
              afterChange();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
