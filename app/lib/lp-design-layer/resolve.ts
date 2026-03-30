import {
  type LpDesignRow,
  FALLBACK_DESIGN_STRATEGY,
  applyDesignConstraints,
  safeParseLpDesignRow,
} from '@/app/lib/lp-design-layer/schema';
import { applyDeterministicTokenJitter } from '@/app/lib/lp-design-layer/seed-jitter';
import { deriveFallbackDesignSurface } from '@/app/lib/lp-design-layer/derive-fallback-surface';

export type ResolveLpDesignInput = {
  /** projects.lp_design JSON（null 可） */
  lpDesignJson: unknown;
  variationSeed: number;
};

/**
 * DB の lp_design を検証し、矯正・seed 由来のトークン揺らぎを適用。
 * 不正・未設定時はフォールバック戦略＋決定的 surface。
 */
export function resolveLpDesignLayer(input: ResolveLpDesignInput): LpDesignRow {
  const seed = Number.isFinite(input.variationSeed)
    ? Math.trunc(input.variationSeed)
    : 0;

  const parsed = safeParseLpDesignRow(input.lpDesignJson);
  if (parsed.ok) {
    const strategy = applyDesignConstraints(parsed.data.strategy);
    const tokens = applyDeterministicTokenJitter(
      parsed.data.tokens,
      strategy,
      seed,
    );
    return {
      strategy,
      tokens,
      diagram_flags: parsed.data.diagram_flags,
      source: parsed.data.source ?? 'validated',
    };
  }

  const strategy = FALLBACK_DESIGN_STRATEGY;
  const { tokens: baseTokens, diagram_flags } = deriveFallbackDesignSurface(
    strategy,
    seed,
  );
  const tokens = applyDeterministicTokenJitter(baseTokens, strategy, seed);
  return {
    strategy,
    tokens,
    diagram_flags,
    source: 'fallback',
  };
}
