-- DropIndex
DROP INDEX "UserCv_userId_key";

-- AlterTable
ALTER TABLE "UserCv" ADD COLUMN     "kind" "ContactKind";

-- CreateIndex
CREATE INDEX "UserCv_userId_idx" ON "UserCv"("userId");

