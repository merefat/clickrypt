-- ==============================================================================
-- CLICKRYPT DATABASE SCHEMA NORMALIZATION & HARMONIZATION MIGRATION
-- ==============================================================================

-- 1. FOLDERS: Add owner_id and organization_id
ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS owner_id character varying,
  ADD COLUMN IF NOT EXISTS organization_id text;

-- Add foreign key constraints if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'folders_owner_id_fkey' AND table_name = 'folders'
  ) THEN
    ALTER TABLE public.folders
      ADD CONSTRAINT folders_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. RESOURCE SHARES: Ensure unique constraint on (resource_id, recipient_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'resource_shares_unique_recipient' AND table_name = 'resource_shares'
  ) THEN
    -- Clean duplicate shares before applying constraint if any
    DELETE FROM public.resource_shares a USING public.resource_shares b
    WHERE a.ctid < b.ctid 
      AND a.resource_id = b.resource_id 
      AND a.recipient_id = b.recipient_id;

    ALTER TABLE public.resource_shares
      ADD CONSTRAINT resource_shares_unique_recipient
      UNIQUE (resource_id, recipient_id);
  END IF;
END $$;

-- 3. GROUPS: Add organization_id
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS organization_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'groups_organization_id_fkey' AND table_name = 'groups'
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4. GROUP RESOURCES: Join table for direct resource-to-group assignments
CREATE TABLE IF NOT EXISTS public.group_resources (
  group_id text NOT NULL,
  resource_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT group_resources_pkey PRIMARY KEY (group_id, resource_id),
  CONSTRAINT group_resources_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE,
  CONSTRAINT group_resources_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE
);

-- 4. SUBSCRIPTIONS: Remove mock hardcoded defaults
ALTER TABLE public.subscriptions
  ALTER COLUMN plan DROP DEFAULT,
  ALTER COLUMN status SET DEFAULT 'Active',
  ALTER COLUMN seats SET DEFAULT 5,
  ALTER COLUMN renewal_date DROP DEFAULT,
  ALTER COLUMN days_remaining SET DEFAULT 30;

-- 5. AUDIT LOGS: Ensure foreign keys and indices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'audit_logs_user_id_fkey' AND table_name = 'audit_logs'
  ) THEN
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT audit_logs_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6. DROP UNREFERENCED DEAD TABLES
DROP TABLE IF EXISTS public.team_members CASCADE;
DROP TABLE IF EXISTS public.activity_logs CASCADE;

-- 7. ENABLE REALTIME PUBLICATION & REPLICA IDENTITY
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE 
    public.resources,
    public.folders,
    public.resource_shares,
    public.users,
    public.groups,
    public.group_members,
    public.group_folders,
    public.group_resources,
    public.organizations,
    public.subscriptions,
    public.audit_logs,
    public.invitations;
EXCEPTION WHEN OTHERS THEN
  -- Table already in publication
  NULL;
END $$;

ALTER TABLE public.resources REPLICA IDENTITY FULL;
ALTER TABLE public.folders REPLICA IDENTITY FULL;
ALTER TABLE public.resource_shares REPLICA IDENTITY FULL;
ALTER TABLE public.users REPLICA IDENTITY FULL;
ALTER TABLE public.groups REPLICA IDENTITY FULL;
ALTER TABLE public.group_members REPLICA IDENTITY FULL;
ALTER TABLE public.group_folders REPLICA IDENTITY FULL;
ALTER TABLE public.group_resources REPLICA IDENTITY FULL;
ALTER TABLE public.organizations REPLICA IDENTITY FULL;
ALTER TABLE public.subscriptions REPLICA IDENTITY FULL;
ALTER TABLE public.audit_logs REPLICA IDENTITY FULL;
ALTER TABLE public.invitations REPLICA IDENTITY FULL;
