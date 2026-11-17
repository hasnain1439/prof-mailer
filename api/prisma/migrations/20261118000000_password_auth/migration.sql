-- Google sign-in and Gmail OAuth are removed (v3). Gmail OAuth connections cannot be migrated to App Passwords.
DELETE FROM "GmailAccount" WHERE "authType" = 'OAUTH';

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- AlterEnum
BEGIN;
CREATE TYPE "GmailAuthType_new" AS ENUM ('APP_PASSWORD');
ALTER TABLE "public"."GmailAccount" ALTER COLUMN "authType" DROP DEFAULT;
ALTER TABLE "GmailAccount" ALTER COLUMN "authType" TYPE "GmailAuthType_new" USING ("authType"::text::"GmailAuthType_new");
ALTER TYPE "GmailAuthType" RENAME TO "GmailAuthType_old";
ALTER TYPE "GmailAuthType_new" RENAME TO "GmailAuthType";
DROP TYPE "public"."GmailAuthType_old";
ALTER TABLE "GmailAccount" ALTER COLUMN "authType" SET DEFAULT 'APP_PASSWORD';
COMMIT;

-- DropIndex
DROP INDEX "User_googleSub_key";

-- AlterTable
ALTER TABLE "GmailAccount" DROP COLUMN "accessToken",
DROP COLUMN "expiryDate",
DROP COLUMN "refreshToken",
ALTER COLUMN "authType" SET DEFAULT 'APP_PASSWORD';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "googleSub",
DROP COLUMN "picture",
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthToken_userId_type_idx" ON "AuthToken"("userId", "type");

-- CreateIndex
CREATE INDEX "AuthToken_expiresAt_idx" ON "AuthToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

