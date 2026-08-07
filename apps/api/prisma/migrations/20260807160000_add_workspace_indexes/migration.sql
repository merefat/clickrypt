-- CreateIndex
CREATE INDEX "folders_owner_id_idx" ON "folders"("owner_id");

-- CreateIndex
CREATE INDEX "folders_org_id_owner_id_idx" ON "folders"("org_id", "owner_id");

-- CreateIndex
CREATE INDEX "folders_org_id_workspace_type_owner_id_idx" ON "folders"("org_id", "workspace_type", "owner_id");

-- CreateIndex
CREATE INDEX "resources_org_id_owner_id_idx" ON "resources"("org_id", "owner_id");

-- CreateIndex
CREATE INDEX "resources_org_id_workspace_type_idx" ON "resources"("org_id", "workspace_type");

-- CreateIndex
CREATE INDEX "resources_org_id_workspace_type_owner_id_idx" ON "resources"("org_id", "workspace_type", "owner_id");

-- CreateIndex
CREATE INDEX "secrets_user_id_idx" ON "secrets"("user_id");

-- CreateIndex
CREATE INDEX "secrets_user_id_resource_id_idx" ON "secrets"("user_id", "resource_id");
