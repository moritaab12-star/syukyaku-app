import { runReferenceResearch } from '@/lib/research/run-reference-research';
import type { ReferenceResearchResult } from '@/types/lp';

export type ResearchCompetitorsInput = {
  area: string | null;
  service: string | null;
  industryKey?: string | null;
  intentKeyword?: string | null;
};

/**
 * 参照 LP URL を収集（失敗時も例外にせず結果を返す）。
 */
export async function researchCompetitors(
  input: ResearchCompetitorsInput,
): Promise<ReferenceResearchResult> {
  try {
    const res = await runReferenceResearch({
      area: input.area,
      service: input.service,
      industryKey: input.industryKey ?? null,
      intentKeyword: input.intentKeyword ?? null,
    });
    if (!res.ok) {
      console.error(
        '[agent] researchCompetitors not ok',
        res.ok === false ? res.code : '',
        res.ok === false ? res.detail?.slice(0, 200) : '',
      );
    }
    return res;
  } catch (e) {
    console.error('[agent] researchCompetitors threw', e);
    return {
      ok: false,
      code: 'PERPLEXITY_ERROR',
      detail: e instanceof Error ? e.message : 'unknown',
      query_variants_used: [],
      candidates: [],
    };
  }
}
