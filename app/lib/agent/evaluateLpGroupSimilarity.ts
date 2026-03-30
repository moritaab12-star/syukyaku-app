/**
 * 同一LPグループ（親系譜 × service × area）内の過去LPとの軽量類似判定。
 * 将来 Embedding / 再生成閾値へ拡張しやすいよう、判定とスコア減点を分離。
 */

import type { LpGroupHistoryItem } from '@/app/lib/agent/loadLpGroupHistory';
import type { LpGroupSimilarityWarning } from '@/app/lib/agent/types';

export type EvaluateLpGroupSimilarityInput = {
  projectId: string;
  headline: string;
  keyword: string;
  mode: string | null;
};

/** keyword 比較用（空白除去・小文字） */
export function normKeywordCompact(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function normTitleCompact(s: string): string {
  return s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
}

function titleAlmostSame(a: string, b: string): boolean {
  const na = normTitleCompact(a);
  const nb = normTitleCompact(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const mn = Math.min(na.length, nb.length);
  const mx = Math.max(na.length, nb.length);
  if (mn >= 8 && (na.includes(nb) || nb.includes(na))) return true;
  if (mn >= 10 && mx > 0 && mn / mx > 0.88) {
    return na.slice(0, 14) === nb.slice(0, 14);
  }
  return false;
}

function keywordVeryClose(a: string, b: string): boolean {
  const na = normKeywordCompact(a);
  const nb = normKeywordCompact(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) {
    return true;
  }
  return false;
}

function tokenSet(s: string): Set<string> {
  const parts = s
    .normalize('NFKC')
    .toLowerCase()
    .split(/[\s　、,.・/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  return new Set(parts);
}

/** 簡易クラスタ近接（語の Jaccard） */
function keywordTokenJaccard(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) {
    if (B.has(x)) inter += 1;
  }
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}

function headlineCharOverlapRatio(a: string, b: string): number {
  const na = normTitleCompact(a);
  const nb = normTitleCompact(b);
  if (na.length < 8 || nb.length < 8) return 0;
  let same = 0;
  const len = Math.min(na.length, nb.length);
  for (let i = 0; i < len; i += 1) {
    if (na[i] === nb[i]) same += 1;
  }
  return same / Math.max(na.length, nb.length);
}

function modesEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const sa = typeof a === 'string' ? a.trim() : '';
  const sb = typeof b === 'string' ? b.trim() : '';
  return sa.length > 0 && sa === sb;
}

function tierPenalty(t: 'strong' | 'medium' | 'light'): number {
  if (t === 'strong') return 18;
  if (t === 'medium') return 10;
  return 4;
}

/**
 * 履歴は呼び出し側で「自プロジェクト除外」「件数上限」済みであること。
 */
export function evaluateAgainstLpGroupHistory(
  current: EvaluateLpGroupSimilarityInput,
  history: LpGroupHistoryItem[],
  opts?: { maxPenalty?: number },
): {
  penalty: number;
  reasons: string[];
  similarityWarnings: LpGroupSimilarityWarning[];
} {
  const maxPenalty = opts?.maxPenalty ?? 38;
  const hl = (current.headline ?? '').trim();
  const kw = (current.keyword ?? '').trim();
  const warnings: LpGroupSimilarityWarning[] = [];
  let penalty = 0;

  const peerTiers = new Map<string, 'strong' | 'medium' | 'light'>();

  for (const h of history) {
    if (h.id === current.projectId) continue;

    const peerKw = (h.keyword ?? '').trim();
    const peerTitle = (h.title ?? '').trim();
    const peerMode = h.mode;

    let tier: 'strong' | 'medium' | 'light' | null = null;

    const keyEq = kw && peerKw && normKeywordCompact(kw) === normKeywordCompact(peerKw);

    if (keyEq) {
      tier = 'strong';
    } else if (keywordVeryClose(kw, peerKw) && modesEqual(current.mode, peerMode)) {
      tier = 'strong';
    } else if (
      hl &&
      (titleAlmostSame(hl, peerTitle) || titleAlmostSame(hl, peerKw))
    ) {
      tier = 'strong';
    } else if (keywordVeryClose(kw, peerKw)) {
      tier = 'medium';
    } else if (hl && peerTitle && headlineCharOverlapRatio(hl, peerTitle) >= 0.72) {
      tier = 'medium';
    } else if (modesEqual(current.mode, peerMode) && keywordTokenJaccard(kw, peerKw) >= 0.42) {
      tier = 'medium';
    } else if (keywordTokenJaccard(kw, peerKw) >= 0.52) {
      tier = 'medium';
    } else if (keywordTokenJaccard(kw, peerKw) >= 0.28) {
      tier = 'light';
    } else if (modesEqual(current.mode, peerMode) && keywordTokenJaccard(kw, peerKw) >= 0.22) {
      tier = 'light';
    }

    if (!tier) continue;

    const prev = peerTiers.get(h.id);
    if (!prev || tierRank(tier) > tierRank(prev)) {
      peerTiers.set(h.id, tier);
    }
  }

  for (const [comparedProjectId, tier] of peerTiers) {
    const row = history.find((x) => x.id === comparedProjectId);
    warnings.push({
      comparedProjectId,
      title: row?.title ?? null,
      keyword: row?.keyword ?? null,
      level: tier,
    });
    penalty += tierPenalty(tier);
  }

  penalty = Math.min(maxPenalty, penalty);

  const reasons: string[] = [];
  const levels = new Set(warnings.map((w) => w.level));
  if (levels.has('strong')) {
    reasons.push(
      '同一LPグループ内の過去LPとキーワードまたは見出しが強く類似しています（差別化を検討してください）',
    );
  }
  if (levels.has('medium')) {
    reasons.push(
      '同一LPグループ内の過去LPとキーワード・訴求が中程度に重なっています',
    );
  }
  if (levels.has('light') && !levels.has('strong') && !levels.has('medium')) {
    reasons.push('同一LPグループ内の他LPとの差分がやや少なめです');
  } else if (levels.has('light') && (levels.has('strong') || levels.has('medium'))) {
    reasons.push('一部の過去LPと語句の重なりがあります');
  }

  return { penalty, reasons, similarityWarnings: warnings };
}

function tierRank(t: 'strong' | 'medium' | 'light'): number {
  if (t === 'strong') return 3;
  if (t === 'medium') return 2;
  return 1;
}
