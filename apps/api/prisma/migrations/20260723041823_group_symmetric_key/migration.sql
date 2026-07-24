-- AlterTable
ALTER TABLE "group_users" ADD COLUMN     "encrypted_group_key" TEXT;

-- AlterTable
ALTER TABLE "resources" ADD COLUMN     "group_id" TEXT;

-- CreateTable
CREATE TABLE "group_secrets" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "encrypted_data" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_secrets_resource_id_key" ON "group_secrets"("resource_id");

-- CreateIndex
CREATE INDEX "resources_org_id_group_id_idx" ON "resources"("org_id", "group_id");

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_secrets" ADD CONSTRAINT "group_secrets_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
