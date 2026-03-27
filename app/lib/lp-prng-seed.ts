/**
 * LP の決定的バリエーション用 seed。
 * mulberry32 本体は lp-block-randomizer と同式（ブロック選択と整合）。
 */

export function hashStringToUInt32(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 固定ゾーン（会社・エリア・サービス・50問の事実）とは別系統のテンプレ層用に
 * ブロック seed から派生させる（同一ブロック seed なら同一テンプレ選択）。
 */
export function deriveTemplateLayerSeed(blockSeed: number): number {
  return hashStringToUInt32(`tpl:${(blockSeed >>> 0).toString(16)}`);
}

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pickIndex(n: number, rng: () => number): number {
  if (n <= 0) return 0;
  return Math.floor(rng() * n);
}

/**
 * seed = hash(lp_group_id, project_id, variation_seed) 相当。
 * blockSeed を明示した場合はそれを優先（テスト・上書き用）。
 */
export function deriveLpBlockSeed(params: {
  blockSeed?: number;
  lpGroupId?: string | null;
  projectStableId?: string | null;
  variationSeed?: number;
}): number {
  if (typeof params.blockSeed === 'number' && Number.isFinite(params.blockSeed)) {
    return params.blockSeed >>> 0;
  }
  const g = (params.lpGroupId ?? '').trim();
  const p = (params.projectStableId ?? '').trim();
  const v =
    typeof params.variationSeed === 'number' && Number.isFinite(params.variationSeed)
      ? params.variationSeed >>> 0
      : 0;
  return hashStringToUInt32(`${g}\x1f${p}\x1f${v}`);
}

export function pickFrom<T>(arr: readonly T[], rng: () => number): T | undefined {
  if (!arr.length) return undefined;
  return arr[pickIndex(arr.length, rng)];
}
