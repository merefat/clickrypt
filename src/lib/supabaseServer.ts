import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getConfig(): { supabaseUrl: string; supabaseServiceRoleKey: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured');
  }
  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return { supabaseUrl, supabaseServiceRoleKey };
}

// Next.js patches the global `fetch` in Route Handlers to add its own
// request memoization/caching. Forcing `cache: 'no-store'` opts every
// Supabase request out of that layer, per Supabase's guidance for using
// supabase-js inside Next.js Route Handlers.
const noStoreFetch = (input: RequestInfo | URL, init?: RequestInit) =>
  fetch(input, { ...init, cache: 'no-store' });

let client: SupabaseClient | null = null;

// Client for regular table/REST access (`.from(...)`) and stateless auth
// lookups (`auth.getUser(token)`). Safe to reuse as a singleton.
export function getSupabaseServer(): SupabaseClient {
  if (!client) {
    const { supabaseUrl, supabaseServiceRoleKey } = getConfig();
    client = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: { fetch: noStoreFetch },
    });
  }
  return client;
}

// Client for calls that mutate the SDK's internal auth/session state:
// `auth.admin.*` and `auth.signInWithPassword(...)`. These must NEVER be
// called on the same client instance used for `.from(...)` queries above —
// doing so has been observed to silently downgrade that instance's
// PostgREST requests from service_role to anonymous for the rest of its
// lifetime, causing every subsequent `.from(...)` call on it to fail with
// spurious "row-level security policy" errors. A fresh, throwaway client
// per call keeps these operations fully isolated from the shared one.
export function getSupabaseAuthClient(): SupabaseClient {
  const { supabaseUrl, supabaseServiceRoleKey } = getConfig();
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: { fetch: noStoreFetch },
  });
}
