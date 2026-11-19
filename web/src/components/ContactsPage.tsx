"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { contactHref, PROFESSOR_STATUSES, type ContactKind, type ProfessorListItem, type ProfessorStatus } from "@/lib/types";
import { formatKarachi } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { IconPencil, IconPlus, IconSearch, IconTrash, IconUpload, IconUsers, IconX } from "@/components/icons";
import { ProfessorForm } from "@/components/ProfessorForm";
import { useToast } from "@/components/Toast";
import {
  Button,
  EmptyCard,
  ErrorBox,
  Input,
  KindIcon,
  Modal,
  Mono,
  PageHeader,
  Select,
  Table,
  TableSkeleton,
  Td,
  Th,
  btnPrimary,
  btnSecondary,
  profStatusStyles,
  professorStatusLabel,
  tr,
} from "@/components/ui";

const COPY: Record<ContactKind, { title: string; description: string; one: string; many: string; search: string; empty: string; col: string }> = {
  PROFESSOR: {
    title: "Professors",
    description: "Professors you're emailing about Master's admissions, with their status and email history.",
    one: "professor",
    many: "professors",
    search: "Search name, email or university",
    empty: "Import a spreadsheet of professors to schedule emails in bulk, or add them one at a time.",
    col: "University",
  },
  COMPANY: {
    title: "Companies",
    description: "Companies you're applying to for jobs, with their status and email history.",
    one: "company",
    many: "companies",
    search: "Search company, role, contact or email",
    empty: "Import a spreadsheet of companies to schedule job applications in bulk, or add them one at a time.",
    col: "Company · role",
  },
};

/** List page for one contact kind (/professors or /companies). */
export function ContactsPage({ kind }: { kind: ContactKind }) {
  const c = COPY[kind];
  const importHref = `/import?type=${kind === "COMPANY" ? "company" : "professor"}`;
  const toast = useToast();
  const [status, setStatus] = useState<ProfessorStatus | "">("");
  const [country, setCountry] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ProfessorListItem | "new" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const list = useApi(() => api.listProfessors({ kind, status, country, q: q.trim() }), [kind, status, country, q]);
  const countries = useApi(() => api.countries());
  const filtered = status !== "" || country !== "" || q.trim() !== "";
  const plural = (n: number) => (n === 1 ? c.one : c.many);

  function afterChange() {
    list.reload();
    countries.reload();
  }

  function clearFilters() {
    setQ("");
    setStatus("");
    setCountry("");
  }

  async function changeStatus(p: ProfessorListItem, s: ProfessorStatus) {
    setActionError(null);
    try {
      await api.updateProfessor(p.id, { status: s });
      toast(`${p.name} marked as ${professorStatusLabel(s, p.kind)}.`);
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
      <PageHeader title={c.title} description={c.description}>
        <Link href={importHref} className={btnSecondary}>
          <IconUpload />
          Import
        </Link>
        <Button variant="primary" onClick={() => setEditing("new")}>
          <IconPlus />
          {kind === "COMPANY" ? "New company" : "New professor"}
        </Button>
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
          <Input
            id="f-q"
            type="search"
            aria-label={`Search ${c.many}`}
            className="pl-8"
            placeholder={c.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          id="f-status"
          aria-label="Filter by status"
          className="!w-auto min-w-36"
          value={status}
          onChange={(e) => setStatus(e.target.value as ProfessorStatus | "")}
        >
          <option value="">All statuses</option>
          {PROFESSOR_STATUSES.map((s) => (
            <option key={s} value={s}>
              {professorStatusLabel(s, kind)}
            </option>
          ))}
        </Select>
        <Select id="f-country" aria-label="Filter by country" className="!w-auto min-w-36" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {(countries.data ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <IconX size={14} />
            Clear
          </Button>
        )}
        {list.data && (
          <span className="ml-auto text-xs text-muted">
            <Mono className="!text-xs text-text">{list.data.length}</Mono> {plural(list.data.length)}
            {filtered && " matching filters"}
          </span>
        )}
      </div>

      <ErrorBox error={actionError} />
      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.loading && !list.data && <TableSkeleton cols={7} />}

      {list.data &&
        (list.data.length === 0 ? (
          filtered ? (
            <EmptyCard icon={<IconSearch />} title={`No ${c.many} match your filters`} action={<Button onClick={clearFilters}>Clear filters</Button>}>
              Try a different search term, status or country.
            </EmptyCard>
          ) : (
            <EmptyCard
              icon={<IconUsers />}
              title={`No ${c.many} yet`}
              action={
                <>
                  <Link href={importHref} className={btnPrimary}>
                    <IconUpload />
                    Import from CSV/XLSX
                  </Link>
                  <Button onClick={() => setEditing("new")}>Add one manually</Button>
                </>
              }
            >
              {c.empty}
            </EmptyCard>
          )
        ) : (
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            <Table
              head={
                <>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>{c.col}</Th>
                  <Th>Status</Th>
                  <Th numeric>Emails</Th>
                  <Th>Last sent</Th>
                  <Th>Next scheduled</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </>
              }
            >
              {list.data.map((p) => (
                <tr key={p.id} className={tr}>
                  <Td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <KindIcon kind={p.kind} />
                      <Link href={contactHref(p)} className="font-medium text-text underline-offset-2 hover:text-accent hover:underline">
                        {p.name}
                      </Link>
                    </span>
                  </Td>
                  <Td className="max-w-64 truncate">
                    <Mono className="text-muted">{p.email}</Mono>
                  </Td>
                  <Td className="max-w-72">
                    <div className="truncate">
                      {p.university}
                      {p.kind === "COMPANY" && p.role && <span className="text-muted"> · {p.role}</span>}
                      {p.country && <span className="text-muted"> · {p.country}</span>}
                    </div>
                  </Td>
                  <Td>
                    <select
                      aria-label={`Status for ${p.name}`}
                      className={`h-6 cursor-pointer rounded-sm border border-transparent pr-6 pl-1.5 text-xs font-medium hover:border-border focus:border-accent focus:outline-none ${profStatusStyles[p.status].cls}`}
                      value={p.status}
                      onChange={(e) => changeStatus(p, e.target.value as ProfessorStatus)}
                    >
                      {PROFESSOR_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {professorStatusLabel(s, p.kind)}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td numeric>{p.emailCount}</Td>
                  <Td className="whitespace-nowrap">
                    <Mono className="text-muted">{formatKarachi(p.lastSentAt)}</Mono>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <Mono className="text-muted">{formatKarachi(p.nextScheduledAt)}</Mono>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                        <IconPencil size={14} />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${p.name}`}
                        className="!text-failed-fg hover:!bg-failed-bg"
                        onClick={() => remove(p)}
                      >
                        <IconTrash size={14} />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
        ))}

      <Modal open={editing !== null} title={editing === "new" ? (kind === "COMPANY" ? "New company" : "New professor") : kind === "COMPANY" ? "Edit company" : "Edit professor"} onClose={() => setEditing(null)} wide>
        {editing !== null && (
          <ProfessorForm
            key={editing === "new" ? "new" : editing.id}
            professor={editing === "new" ? undefined : editing}
            kind={kind}
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
