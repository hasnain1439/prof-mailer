-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "isHtml" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "isHtml" BOOLEAN NOT NULL DEFAULT false;

