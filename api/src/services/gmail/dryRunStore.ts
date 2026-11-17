/**
 * DRY_RUN thread store: a JSON file (api/.dryrun/threads.json, gitignored) that stands in for
 * Gmail threads so simulated sends and replies survive restarts.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export interface DryRunMessage {
  direction: "outbound" | "inbound";
  from: string;
  to?: string;
  subject?: string;
  date: string; // ISO
  messageIdHeader?: string;
}

interface StoreShape {
  threads: Record<string, DryRunMessage[]>;
}

// src/services/gmail -> api/  (same depth under dist/)
const DIR = fileURLToPath(new URL("../../../.dryrun/", import.meta.url));
const FILE = path.join(DIR, "threads.json");

let queue: Promise<unknown> = Promise.resolve();

/** Serialise all store operations so concurrent writes never clobber each other. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

async function load(): Promise<StoreShape> {
  try {
    const parsed = JSON.parse(await readFile(FILE, "utf8")) as Partial<StoreShape>;
    return { threads: parsed && typeof parsed.threads === "object" && parsed.threads ? parsed.threads : {} };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { threads: {} };
    console.error("[DRY_RUN] thread store unreadable, starting empty:", (err as Error).message);
    return { threads: {} };
  }
}

async function save(store: StoreShape): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await rename(tmp, FILE);
}

export function appendDryRunMessage(threadId: string, msg: DryRunMessage): Promise<void> {
  return serial(async () => {
    const store = await load();
    (store.threads[threadId] ??= []).push(msg);
    await save(store);
  });
}

export function getDryRunThread(threadId: string): Promise<DryRunMessage[]> {
  return serial(async () => (await load()).threads[threadId] ?? []);
}
