/** The user's connected Gmail account (address + encrypted App Password). */
import { prisma } from "../../lib/prisma.js";

export async function getGmailAccount(userId: string) {
  return prisma.gmailAccount.findUnique({ where: { userId } });
}

/** Forget the stored App Password. Nothing to revoke: the user deletes the app password in their Google account. */
export async function disconnectGmail(userId: string): Promise<void> {
  await prisma.gmailAccount.deleteMany({ where: { userId } });
}
