import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseServicePersonaRow,
  type ServicePersonaParsed,
} from '@/app/lib/service-persona/parse-db-row';

export async function countActiveServicePersonas(
  supabase: SupabaseClient,
): Promise<number> {
  const { count, error } = await supabase
    .from('service_personas')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  if (error) {
    console.warn('[service-personas] count active failed', error.message);
    return 0;
  }
  return typeof count === 'number' ? count : 0;
}

/** 登録済みかつ有効な service_key か（存在しなければ false） */
export async function isActiveServicePersonaKey(
  supabase: SupabaseClient,
  serviceKey: string,
): Promise<boolean> {
  const k = serviceKey.trim();
  if (!k) return false;
  const { data, error } = await supabase
    .from('service_personas')
    .select('id')
    .eq('service_key', k)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.warn('[service-personas] lookup key failed', error.message);
    return false;
  }
  return Boolean(data?.id);
}

export async function getActiveServicePersonaByKey(
  supabase: SupabaseClient,
  serviceKey: string,
): Promise<ServicePersonaParsed | null> {
  const k = serviceKey.trim();
  if (!k) return null;
  const { data, error } = await supabase
    .from('service_personas')
    .select('*')
    .eq('service_key', k)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.warn('[service-personas] fetch persona failed', error.message);
    return null;
  }
  return parseServicePersonaRow(
    data as Record<string, unknown> | null | undefined,
  );
}

/** 一覧: 管理画面用（無効行も含む） */
export async function listAllServicePersonasOrdered(
  supabase: SupabaseClient,
): Promise<ServicePersonaParsed[]> {
  const { data, error } = await supabase
    .from('service_personas')
    .select('*')
    .order('service_name', { ascending: true });

  if (error || !Array.isArray(data)) {
    console.warn('[service-personas] list failed', error?.message);
    return [];
  }
  return data
    .map((r) => parseServicePersonaRow(r as Record<string, unknown>))
    .filter((x): x is ServicePersonaParsed => x != null);
}

export async function listActiveServicePersonasForSelect(
  supabase: SupabaseClient,
): Promise<Pick<ServicePersonaParsed, 'service_key' | 'service_name'>[]> {
  const { data, error } = await supabase
    .from('service_personas')
    .select('service_key, service_name')
    .eq('is_active', true)
    .order('service_name', { ascending: true });

  if (error || !Array.isArray(data)) {
    console.warn('[service-personas] list active failed', error?.message);
    return [];
  }
  return data
    .map((r) => ({
      service_key:
        typeof r.service_key === 'string' ? r.service_key.trim() : '',
      service_name:
        typeof r.service_name === 'string' ? r.service_name.trim() : '',
    }))
    .filter((r) => r.service_key.length > 0 && r.service_name.length > 0);
}

export async function getServicePersonaById(
  supabase: SupabaseClient,
  id: string,
): Promise<ServicePersonaParsed | null> {
  const { data, error } = await supabase
    .from('service_personas')
    .select('*')
    .eq('id', id.trim())
    .maybeSingle();

  if (error || !data) return null;
  return parseServicePersonaRow(data as Record<string, unknown>);
}

/**
 * LP 生成などから参照: `master_json` を優先し、未設定なら `persona_json` を返す。
 */
export async function getServiceMaster(
  supabase: SupabaseClient,
  serviceKey: string,
): Promise<Record<string, unknown> | null> {
  const persona = await getActiveServicePersonaByKey(supabase, serviceKey);
  if (!persona) return null;
  const mj = persona.master_json;
  if (mj && Object.keys(mj).length > 0) {
    return { ...mj };
  }
  const pj = persona.persona_json;
  if (pj && Object.keys(pj).length > 0) {
    return { ...pj };
  }
  return null;
}
