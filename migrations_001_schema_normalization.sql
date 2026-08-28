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

-- 3. GROUP RESOURCES: Join table for direct resource-to-group assignments
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
