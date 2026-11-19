/**
 * Admin panel API (contract v3.3). Admins are the accounts whose email is listed in ADMIN_EMAILS.
 * Every route answers 404 unless the caller is a verified, non-blocked admin, so the routes stay hidden.
 * Never returns password hashes, tokens or app passwords. Logs admin actions with ids only.
 */
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { isAdminEmail, revokeAllSessions } from "../lib/auth.js";
import { HttpError, parseQuery } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { karachiDayRange } from "../lib/time.js";

export const adminRouter = Router();

const LIST_LIMIT = 500;

const requireAdmin: RequestHandler = (req, _res, next) => {
  const u = req.user;
  if (!u || !u.emailVerifiedAt || u.blockedAt || !isAdminEmail(u.email)) return next(new HttpError(404, "Not found"));
  next();
};
adminRouter.use(requireAdmin);

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  emailVerifiedAt: true,
  blockedAt: true,
  gmailAccount: { select: { email: true, appPasswordEnc: true } },
  _count: { select: { professors: true } },
} as const;

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  emailVerifiedAt: Date | null;
  blockedAt: Date | null;
  gmailAccount: { email: string; appPasswordEnc: string | null } | null;
  _count: { professors: number };
};

/** Per-user email counts for the given users (or all users when ids is undefined). */
async function emailStats(ids: string[]) {
  const [sent, scheduled] = await Promise.all([
    prisma.email.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, status: "SENT" },
      _count: { _all: true },
      _max: { sentAt: true },
    }),
    prisma.email.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, status: { in: ["SCHEDULED", "SENDING"] } },
      _count: { _all: true },
    }),
  ]);
  const sentBy = new Map(sent.map((r) => [r.userId, { count: r._count._all, last: r._max.sentAt }]));
  const schedBy = new Map(scheduled.map((r) => [r.userId, r._count._all]));
  return { sentBy, schedBy };
}

function toPublic(u: UserRow, stats: Awaited<ReturnType<typeof emailStats>>) {
  const sent = stats.sentBy.get(u.id);
  const gmailConnected = !!u.gmailAccount?.appPasswordEnc;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.createdAt,
    emailVerified: u.emailVerifiedAt !== null,
    blocked: u.blockedAt !== null,
    blockedAt: u.blockedAt,
    isAdmin: isAdminEmail(u.email),
    gmailConnected,
    gmailEmail: gmailConnected ? (u.gmailAccount?.email ?? null) : null,
    professorCount: u._count.professors,
    emailsSent: sent?.count ?? 0,
    emailsScheduled: stats.schedBy.get(u.id) ?? 0,
    lastSentAt: sent?.last ?? null,
  };
}

async function oneUser(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  if (!u) throw new HttpError(404, "User not found");
  return toPublic(u, await emailStats([u.id]));
}

const listQuery = z.object({ q: z.string().trim().max(200).optional() });

adminRouter.get("/users", async (req, res) => {
  const { q } = parseQuery(listQuery, req.query);
  const users = await prisma.user.findMany({
    where: q
      ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select: USER_SELECT,
  });
  const stats = await emailStats(users.map((u) => u.id));
  res.json(users.map((u) => toPublic(u, stats)));
});

function targetId(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 64) throw new HttpError(404, "User not found");
  return raw;
}

adminRouter.post("/users/:id/block", async (req, res) => {
  const id = targetId(req.params.id);
  const adminId = req.user!.id;
  if (id === adminId) throw new HttpError(400, "You can't block your own account.", undefined, "CANNOT_BLOCK_SELF");
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, blockedAt: true } });
  if (!target) throw new HttpError(404, "User not found");
  if (isAdminEmail(target.email)) throw new HttpError(400, "Admins can't be blocked.", undefined, "CANNOT_BLOCK_ADMIN");
  if (!target.blockedAt) await prisma.user.update({ where: { id }, data: { blockedAt: new Date() } });
  // Sign them out everywhere (also when already blocked, in case a session slipped through).
  await revokeAllSessions(id);
  console.info(`[admin] ${adminId} blocked ${id}`);
  res.json(await oneUser(id));
});

adminRouter.post("/users/:id/unblock", async (req, res) => {
  const id = targetId(req.params.id);
  const adminId = req.user!.id;
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, blockedAt: true } });
  if (!target) throw new HttpError(404, "User not found");
  if (target.blockedAt) await prisma.user.update({ where: { id }, data: { blockedAt: null } });
  console.info(`[admin] ${adminId} unblocked ${id}`);
  res.json(await oneUser(id));
});

adminRouter.get("/stats", async (_req, res) => {
  const [users, verifiedUsers, blockedUsers, gmailConnected, emailsSentToday, emailsSentTotal, emailsScheduled] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
      prisma.user.count({ where: { blockedAt: { not: null } } }),
      prisma.gmailAccount.count({ where: { appPasswordEnc: { not: null } } }),
      prisma.email.count({ where: { status: "SENT", sentAt: karachiDayRange() } }),
      prisma.email.count({ where: { status: "SENT" } }),
      prisma.email.count({ where: { status: { in: ["SCHEDULED", "SENDING"] } } }),
    ]);
  res.json({ users, verifiedUsers, blockedUsers, gmailConnected, emailsSentToday, emailsSentTotal, emailsScheduled });
});
