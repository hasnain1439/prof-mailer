-- CreateEnum
CREATE TYPE "ContactKind" AS ENUM ('PROFESSOR', 'COMPANY');

-- AlterEnum
ALTER TYPE "ProfessorStatus" ADD VALUE 'INTERVIEW';

-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "attachCv" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Professor" ADD COLUMN     "jobUrl" TEXT,
ADD COLUMN     "kind" "ContactKind" NOT NULL DEFAULT 'PROFESSOR',
ADD COLUMN     "role" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "companyFollowUpTemplateId" TEXT;

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "attachCv" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UserCv" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCv_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCv_userId_key" ON "UserCv"("userId");

-- CreateIndex
CREATE INDEX "Professor_userId_kind_idx" ON "Professor"("userId", "kind");

-- AddForeignKey
ALTER TABLE "UserCv" ADD CONSTRAINT "UserCv_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

