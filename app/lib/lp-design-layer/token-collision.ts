import type { DesignStrategy, LpDesignTokens } from '@/app/lib/lp-design-layer/schema';
import { tokenFingerprint } from '@/app/lib/lp-design-layer/sibling-design-fingerprints';

const ALL_THEMES: LpDesignTokens['themeKey'][] = [
  'trust_neutral',
  'fresh_pop',
  'luxury_subtle',
  'warm_friendly',
];

const RADII: LpDesignTokens['radius'][] = ['sm', 'md', 'lg'];

const ICONS: LpDesignTokens['iconSet'][] = ['outline', 'filled', 'minimal_line'];

/**
 * 先行 LP と同じ指紋ならテーマ・半径・アイコン・CTA 形を決定的にずらす。
 */
export function nudgeTokensAvoidFingerprints(
  tokens: LpDesignTokens,
  strategy: DesignStrategy,
  fingerprints: Set<string>,
  seed: number,
): LpDesignTokens {
  if (fingerprints.size === 0) return tokens;

  let cur: LpDesignTokens = { ...tokens };
  if (!fingerprints.has(tokenFingerprint(cur))) return cur;

  for (let round = 0; round < 48; round++) {
    const off = (seed + round * 9973) >>> 0;
    const theme = ALL_THEMES[off % ALL_THEMES.length]!;
    const radius = RADII[(off >>> 3) % RADII.length]!;
    let icon = ICONS[(off >>> 5) % ICONS.length]!;
    const pill =
      (off >>> 7) % 2 === 0 &&
      (strategy.tone === 'pop' ||
        strategy.tone === 'friendly' ||
        strategy.targetType === 'young');
    const ctaShape: LpDesignTokens['ctaShape'] = pill ? 'pill' : 'default';

    if (strategy.visualLevel === 'minimal' && icon === 'filled') {
      icon = 'minimal_line';
    }
    const candidate: LpDesignTokens = {
      ...cur,
      themeKey: theme,
      radius,
      iconSet: strategy.visualLevel === 'minimal' ? 'minimal_line' : icon,
      ctaShape,
    };
    if (strategy.visualLevel === 'minimal' && candidate.shadow === 'elevated') {
      candidate.shadow = 'soft';
    }
    if (!fingerprints.has(tokenFingerprint(candidate))) {
      return candidate;
    }
    cur = candidate;
  }

  return cur;
}
