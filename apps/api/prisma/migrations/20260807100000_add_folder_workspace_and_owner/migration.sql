-- Ensure WorkspaceType enum exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WorkspaceType') THEN
        CREATE TYPE "WorkspaceType" AS ENUM ('PRIVATE', 'GROUP');
    END IF;
END $$;

-- AlterTable
ALTER TABLE "folders" ADD COLUMN     "workspace_type" "WorkspaceType" NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE "folders" ADD COLUMN     "owner_id" TEXT;

-- Backfill existing group folders
UPDATE "folders" SET "workspace_type" = 'GROUP' WHERE "group_id" IS NOT NULL;

-- Backfill ownership from the creator where available
UPDATE "folders" SET "owner_id" = "created_by" WHERE "owner_id" IS NULL AND "created_by" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
