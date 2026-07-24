-- AlterTable
ALTER TABLE "folders" ADD COLUMN     "created_by" TEXT;

-- CreateIndex
CREATE INDEX "folders_org_id_created_by_idx" ON "folders"("org_id", "created_by");

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
