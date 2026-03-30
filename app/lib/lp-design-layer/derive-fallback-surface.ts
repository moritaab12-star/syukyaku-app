import type { DesignStrategy, LpDesignTokens, LpDiagramFlags } from '@/app/lib/lp-design-layer/schema';
import {
  FALLBACK_DESIGN_TOKENS,
  FALLBACK_DIAGRAM_FLAGS,
} from '@/app/lib/lp-design-layer/schema';
import { mulberry32 } from '@/app/lib/lp-design-layer/seed-jitter';

export function deriveFallbackDesignSurface(
  strategy: DesignStrategy,
  seed: number,
): { tokens: LpDesignTokens; diagram_flags: LpDiagramFlags } {
  const themeKey: LpDesignTokens['themeKey'] =
    strategy.tone === 'pop'
      ? 'fresh_pop'
      : strategy.tone === 'luxury'
        ? 'luxury_subtle'
        : strategy.tone === 'friendly'
          ? 'warm_friendly'
          : 'trust_neutral';

  const tokensBase: LpDesignTokens = {
    ...FALLBACK_DESIGN_TOKENS,
    themeKey,
    shadow:
      strategy.visualLevel === 'strong'
        ? 'elevated'
        : strategy.visualLevel === 'minimal'
          ? 'none'
          : 'soft',
    radius: strategy.informationDensity === 'high' ? 'md' : 'md',
    iconSet: strategy.visualLevel === 'minimal' ? 'minimal_line' : 'outline',
    surfaceContrast:
      strategy.informationDensity === 'high' ? 'high' : 'medium',
  };

  const tokens = tokensBase;

  const rng = mulberry32((seed ^ 0xdeadbeef) >>> 0);
  const diagram_flags: LpDiagramFlags = { ...FALLBACK_DIAGRAM_FLAGS };

  if (strategy.informationDensity === 'high') {
    diagram_flags.checklist = rng() > 0.45;
    diagram_flags.stats = rng() > 0.55;
  } else if (strategy.informationDensity === 'low') {
    diagram_flags.flow = rng() < 0.35;
  }
  if (strategy.priority === 'speed') {
    diagram_flags.flow = true;
  }
  if (rng() < 0.22) {
    diagram_flags.compare = true;
  }

  return { tokens, diagram_flags };
}
