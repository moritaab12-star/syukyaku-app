import type { SupabaseClient } from '@supabase/supabase-js';
import { countActiveServicePersonas, isActiveServicePersonaKey } from '@/app/lib/service-persona/db-server';

export type IndustryKeySaveGateError = {
  ok: false;
  error: string;
};

export type IndustryKeySaveGateOk = { ok: true };

/**
 * ローカルLP保存時: 有効な業種人格が1件以上ある環境では industry_key（=service_key）必須。
 * キーがあれば有効な登録のみ許可。
 */
export async function assertIndustryKeyAllowedForLocalSave(
  supabase: SupabaseClient,
  projectType: string,
  industryKey: string | null,
): Promise<IndustryKeySaveGateOk | IndustryKeySaveGateError> {
  if (projectType !== 'local') {
    return { ok: true };
  }

  const activeCount = await countActiveServicePersonas(supabase);
  if (activeCount === 0) {
    return { ok: true };
  }

  const key = typeof industryKey === 'string' ? industryKey.trim() : '';
  if (!key) {
    return {
      ok: false,
      error:
        '業種（登録済みの業種人格）を選択してください。未登録の場合は「業種JSON登録」から先に登録してください。',
    };
  }

  const valid = await isActiveServicePersonaKey(supabase, key);
  if (!valid) {
    return {
      ok: false,
      error:
        '選択された業種キーは無効です（未登録または無効化されています）。一覧を更新して選び直してください。',
    };
  }

  return { ok: true };
}
