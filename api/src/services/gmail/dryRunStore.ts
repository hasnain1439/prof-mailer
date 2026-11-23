/**
 * DRY_RUN thread store: stands in for Gmail threads so simulated sends and replies survive restarts.
 * Kept in the database (AppState rows "dryrun:thread:<threadId>") so it also works on serverless hosts
 * such as Vercel, where the filesystem is read-only.
 */
import { prisma } from "../../lib/prisma.js";

export interface DryRunMessage {
  direction: "outbound" | "inbound";
  from: string;
  to?: string;
  subject?: string;
  date: string; // ISO
  messageIdHeader?: string;
  inReplyTo?: string | null;
  references?: string[];
}

const key = (threadId: string) => `dryrun:thread:${threadId}`;

function parse(value: string | null | undefined): DryRunMessage[] {
  if (!value) return [];
  try {
    const v = JSON.parse(value) as unknown;
    return Array.isArray(v) ? (v as DryRunMessage[]) : [];
  } catch {
    return [];
  }
}

export async function appendDryRunMessage(threadId: string, msg: DryRunMessage): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Row lock so two concurrent appends to the same thread don't overwrite each other.
    await tx.$executeRaw`INSERT INTO "AppState" ("key", "value", "updatedAt") VALUES (${key(threadId)}, '[]', now()) ON CONFLICT ("key") DO NOTHING`;
    const rows = await tx.$queryRaw<{ value: string }[]>`SELECT "value" FROM "AppState" WHERE "key" = ${key(threadId)} FOR UPDATE`;
    const msgs = parse(rows[0]?.value);
    msgs.push(msg);
    await tx.appState.update({ where: { key: key(threadId) }, data: { value: JSON.stringify(msgs) } });
  });
}

export async function getDryRunThread(threadId: string): Promise<DryRunMessage[]> {
  const row = await prisma.appState.findUnique({ where: { key: key(threadId) } });
  return parse(row?.value);
}
