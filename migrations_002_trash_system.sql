-- ==============================================================================
-- CLICKRYPT DATABASE MIGRATION 002: TRASH & RECYCLE BIN SYSTEM
-- ==============================================================================

-- 1. RESOURCES: Add soft-delete and original location columns
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by CHARACTER VARYING,
  ADD COLUMN IF NOT EXISTS original_folder_id CHARACTER VARYING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'resources_deleted_by_fkey' AND table_name = 'resources'
  ) THEN
    ALTER TABLE public.resources
      ADD CONSTRAINT resources_deleted_by_fkey
      FOREIGN KEY (deleted_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'resources_original_folder_id_fkey' AND table_name = 'resources'
  ) THEN
    ALTER TABLE public.resources
      ADD CONSTRAINT resources_original_folder_id_fkey
      FOREIGN KEY (original_folder_id) REFERENCES public.folders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_resources_deleted_at ON public.resources(deleted_at);
CREATE INDEX IF NOT EXISTS idx_resources_deleted_by ON public.resources(deleted_by);
CREATE INDEX IF NOT EXISTS idx_resources_original_folder_id ON public.resources(original_folder_id);

-- 2. FOLDERS: Add soft-delete columns
ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by CHARACTER VARYING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'folders_deleted_by_fkey' AND table_name = 'folders'
  ) THEN
    ALTER TABLE public.folders
      ADD CONSTRAINT folders_deleted_by_fkey
      FOREIGN KEY (deleted_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_folders_deleted_at ON public.folders(deleted_at);
CREATE INDEX IF NOT EXISTS idx_folders_deleted_by ON public.folders(deleted_by);
