-- CreateEnum
CREATE TYPE "SharingMode" AS ENUM ('AUTO', 'RESTRICTED');

-- AlterTable
ALTER TABLE "resources" ADD COLUMN     "sharing_mode" "SharingMode" NOT NULL DEFAULT 'AUTO';
