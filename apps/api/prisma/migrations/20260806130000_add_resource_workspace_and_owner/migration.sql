-- CreateEnum
CREATE TYPE "WorkspaceType" AS ENUM ('PRIVATE', 'GROUP');

-- AlterTable
ALTER TABLE "resources" ADD COLUMN     "workspace_type" "WorkspaceType" NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE "resources" ADD COLUMN     "owner_id" TEXT;

-- Backfill existing group resources so they are not labeled as PRIVATE
UPDATE "resources" SET "workspace_type" = 'GROUP' WHERE "group_id" IS NOT NULL;

-- Backfill ownership from the creator where available
UPDATE "resources" SET "owner_id" = "created_by" WHERE "owner_id" IS NULL AND "created_by" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
