import type { DesignStrategy, LpDesignTokens } from '@/app/lib/lp-design-layer/schema';

export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const THEME_BY_TONE: Record<DesignStrategy['tone'], LpDesignTokens['themeKey'][]> = {
  trust: ['trust_neutral', 'warm_friendly'],
  pop: ['fresh_pop', 'warm_friendly'],
  luxury: ['luxury_subtle', 'trust_neutral'],
  friendly: ['warm_friendly', 'fresh_pop'],
};

const RADII = ['sm', 'md', 'lg'] as const;

/**
 * variation_seed 由来の決定的な微調整のみ（CTA/フォント/最小余白は触らない）。
 * 約 18% でいずれか 1 軸のみ変化。
 */
export function applyDeterministicTokenJitter(
  tokens: LpDesignTokens,
  strategy: DesignStrategy,
  seed: number,
): LpDesignTokens {
  const out: LpDesignTokens = { ...tokens };
  if (strategy.visualLevel === 'minimal') {
    if (out.shadow === 'elevated') out.shadow = 'soft';
    if (out.iconSet === 'filled') out.iconSet = 'minimal_line';
  }

  const rng = mulberry32(seed ^ 0x9e3779b9);
  const r = rng();
  if (r > 0.18) return out;

  const kind = seed % 3;
  if (kind === 0) {
    const cands = THEME_BY_TONE[strategy.tone];
    out.themeKey = cands[Math.floor(rng() * cands.length)] ?? out.themeKey;
  } else if (kind === 1) {
    const i = RADII.indexOf(out.radius);
    const shift = (Math.floor(rng() * 3) - 1) as -1 | 0 | 1;
    const ni = Math.max(0, Math.min(RADII.length - 1, i < 0 ? 1 : i + shift));
    out.radius = RADII[ni] ?? out.radius;
  } else {
    const icons = ['outline', 'filled', 'minimal_line'] as const;
    out.iconSet = icons[Math.floor(rng() * icons.length)] ?? out.iconSet;
    if (strategy.visualLevel === 'minimal') out.iconSet = 'minimal_line';
  }
  return out;
}
