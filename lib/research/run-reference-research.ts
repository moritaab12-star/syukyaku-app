import { randomUUID } from 'crypto';
import type {
  ReferenceCandidate,
  ReferenceResearchResult,
} from '@/types/lp';
import type { ReferenceQueryContext } from '@/types/industry';
import { resolveIndustryMasterForProject } from '@/lib/industry/load-masters';
import { buildResearchQueries } from './query-build';
import { discoverLpUrlsWithPerplexity } from './perplexity-discover';
import { getUrlPrefilterRejection } from './exclusion';
import { fetchHtmlLight } from './fetch-html';
import {
  combinedReferenceScore,
  scoreHtmlForReferencePage,
} from './score-html';

const MIN_ACCEPTED = 3;
const MAX_ACCEPTED = 8;

function acceptByScores(
  lp: number,
  industry: number,
  signals: string[],
): boolean {
  if (lp >= 0.36) return true;
  const ctaHits = signals.filter((s) =>
    [
      'cta_tel',
      'form_present',
      'line_link',
      'cv_copy_hint',
      'mailto',
    ].includes(s),
  ).length;
  if (lp >= 0.26 && ctaHits >= 2) return true;
  if (lp >= 0.28 && industry >= 0.22) return true;
  if (lp >= 0.42 && ctaHits >= 1) return true;
  return false;
}

export type RunReferenceResearchInput = {
  industryKey?: string | null;
  lpIndustryTone?: string | null;
  area?: string | null;
  service?: string | null;
  intentKeyword?: string | null;
};

/**
 * 参照 LP 用 URL を 3〜8 件返す。
 * - URL 収集: Perplexity（`perplexity-seo-research` とは役務分担）
 * - 除外・スコア: ローカル（パス/ホスト + 軽量 HTML 取得）
 */
export async function runReferenceResearch(
  input: RunReferenceResearchInput,
): Promise<ReferenceResearchResult> {
  const runId = randomUUID();
  const master = resolveIndustryMasterForProject({
    industryKey: input.industryKey,
    lpIndustryTone: input.lpIndustryTone,
  });

  const context: ReferenceQueryContext = {
    area: input.area ?? null,
    service: input.service ?? null,
    industryKey: input.industryKey ?? master.id,
  };

  const query_variants_used = buildResearchQueries({
    master,
    context,
    intentKeyword: input.intentKeyword,
  });

  if (query_variants_used.length === 0) {
    return {
      ok: false,
      code: 'INSUFFICIENT_CANDIDATES',
      detail: 'no_queries_built',
      run_id: runId,
      industry_master_id: master.id,
      query_variants_used,
      candidates: [],
    };
  }

  const discovered = await discoverLpUrlsWithPerplexity({
    queries: query_variants_used,
    industryLabel: master.name,
    maxUrls: 22,
  });

  if (discovered.ok === false) {
    const code =
      discovered.status === 0
        ? 'PERPLEXITY_UNAVAILABLE'
        : 'PERPLEXITY_ERROR';
    return {
      ok: false,
      code,
      detail: discovered.errorText.slice(0, 500),
      run_id: runId,
      industry_master_id: master.id,
      query_variants_used,
      candidates: [],
    };
  }

  if (discovered.urls.length === 0) {
    return {
      ok: false,
      code: 'PERPLEXITY_PARSE_EMPTY',
      detail: discovered.raw_snippet.slice(0, 400),
      run_id: runId,
      industry_master_id: master.id,
      query_variants_used,
      candidates: [],
    };
  }

  const candidates: ReferenceCandidate[] = [];
  const accepted: {
    url: string;
    candidate: ReferenceCandidate;
    sort: number;
  }[] = [];
  const now = new Date().toISOString();

  for (const url of discovered.urls) {
    const pre = getUrlPrefilterRejection(url);
    if (pre) {
      candidates.push({
        url,
        status: 'rejected_not_lp',
        fetched_at: now,
        rejection_code: `prefilter:${pre}`,
        signals: [],
      });
      continue;
    }

    const fetched = await fetchHtmlLight(url);
    if (fetched.ok === false) {
      candidates.push({
        url,
        status: 'rejected_fetch',
        fetched_at: now,
        rejection_code: `fetch:${fetched.detail}`,
        lp_likelihood_score: 0,
        industry_fit_score: 0,
        signals: [],
      });
      continue;
    }

    const scored = scoreHtmlForReferencePage(fetched.html, master, {
      service: input.service,
    });
    const sort = combinedReferenceScore(
      scored.lp_likelihood_score,
      scored.industry_fit_score,
    );

    if (!acceptByScores(scored.lp_likelihood_score, scored.industry_fit_score, scored.signals)) {
      candidates.push({
        url: fetched.finalUrl,
        status: 'rejected_no_cv',
        fetched_at: now,
        rejection_code: 'low_lp_signals',
        lp_likelihood_score: scored.lp_likelihood_score,
        industry_fit_score: scored.industry_fit_score,
        signals: scored.signals,
      });
      continue;
    }

    const cand: ReferenceCandidate = {
      url: fetched.finalUrl,
      status: 'accepted',
      fetched_at: now,
      lp_likelihood_score: scored.lp_likelihood_score,
      industry_fit_score: scored.industry_fit_score,
      signals: scored.signals,
    };
    candidates.push(cand);
    accepted.push({ url: fetched.finalUrl, candidate: cand, sort });
  }

  accepted.sort((a, b) => b.sort - a.sort);
  const uniqueAccepted: ReferenceCandidate[] = [];
  const seenUrl = new Set<string>();
  for (const row of accepted) {
    if (seenUrl.has(row.url)) continue;
    seenUrl.add(row.url);
    uniqueAccepted.push(row.candidate);
    if (uniqueAccepted.length >= MAX_ACCEPTED) break;
  }

  if (uniqueAccepted.length < MIN_ACCEPTED) {
    return {
      ok: false,
      code: 'INSUFFICIENT_CANDIDATES',
      detail: `accepted:${uniqueAccepted.length}_need:${MIN_ACCEPTED}`,
      run_id: runId,
      industry_master_id: master.id,
      query_variants_used,
      candidates,
    };
  }

  return {
    ok: true,
    urls: uniqueAccepted.map((c) => c.url),
    run_id: runId,
    industry_master_id: master.id,
    query_variants_used,
    candidates,
  };
}
