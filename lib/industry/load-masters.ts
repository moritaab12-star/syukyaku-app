import type {
  IndustryMaster,
  IndustryMasterId,
  ReferenceQueryContext,
} from '@/types/industry';
import defaults from './defaults.json';
import { expandReferenceQueries } from './expand-queries';

type MasterFile = {
  masters: IndustryMaster[];
};

const file = defaults as MasterFile;

function masterMap(): Map<IndustryMasterId, IndustryMaster> {
  const m = new Map<IndustryMasterId, IndustryMaster>();
  for (const master of file.masters) {
    if (master && typeof master.id === 'string') {
      m.set(master.id, master);
    }
  }
  return m;
}

const MAP = masterMap();

/** 同梱の IndustryMaster 一覧（JSON）。DB 実装時は別関数で差し替え。 */
export function getBuiltInIndustryMasters(): IndustryMaster[] {
  return file.masters.slice();
}

export function getIndustryMasterById(
  id: string,
): IndustryMaster | null {
  if (typeof id !== 'string' || !id.trim()) return null;
  return MAP.get(id.trim()) ?? null;
}

/**
 * `industry_key` 未設定や未知 ID のときのフォールバック。
 */
export function getDefaultIndustryMaster(): IndustryMaster {
  const g = MAP.get('general');
  if (g) return g;
  const first = file.masters[0];
  if (first) return first;
  throw new Error('[industry] defaults.json has no masters');
}

/**
 * マスター解決。`resolveLpIndustryTone` の戻り値を `lpIndustryTone` で渡すと
 * `industry_key` の表記ゆれより優先（キーは `defaults.json` の id と一致させる）。
 */
export function resolveIndustryMasterForProject(opts: {
  industryKey?: string | null | undefined;
  lpIndustryTone?: string | null | undefined;
}): IndustryMaster {
  const tone =
    typeof opts.lpIndustryTone === 'string'
      ? opts.lpIndustryTone.trim().toLowerCase()
      : '';
  if (tone) {
    const byTone = getIndustryMasterById(tone);
    if (byTone) return byTone;
  }
  const raw =
    typeof opts.industryKey === 'string' ? opts.industryKey.trim().toLowerCase() : '';
  if (raw) {
    const hit = getIndustryMasterById(raw);
    if (hit) return hit;
  }
  return getDefaultIndustryMaster();
}

/** マスター + コンテキストから、実際に検索へ渡すクエリ文字列一覧 */
export function buildReferenceSearchQueries(
  master: IndustryMaster,
  context: ReferenceQueryContext,
): string[] {
  return expandReferenceQueries(master.reference_queries, context);
}
