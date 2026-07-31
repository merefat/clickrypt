-- ClickPass: Delete old test users and their FK-constrained data.
-- Usage:
--   Local:  docker exec -i clickrypt-dev-postgres-1 psql -U clickrypt -d clickrypt < apps/api/prisma/cleanup-users.sql
--   Remote: psql "<DATABASE_URL>" < apps/api/prisma/cleanup-users.sql

BEGIN;

-- Collect target user IDs into a temp table
CREATE TEMP TABLE _target_users AS
SELECT id, email FROM users
WHERE email IN (
  '20103227@gmail.com',
  '20103227@iubat.edu'
);

-- Report what will be deleted
SELECT 'Users to delete:' AS info, email FROM _target_users;

-- 1. Delete FK-constrained rows that do NOT have ON DELETE CASCADE

-- share_history (shared_by / shared_with → users, no cascade)
DELETE FROM share_history
WHERE shared_by IN (SELECT id FROM _target_users)
   OR shared_with IN (SELECT id FROM _target_users);

-- audit_logs (user_id → users, no cascade)
DELETE FROM audit_logs
WHERE user_id IN (SELECT id FROM _target_users);

-- recovery_requests (user_id → users, no cascade)
DELETE FROM recovery_requests
WHERE user_id IN (SELECT id FROM _target_users);

-- invites (invited_by_id → users, no cascade; accepted_by_id is nullable)
DELETE FROM invites
WHERE invited_by IN (SELECT id FROM _target_users)
   OR accepted_by_id IN (SELECT id FROM _target_users);

-- permissions where ARO is a target user
DELETE FROM permissions
WHERE aro_type = 'USER'
  AND aro_id IN (SELECT id FROM _target_users);

-- 2. Delete the users — ON DELETE CASCADE handles:
--    gpg_keys, group_users, sessions, mfa_devices, secrets,
--    organization_memberships, user_favorites
-- Resources/folders have onDelete: SetNull for created_by/modified_by
DELETE FROM users
WHERE id IN (SELECT id FROM _target_users);

-- 3. Clean up orphaned organizations (no remaining members) and their data
CREATE TEMP TABLE _orphan_orgs AS
SELECT id FROM organizations
WHERE id NOT IN (SELECT DISTINCT org_id FROM users);

-- Stash the resources/folders we are about to delete so we can clean permissions
CREATE TEMP TABLE _orphan_resources AS
SELECT id FROM resources
WHERE org_id IN (SELECT id FROM _orphan_orgs);

CREATE TEMP TABLE _orphan_folders AS
SELECT id FROM folders
WHERE org_id IN (SELECT id FROM _orphan_orgs);

-- Remove permission rows tied to the soon-to-be-deleted groups/resources/folders
DELETE FROM permissions
WHERE (aro_type = 'GROUP' AND aro_id IN (SELECT id FROM groups WHERE org_id IN (SELECT id FROM _orphan_orgs)))
   OR (aco_type = 'RESOURCE' AND aco_id IN (SELECT id FROM _orphan_resources))
   OR (aco_type = 'FOLDER' AND aco_id IN (SELECT id FROM _orphan_folders));

-- Delete resources (cascades secrets, resource_tags, share_history, user_favorites)
DELETE FROM resources
WHERE id IN (SELECT id FROM _orphan_resources);

-- Delete folders; break parent/child chains first
UPDATE folders
SET parent_folder_id = NULL
WHERE org_id IN (SELECT id FROM _orphan_orgs);

DELETE FROM folders
WHERE org_id IN (SELECT id FROM _orphan_orgs);

-- Delete groups
DELETE FROM groups
WHERE org_id IN (SELECT id FROM _orphan_orgs);

-- Delete tags (cascades resource_tags)
DELETE FROM tags
WHERE org_id IN (SELECT id FROM _orphan_orgs);

-- Delete remaining org-scoped logs and invites
DELETE FROM audit_logs
WHERE org_id IN (SELECT id FROM _orphan_orgs);

DELETE FROM email_logs
WHERE org_id IN (SELECT id FROM _orphan_orgs);

DELETE FROM invites
WHERE org_id IN (SELECT id FROM _orphan_orgs);

-- Finally delete the orphaned organizations and installations
DELETE FROM organizations
WHERE id IN (SELECT id FROM _orphan_orgs);

DELETE FROM installations
WHERE "organizationId" IS NOT NULL
  AND "organizationId" NOT IN (SELECT id FROM organizations);

COMMIT;

-- Verify
SELECT 'Remaining users:' AS info, email FROM users;
SELECT 'Remaining orgs:' AS info, name FROM organizations;
