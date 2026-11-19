"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import { formatKarachi } from "@/lib/time";
import type { AdminUser } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/components/Auth";
import { IconRefresh, IconSearch, IconUsers, IconX } from "@/components/icons";
import { useToast } from "@/components/Toast";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Input,
  Loading,
  Modal,
  Mono,
  Notice,
  PageHeader,
  Skeleton,
  Table,
  TableSkeleton,
  Td,
  Th,
  tr,
} from "@/components/ui";

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-0.5 font-mono text-xl leading-7 font-medium text-text tabular-nums">{value}</p>
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-2.5 h-5 w-12" />
    </div>
  );
}

/** "20 Nov 2026" (Karachi calendar day); the full time is in the title. */
function karachiDate(iso: string | null): string {
  return iso ? formatKarachi(iso).split(",")[0] : "—";
}

type Pending = { user: AdminUser; action: "block" | "unblock" };

function ConfirmDialog({ pending, onClose, onDone }: { pending: Pending | null; onClose: () => void; onDone: (u: AdminUser) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setError(null);
    onClose();
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const updated = pending.action === "block" ? await api.adminBlock(pending.user.id) : await api.adminUnblock(pending.user.id);
      toast(pending.action === "block" ? `Blocked ${updated.email}.` : `Unblocked ${updated.email}.`);
      onDone(updated);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const u = pending?.user;
  const isBlock = pending?.action === "block";
  return (
    <Modal open={!!pending} title={isBlock ? "Block this user?" : "Unblock this user?"} onClose={close}>
      {u && (
        <div className="space-y-3 text-[13px] text-text">
          <p>
            <Mono>{u.email}</Mono>
            {u.name && <span className="text-muted"> ({u.name})</span>}
          </p>
          {isBlock ? (
            <p className="text-muted">
              They are signed out everywhere and can&apos;t sign in again.{" "}
              {u.emailsScheduled > 0 ? (
                <>
                  Their <Mono>{u.emailsScheduled}</Mono> scheduled {u.emailsScheduled === 1 ? "email stays" : "emails stay"} in the queue but
                  won&apos;t be sent until you unblock them.
                </>
              ) : (
                "Nothing will be sent for them until you unblock them."
              )}
            </p>
          ) : (
            <p className="text-muted">They can sign in again, and their scheduled emails resume sending.</p>
          )}
          {error && (
            <Notice tone="error" className="">
              {error}
            </Notice>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant={isBlock ? "danger" : "primary"} onClick={() => void confirm()} disabled={busy}>
              {busy ? (isBlock ? "Blocking…" : "Unblocking…") : isBlock ? "Block user" : "Unblock user"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function UserRow({ u, onAction }: { u: AdminUser; onAction: (p: Pending) => void }) {
  return (
    <tr className={tr}>
      <Td>
        <div className="min-w-0">
          <p className="truncate font-medium">{u.name || <span className="font-normal text-muted">No name</span>}</p>
          <Mono className="text-muted">{u.email}</Mono>
        </div>
      </Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          {u.emailVerified ? <Badge tone="sent">Verified</Badge> : <Badge tone="replied">Unverified</Badge>}
          {u.blocked && <Badge tone="failed">Blocked</Badge>}
          {u.isAdmin && <Badge tone="scheduled">Admin</Badge>}
        </div>
      </Td>
      <Td>
        {u.gmailConnected ? (
          <div className="flex flex-col items-start gap-0.5">
            <Badge tone="sent">Gmail connected</Badge>
            {u.gmailEmail && <Mono className="text-muted">{u.gmailEmail}</Mono>}
          </div>
        ) : (
          <span className="text-muted">Not connected</span>
        )}
      </Td>
      <Td numeric>{u.professorCount}</Td>
      <Td numeric>{u.emailsSent}</Td>
      <Td numeric>{u.emailsScheduled}</Td>
      <Td className="whitespace-nowrap">
        <Mono className={u.lastSentAt ? "" : "text-muted"}>{u.lastSentAt ? formatKarachi(u.lastSentAt) : "—"}</Mono>
      </Td>
      <Td className="whitespace-nowrap">
        <span title={formatKarachi(u.createdAt)}>
          <Mono>{karachiDate(u.createdAt)}</Mono>
        </span>
      </Td>
      <Td className="text-right">
        {u.isAdmin ? (
          <span className="text-xs text-muted" title="Admins can't be blocked">
            —
          </span>
        ) : u.blocked ? (
          <Button size="sm" onClick={() => onAction({ user: u, action: "unblock" })}>
            Unblock
          </Button>
        ) : (
          <Button size="sm" variant="danger" onClick={() => onAction({ user: u, action: "block" })}>
            Block
          </Button>
        )}
      </Td>
    </tr>
  );
}

function AdminPanel() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const stats = useApi(() => api.adminStats());
  const users = useApi(() => api.adminUsers(query || undefined), [query]);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  function reloadAll() {
    stats.reload();
    users.reload();
  }

  const s = stats.data;
  const list = users.data;

  return (
    <div>
      <PageHeader title="Admin" description="Every account on this server. Blocking signs a user out and pauses their sending.">
        <Button onClick={reloadAll} disabled={stats.loading || users.loading}>
          <IconRefresh size={14} />
          Refresh
        </Button>
      </PageHeader>

      <ErrorBox error={stats.error} onRetry={stats.reload} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {s ? (
          <>
            <Stat label="Users" value={s.users} />
            <Stat label="Verified" value={s.verifiedUsers} />
            <Stat label="Blocked" value={s.blockedUsers} />
            <Stat label="Gmail connected" value={s.gmailConnected} />
            <Stat label="Sent today" value={s.emailsSentToday} />
            <Stat label="Sent in total" value={s.emailsSentTotal} />
            <Stat label="Scheduled" value={s.emailsScheduled} />
          </>
        ) : (
          Array.from({ length: 7 }, (_, i) => <StatSkeleton key={i} />)
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            aria-label="Search users"
            className="pl-8"
            placeholder="Search email or name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {list && (
          <p className="text-xs text-muted">
            <Mono className="text-xs">{list.length}</Mono> {list.length === 1 ? "user" : "users"}
            {list.length >= 500 && " (showing the newest 500)"}
          </p>
        )}
      </div>

      <ErrorBox error={users.error} onRetry={users.reload} />
      {!list ? (
        users.error ? null : <TableSkeleton rows={6} cols={8} />
      ) : list.length === 0 ? (
        <Card>
          {query ? (
            <EmptyState
              compact
              icon={<IconSearch />}
              title="No users match your search"
              action={
                <Button onClick={() => setQ("")}>
                  <IconX size={14} />
                  Clear search
                </Button>
              }
            >
              Try part of an email address or name.
            </EmptyState>
          ) : (
            <EmptyState compact icon={<IconUsers />} title="No users yet" />
          )}
        </Card>
      ) : (
        <Card flush>
          <Table
            head={
              <>
                <Th>User</Th>
                <Th>Status</Th>
                <Th>Gmail</Th>
                <Th numeric>Contacts</Th>
                <Th numeric>Sent</Th>
                <Th numeric>Scheduled</Th>
                <Th>Last sent</Th>
                <Th>Created</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </>
            }
          >
            {list.map((u) => (
              <UserRow key={u.id} u={u} onAction={setPending} />
            ))}
          </Table>
        </Card>
      )}

      <ConfirmDialog
        pending={pending}
        onClose={() => setPending(null)}
        onDone={() => {
          setPending(null);
          reloadAll();
        }}
      />
    </div>
  );
}

/** Only admins see this page; everyone else is sent to the dashboard (the API answers 404 anyway). */
export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuth();
  const allowed = !!user?.isAdmin;

  useEffect(() => {
    if (user && !allowed) router.replace("/");
  }, [user, allowed, router]);

  if (!allowed) return <Loading rows={2} />;
  return <AdminPanel />;
}
