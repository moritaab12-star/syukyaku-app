import type { SupabaseClient } from '@supabase/supabase-js';
import { safeParseLpDesignRow } from '@/app/lib/lp-design-layer/schema';
import type { LpDesignTokens } from '@/app/lib/lp-design-layer/schema';

export type SiblingDesignContext = {
  /** プロンプトに載せる説明文 */
  summary: string;
  /** themeKey|radius|iconSet|ctaShape の集合（衝突検出用） */
  fingerprints: Set<string>;
};

export function tokenFingerprint(tokens: Pick<LpDesignTokens, 'themeKey' | 'radius' | 'iconSet'> & { ctaShape?: 'default' | 'pill' }): string {
  const shape = tokens.ctaShape ?? 'default';
  return `${tokens.themeKey}|${tokens.radius}|${tokens.iconSet}|${shape}`;
}

/**
 * 同一 lp_group 内の他行から lp_design を読み、差別化用テキストと指紋を返す。
 */
export async function loadSiblingDesignContext(
  supabase: SupabaseClient,
  lpGroupId: string | null | undefined,
  excludeProjectId: string,
  limit = 16,
): Promise<SiblingDesignContext> {
  const empty: SiblingDesignContext = {
    summary: '（同一グループに先行 LP なし。自由に最適化してよい。）',
    fingerprints: new Set(),
  };
  const gid = typeof lpGroupId === 'string' ? lpGroupId.trim() : '';
  if (!gid || !excludeProjectId.trim()) return empty;

  const { data, error } = await supabase
    .from('projects')
    .select('id, lp_design')
    .eq('lp_group_id', gid)
    .neq('id', excludeProjectId.trim())
    .limit(limit);

  if (error || !Array.isArray(data) || data.length === 0) {
    return empty;
  }

  const lines: string[] = [];
  const fingerprints = new Set<string>();

  for (const row of data) {
    const raw = (row as { lp_design?: unknown }).lp_design;
    const parsed = safeParseLpDesignRow(raw);
    if (!parsed.ok) continue;
    const { strategy, tokens } = parsed.data;
    fingerprints.add(tokenFingerprint(tokens));
    lines.push(
      `- tone=${strategy.tone} targetType=${strategy.targetType} priority=${strategy.priority} theme=${tokens.themeKey} radius=${tokens.radius} shadow=${tokens.shadow} icons=${tokens.iconSet} contrast=${tokens.surfaceContrast} ctaShape=${tokens.ctaShape ?? 'default'}`,
    );
  }

  if (lines.length === 0) {
    return {
      summary:
        '（同一グループに lp_design が保存された先行行はまだない、または JSON 不正。）',
      fingerprints,
    };
  }

  return {
    summary: [
      '【同一事業者グループの直近 LP・デザイン指紋】',
      '新規・更新 LP は、次の組み合わせと「同じ themeKey + radius + iconSet + ctaShape」を避け、見た目の差別化をはかること:',
      ...lines,
    ].join('\n'),
    fingerprints,
  };
}
