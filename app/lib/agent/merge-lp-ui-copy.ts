import type { LpUiCopy } from '@/app/lib/lp-ui-copy';
import { parseLpUiCopy } from '@/app/lib/lp-ui-copy';

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * テンプレの lp_ui_copy にエージェントパッチをマージ（初回 insert 用）。
 */
export function mergeLpUiCopyForInsert(
  base: unknown,
  patch: Partial<LpUiCopy>,
): Record<string, unknown> {
  const b: Record<string, unknown> = isObj(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      const arr = v.filter(
        (x) => typeof x === 'string' && x.trim().length > 0,
      ) as string[];
      if (arr.length === 0) continue;
      b[k] = arr;
      continue;
    }
    if (typeof v === 'string' && !v.trim()) continue;
    b[k] = v;
  }
  return b;
}

/**
 * FV 後: headline / subheadline は既存（FV）を優先し、それ以外はパッチで上書き。
 */
export function mergeLpUiCopyAfterFv(
  current: unknown,
  patch: Partial<LpUiCopy>,
): Record<string, unknown> {
  const parsed = parseLpUiCopy(current);
  const b: Record<string, unknown> = isObj(current)
    ? { ...(current as Record<string, unknown>) }
    : {};

  const fvHeadline = parsed?.headline?.trim();
  const fvSub = parsed?.subheadline?.trim();

  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    if (k === 'headline' && fvHeadline) continue;
    if (k === 'subheadline' && fvSub) continue;
    if (Array.isArray(v)) {
      const arr = v.filter(
        (x) => typeof x === 'string' && x.trim().length > 0,
      ) as string[];
      if (arr.length === 0) continue;
      b[k] = arr;
      continue;
    }
    if (typeof v === 'string' && !v.trim()) continue;
    b[k] = v;
  }
  return b;
}
