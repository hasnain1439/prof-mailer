-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "attachFileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bcc" TEXT,
ADD COLUMN     "cc" TEXT,
ADD COLUMN     "openCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openToken" TEXT,
ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "trackOpens" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "attachFileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bcc" TEXT,
ADD COLUMN     "cc" TEXT,
ADD COLUMN     "trackOpens" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleId" TEXT;

-- CreateTable
CREATE TABLE "UserFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA,
    "storageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserFile_userId_idx" ON "UserFile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Email_openToken_key" ON "Email"("openToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- AddForeignKey
ALTER TABLE "UserFile" ADD CONSTRAINT "UserFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

