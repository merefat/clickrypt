-- Clickrypt Supabase PostgreSQL Database Schema
-- Source of truth for the Clickrypt application.
-- All runtime application state lives in these tables.

-- ---------------------------------------------------------------------------
-- 1. Application users (linked to Supabase Auth)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email TEXT UNIQUE NOT NULL,
  account_mode TEXT NOT NULL DEFAULT 'personal',
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_users_auth_id ON public.users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_account_mode ON public.users(account_mode);

-- ---------------------------------------------------------------------------
-- 2. Organizations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id TEXT PRIMARY KEY,
  domain TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_organizations_domain ON public.organizations(domain);

-- ---------------------------------------------------------------------------
-- 3. Folders (split by account_mode column)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.folders (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'personal',
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_folders_mode ON public.folders(mode);

-- ---------------------------------------------------------------------------
-- 4. Resources / Vault items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resources (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'personal',
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_resources_mode ON public.resources(mode);

-- ---------------------------------------------------------------------------
-- 5. Groups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.groups (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- 6. Audit logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'personal',
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_mode ON public.audit_logs(mode);

-- ---------------------------------------------------------------------------
-- 7. Invitations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitations (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- 8. Subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id TEXT PRIMARY KEY DEFAULT 'sub-main',
  data JSONB NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- 9. Passkey challenges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.passkey_challenges (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- 10. SSO
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sso_settings (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.sso_keys (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.sso_states (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.sso_tokens (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- 11. Auth challenges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auth_challenges (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- 12. Account recovery
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_recovery_policies (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.account_recovery_org_public_keys (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.account_recovery_user_settings (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.account_recovery_private_keys (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.account_recovery_private_key_passwords (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.account_recovery_requests (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.account_recovery_responses (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- Idempotent column fixes for pre-existing deployments
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS account_mode TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS domain TEXT UNIQUE;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.passkey_challenges ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.sso_settings ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.sso_keys ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.sso_states ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.sso_tokens ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.auth_challenges ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.account_recovery_policies ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.account_recovery_org_public_keys ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.account_recovery_user_settings ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.account_recovery_private_keys ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.account_recovery_private_key_passwords ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.account_recovery_requests ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.account_recovery_responses ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- The backend uses the Supabase service role, which bypasses RLS.
-- These are disabled by default; add app-specific policies when moving
-- queries to the browser client.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkey_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sso_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sso_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sso_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sso_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_recovery_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_recovery_org_public_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_recovery_user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_recovery_private_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_recovery_private_key_passwords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_recovery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_recovery_responses ENABLE ROW LEVEL SECURITY;
