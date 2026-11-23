-- AlterTable
ALTER TABLE "UserCv" ADD COLUMN     "storageKey" TEXT,
ALTER COLUMN "data" DROP NOT NULL;

