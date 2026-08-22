-- Clickrypt Supabase PostgreSQL Database Schema & Migration DDL

-- 1. Users Table
CREATE TABLE IF NOT EXISTS public.users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'User',
  status VARCHAR(32) NOT NULL DEFAULT 'Active',
  public_key TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  last_active VARCHAR(64) DEFAULT 'Just now',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Folders Table
CREATE TABLE IF NOT EXISTS public.folders (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  item_count INT DEFAULT 0,
  last_modified VARCHAR(64) DEFAULT 'Just now',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Resources (Passwords & Vault Items) Table
CREATE TABLE IF NOT EXISTS public.resources (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  username VARCHAR(255),
  url VARCHAR(512),
  owner_id VARCHAR(64) REFERENCES public.users(id) ON DELETE CASCADE,
  folder_id VARCHAR(64) REFERENCES public.folders(id) ON DELETE SET NULL,
  is_private_only BOOLEAN DEFAULT FALSE,
  score INT DEFAULT 85,
  strength VARCHAR(32) DEFAULT 'Strong',
  secrets_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}',
  last_modified VARCHAR(64) DEFAULT 'Just now',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Groups Table
CREATE TABLE IF NOT EXISTS public.groups (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  members_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_active VARCHAR(64) DEFAULT 'Just now',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Subscriptions Table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id VARCHAR(64) PRIMARY KEY DEFAULT 'sub-main',
  plan VARCHAR(64) NOT NULL DEFAULT 'Organization',
  status VARCHAR(32) NOT NULL DEFAULT 'Active',
  seats INT DEFAULT 25,
  renewal_date VARCHAR(64) DEFAULT 'May 18, 2025',
  days_remaining INT DEFAULT 365,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  action VARCHAR(128) NOT NULL,
  user_id VARCHAR(64),
  resource_id VARCHAR(64),
  details TEXT
);

-- Initial Seeds for Supabase
INSERT INTO public.subscriptions (id, plan, status, seats, renewal_date, days_remaining)
VALUES ('sub-main', 'Organization', 'Warning', 25, 'May 18, 2025', 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, name, role, status, public_key, encrypted_private_key, last_active)
VALUES
('u-1', 'alex.morgan@acme.com', 'Alex Morgan', 'Owner', 'Active', '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2...AlexMorganPublic...==\n-----END PGP PUBLIC KEY BLOCK-----', '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2...AlexMorganEncryptedPrivateKey...==\n-----END PGP PRIVATE KEY BLOCK-----', 'Just now'),
('u-2', 'sarah.johnson@acme.com', 'Sarah Johnson', 'Admin', 'Active', '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2...SarahPublic...==\n-----END PGP PUBLIC KEY BLOCK-----', '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2...SarahPrivateKey...==\n-----END PGP PRIVATE KEY BLOCK-----', 'May 23, 2025 04:15 PM')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.folders (id, name, description, item_count, last_modified)
VALUES
('f-1', 'Infrastructure', 'Servers, cloud providers, and deployment secrets', 12, '1h ago'),
('f-2', 'Credentials', 'API keys, tokens, and service accounts', 8, '3h ago')
ON CONFLICT (id) DO NOTHING;
