import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xyzsupabasedemo.supabase.co';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5enN1cGFiYXNlZGVtbyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjIwMTk2NDMyMDB9.SampleSupabaseAnonKey1234567890';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface SupabaseUser {
  id: string;
  email: string;
  name: string;
  role: 'Owner' | 'Admin' | 'User';
  status: 'Active' | 'Suspended' | 'Invited';
  public_key: string;
  encrypted_private_key: string;
  last_active: string;
}

export interface SupabaseResource {
  id: string;
  name: string;
  username: string;
  url: string;
  category: string;
  owner_id: string;
  folder_id?: string | null;
  is_private_only?: boolean;
  score?: number;
  strength?: 'Strong' | 'Better' | 'Weak';
  secrets_data: any[];
  tags?: string[];
  last_modified: string;
}

export interface SupabaseFolder {
  id: string;
  name: string;
  description?: string;
  item_count: number;
  last_modified: string;
}

export interface SupabaseGroup {
  id: string;
  name: string;
  description: string;
  members_data: any[];
  last_active: string;
}

export interface SupabaseSubscription {
  id: string;
  plan: 'Organization' | 'Self-hosted';
  status: 'Active' | 'Warning' | 'Expired';
  seats: number;
  renewal_date: string;
  days_remaining: number;
}
