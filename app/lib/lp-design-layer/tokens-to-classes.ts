import type { LpDesignTokens } from '@/app/lib/lp-design-layer/schema';

/** `.lp-body` に付与する修飾クラス（CTA/タイポのトークンは含めない）。 */
export function lpDesignTokensToBodyClasses(tokens: LpDesignTokens): string[] {
  const theme = tokens.themeKey.replace(/_/g, '-');
  const base = [
    `lp-body--theme-${theme}`,
    `lp-body--radius-${tokens.radius}`,
    `lp-body--shadow-${tokens.shadow}`,
    `lp-body--icons-${tokens.iconSet.replace(/_/g, '-')}`,
    `lp-body--contrast-${tokens.surfaceContrast}`,
  ];
  if (tokens.ctaShape === 'pill') base.push('lp-body--cta-pill');
  return base;
}
