-- CreateEnum
CREATE TYPE "GmailAuthType" AS ENUM ('OAUTH', 'APP_PASSWORD');

-- AlterTable
ALTER TABLE "GmailAccount" ADD COLUMN     "appPasswordEnc" TEXT,
ADD COLUMN     "authType" "GmailAuthType" NOT NULL DEFAULT 'OAUTH',
ALTER COLUMN "refreshToken" DROP NOT NULL;

