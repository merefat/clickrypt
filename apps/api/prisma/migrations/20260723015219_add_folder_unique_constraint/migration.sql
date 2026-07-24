/*
  Warnings:

  - A unique constraint covering the columns `[org_id,group_id,parent_folder_id,name]` on the table `folders` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "resources" DROP CONSTRAINT "resources_created_by_fkey";

-- DropForeignKey
ALTER TABLE "resources" DROP CONSTRAINT "resources_modified_by_fkey";

-- AlterTable
ALTER TABLE "folders" ADD COLUMN     "group_id" TEXT;

-- AlterTable
ALTER TABLE "resources" ALTER COLUMN "created_by" DROP NOT NULL,
ALTER COLUMN "modified_by" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_base64" TEXT,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "job_title" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "timezone" TEXT;

-- CreateIndex
CREATE INDEX "folders_group_id_idx" ON "folders"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "folders_org_id_group_id_parent_folder_id_name_key" ON "folders"("org_id", "group_id", "parent_folder_id", "name");

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_modified_by_fkey" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
