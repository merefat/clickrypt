-- ClickPass: Delete old test users and their FK-constrained data.
-- Usage:
--   Local:  docker exec -i clickrypt-dev-postgres-1 psql -U clickrypt -d clickrypt < apps/api/prisma/cleanup-users.sql
--   Remote: psql "<DATABASE_URL>" < apps/api/prisma/cleanup-users.sql

BEGIN;

-- Collect target user IDs into a temp table
CREATE TEMP TABLE _target_users AS
SELECT id, email FROM users
WHERE email IN (
  'refat61899200@gmail.com',
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

-- 3. Clean up orphaned organizations (no remaining members)
DELETE FROM organizations
WHERE id NOT IN (SELECT DISTINCT org_id FROM users);

-- 4. Clean up orphaned installation records
DELETE FROM installations
WHERE "organizationId" IS NOT NULL
  AND "organizationId" NOT IN (SELECT id FROM organizations);

COMMIT;

-- Verify
SELECT 'Remaining users:' AS info, email FROM users;
SELECT 'Remaining orgs:' AS info, name FROM organizations;
