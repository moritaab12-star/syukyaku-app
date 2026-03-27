import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getPublicSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.replace(
    /\s/g,
    '',
  ).trim();

  if (!url || !anonKey) {
    throw new Error(
      'Supabase env is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
    );
  }

  return { url, anonKey };
}

export function createSupabaseClient(): SupabaseClient {
  const config = getPublicSupabaseConfig();
  return createClient(config.url, config.anonKey);
}

function getServiceSupabaseConfig(): { url: string; serviceRoleKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(
    /\s/g,
    '',
  ).trim();

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase service env is missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
    );
  }

  return { url, serviceRoleKey };
}

export function createSupabaseAdminClient(): SupabaseClient {
  const config = getServiceSupabaseConfig();
  return createClient(config.url, config.serviceRoleKey);
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
