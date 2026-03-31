import { z } from 'zod';

/** q33 からのルールベース価格シグナル */
export type Q33PriceSignal = 'strong' | 'medium' | 'weak';

export const DesignStrategySchema = z.object({
  tone: z.enum(['trust', 'pop', 'luxury', 'friendly']),
  priority: z.enum(['cv', 'trust_focus', 'speed']),
  targetType: z.enum(['young', 'senior', 'business']),
  informationDensity: z.enum(['high', 'medium', 'low']),
  visualLevel: z.enum(['strong', 'medium', 'minimal']),
});

export type DesignStrategy = z.infer<typeof DesignStrategySchema>;

export const LpDesignTokensSchema = z.object({
  themeKey: z.enum(['trust_neutral', 'fresh_pop', 'luxury_subtle', 'warm_friendly']),
  radius: z.enum(['sm', 'md', 'lg']),
  shadow: z.enum(['none', 'soft', 'elevated']),
  iconSet: z.enum(['outline', 'filled', 'minimal_line']),
  surfaceContrast: z.enum(['low', 'medium', 'high']),
  /** CTA の外形。既存 JSON に無い場合は default として扱う */
  ctaShape: z.enum(['default', 'pill']).optional(),
});

export type LpDesignTokens = z.infer<typeof LpDesignTokensSchema>;

export const LpDiagramFlagsSchema = z.object({
  checklist: z.boolean(),
  compare: z.boolean(),
  stats: z.boolean(),
  flow: z.boolean(),
});

export type LpDiagramFlags = z.infer<typeof LpDiagramFlagsSchema>;

export const LpDesignRowSchema = z.object({
  strategy: DesignStrategySchema,
  tokens: LpDesignTokensSchema,
  diagram_flags: LpDiagramFlagsSchema,
  source: z.enum(['ai', 'fallback', 'validated']).optional(),
});

export type LpDesignRow = z.infer<typeof LpDesignRowSchema>;

/** Zod 失敗時・未保存時の design_strategy */
export const FALLBACK_DESIGN_STRATEGY: DesignStrategy = {
  tone: 'trust',
  priority: 'cv',
  targetType: 'business',
  informationDensity: 'medium',
  visualLevel: 'medium',
};

/** Zod 失敗時の tokens + diagram（図解は控えめ） */
export const FALLBACK_DESIGN_TOKENS: LpDesignTokens = {
  themeKey: 'trust_neutral',
  radius: 'md',
  shadow: 'soft',
  iconSet: 'outline',
  surfaceContrast: 'medium',
  ctaShape: 'default',
};

export const FALLBACK_DIAGRAM_FLAGS: LpDiagramFlags = {
  checklist: false,
  compare: false,
  stats: false,
  flow: false,
};

/**
 * high × minimal を high × medium に矯正（その他はそのまま）。
 */
export function applyDesignConstraints(strategy: DesignStrategy): DesignStrategy {
  if (
    strategy.informationDensity === 'high' &&
    strategy.visualLevel === 'minimal'
  ) {
    return { ...strategy, visualLevel: 'medium' };
  }
  return strategy;
}

export function safeParseDesignStrategy(
  raw: unknown,
): { ok: true; data: DesignStrategy } | { ok: false } {
  const r = DesignStrategySchema.safeParse(raw);
  if (!r.success) return { ok: false };
  return { ok: true, data: applyDesignConstraints(r.data) };
}

export function safeParseLpDesignTokens(raw: unknown): { ok: true; data: LpDesignTokens } | { ok: false } {
  const r = LpDesignTokensSchema.safeParse(raw);
  if (!r.success) return { ok: false };
  return { ok: true, data: r.data };
}

export function safeParseLpDiagramFlags(
  raw: unknown,
): { ok: true; data: LpDiagramFlags } | { ok: false } {
  const r = LpDiagramFlagsSchema.safeParse(raw);
  if (!r.success) return { ok: false };
  return { ok: true, data: r.data };
}

export function safeParseLpDesignRow(raw: unknown): { ok: true; data: LpDesignRow } | { ok: false } {
  const r = LpDesignRowSchema.safeParse(raw);
  if (!r.success) return { ok: false };
  const strategy = applyDesignConstraints(r.data.strategy);
  return { ok: true, data: { ...r.data, strategy } };
}
