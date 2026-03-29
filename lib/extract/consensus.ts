/**
 * 複数 ExtractedPattern から、2 URL 以上で一致する要素だけ PatternConsensus に載せる。
 */

import type { RecommendedSectionRole } from '@/types/industry';
import type { CtaKind, ExtractedPattern, PatternConsensus } from '@/types/lp';

function median(nums: number[]): number {
  if (nums.length === 0) return 99;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * @param patterns 同一業種の参照 URL からの抽出（2 件未満なら null）
 * @param minSupportUrlCount 役割・CTA を「昇格」させる最小 URL 数（デフォルト 2）
 */
export function buildPatternConsensus(
  patterns: ExtractedPattern[],
  minSupportUrlCount = 2,
): PatternConsensus | null {
  if (patterns.length < minSupportUrlCount) return null;

  const evidenceUrls = [...new Set(patterns.map((p) => p.source_url))];
  if (evidenceUrls.length < minSupportUrlCount) return null;

  const roleFirstIndices = new Map<RecommendedSectionRole, number[]>();
  const roleUrlPresence = new Map<RecommendedSectionRole, Set<string>>();

  for (const p of patterns) {
    const seenInPage = new Set<RecommendedSectionRole>();
    p.section_sequence.forEach((role, idx) => {
      if (!roleFirstIndices.has(role)) roleFirstIndices.set(role, []);
      if (!seenInPage.has(role)) {
        roleFirstIndices.get(role)!.push(idx);
        seenInPage.add(role);
      }
      if (!roleUrlPresence.has(role)) roleUrlPresence.set(role, new Set());
      roleUrlPresence.get(role)!.add(p.source_url);
    });
  }

  const promotedRoles = (
    [...roleUrlPresence.entries()] as [
      RecommendedSectionRole,
      Set<string>,
    ][]
  )
    .filter(([, urls]) => urls.size >= minSupportUrlCount)
    .map(([role]) => role);

  promotedRoles.sort((a, b) => {
    const ia = median(roleFirstIndices.get(a) ?? []);
    const ib = median(roleFirstIndices.get(b) ?? []);
    return ia - ib;
  });

  const ctaUrlCounts = new Map<CtaKind, Set<string>>();
  for (const p of patterns) {
    const uniq = [...new Set(p.cta_kinds_found)];
    for (const c of uniq) {
      if (!ctaUrlCounts.has(c)) ctaUrlCounts.set(c, new Set());
      ctaUrlCounts.get(c)!.add(p.source_url);
    }
  }
  const cta_kinds_common = [...ctaUrlCounts.entries()]
    .filter(([, urls]) => urls.size >= minSupportUrlCount)
    .map(([c]) => c);

  const trustUrlCounts = new Map<string, Set<string>>();
  for (const p of patterns) {
    const uniq = [...new Set(p.trust_block_kinds)];
    for (const t of uniq) {
      if (!trustUrlCounts.has(t)) trustUrlCounts.set(t, new Set());
      trustUrlCounts.get(t)!.add(p.source_url);
    }
  }
  const trust_block_kinds_common = [...trustUrlCounts.entries()]
    .filter(([, urls]) => urls.size >= minSupportUrlCount)
    .map(([t]) => t);

  const ctaKindCounts = patterns.map((p) => new Set(p.cta_kinds_found).size).sort(
    (a, b) => a - b,
  );
  const mid = Math.floor(ctaKindCounts.length / 2);
  const typical_cta_kind_count =
    ctaKindCounts.length % 2
      ? ctaKindCounts[mid]!
      : Math.round((ctaKindCounts[mid - 1]! + ctaKindCounts[mid]!) / 2);

  return {
    section_sequence: promotedRoles.length ? promotedRoles : [],
    supporting_url_count: evidenceUrls.length,
    cta_kinds_common,
    trust_block_kinds_common,
    typical_cta_kind_count,
    evidence_urls: evidenceUrls,
  };
}
