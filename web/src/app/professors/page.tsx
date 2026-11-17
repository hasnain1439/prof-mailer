"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { PROFESSOR_STATUSES, type ProfessorListItem, type ProfessorStatus } from "@/lib/types";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { ProfessorForm } from "@/components/ProfessorForm";
import {
  Empty,
  ErrorBox,
  Loading,
  Modal,
  PageHeader,
  btnDanger,
  btnPrimary,
  btnSecondary,
  btnSmall,
  input,
  label,
  table,
  td,
  th,
} from "@/components/ui";

export default function ProfessorsPage() {
  const [status, setStatus] = useState<ProfessorStatus | "">("");
  const [country, setCountry] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ProfessorListItem | "new" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const list = useApi(() => api.listProfessors({ status, country, q: q.trim() }), [status, country, q]);
  const countries = useApi(() => api.countries());

  function afterChange() {
    list.reload();
    countries.reload();
  }

  async function changeStatus(p: ProfessorListItem, s: ProfessorStatus) {
    setActionError(null);
    try {
      await api.updateProfessor(p.id, { status: s });
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
      afterChange();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  return (
    <div>
      <PageHeader title="Professors">
        <button type="button" className={btnPrimary} onClick={() => setEditing("new")}>
          New professor
        </button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="f-q">
            Search
          </label>
          <input
            id="f-q"
            className={input}
            placeholder="Name, email or university"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div>
          <label className={label} htmlFor="f-status">
            Status
          </label>
          <select id="f-status" className={input} value={status} onChange={(e) => setStatus(e.target.value as ProfessorStatus | "")}>
            <option value="">All statuses</option>
            {PROFESSOR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
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
      {list.loading && !list.data && <Loading />}

      {list.data &&
        (list.data.length === 0 ? (
          <Empty>No professors match.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className={table}>
              <thead>
                <tr>
                  <th className={th}>Name</th>
                  <th className={th}>University</th>
                  <th className={th}>Country</th>
                  <th className={th}>Status</th>
                  <th className={th}>Emails</th>
                  <th className={th}>Last sent</th>
                  <th className={th}>Next scheduled</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((p) => (
                  <tr key={p.id} className="hover:bg-neutral-50">
                    <td className={td}>
                      <Link href={`/professors/${p.id}`} className="font-medium text-neutral-900 hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-xs text-neutral-500">{p.email}</div>
                    </td>
                    <td className={td}>{p.university}</td>
                    <td className={td}>{p.country ?? "—"}</td>
                    <td className={td}>
                      <select
                        aria-label={`Status for ${p.name}`}
                        className={`${input} !w-auto !py-1 text-xs`}
                        value={p.status}
                        onChange={(e) => changeStatus(p, e.target.value as ProfessorStatus)}
                      >
                        {PROFESSOR_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={td}>{p.emailCount}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatKarachi(p.lastSentAt)}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatKarachi(p.nextScheduledAt)}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <div className="flex gap-1">
                        <button type="button" className={`${btnSecondary} ${btnSmall}`} onClick={() => setEditing(p)}>
                          Edit
                        </button>
                        <button type="button" className={`${btnDanger} ${btnSmall}`} onClick={() => remove(p)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      <Modal open={editing !== null} title={editing === "new" ? "New professor" : "Edit professor"} onClose={() => setEditing(null)} wide>
        {editing !== null && (
          <ProfessorForm
            key={editing === "new" ? "new" : editing.id}
            professor={editing === "new" ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              afterChange();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
