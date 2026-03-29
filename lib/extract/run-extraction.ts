import type { ExtractedPattern, PatternConsensus } from '@/types/lp';
import { fetchHtmlLight } from '@/lib/research/fetch-html';
import { extractPatternFromHtml } from './extract-from-html';
import { buildPatternConsensus } from './consensus';

export type RunPatternExtractionInput = {
  urls: string[];
  /** 合意に必要な最小 URL 数（既定 2） */
  minSupportUrlCount?: number;
};

export type RunPatternExtractionResult = {
  patterns: ExtractedPattern[];
  consensus: PatternConsensus | null;
  errors: { url: string; code: string }[];
};

/**
 * URL 一覧から構造メタを抽出し、2 件以上一致分を PatternConsensus にまとめる。
 */
export async function runPatternExtraction(
  input: RunPatternExtractionInput,
): Promise<RunPatternExtractionResult> {
  const minN = input.minSupportUrlCount ?? 2;
  const patterns: ExtractedPattern[] = [];
  const errors: { url: string; code: string }[] = [];

  for (const url of input.urls) {
    const fetched = await fetchHtmlLight(url);
    if (fetched.ok === false) {
      errors.push({ url, code: fetched.detail });
      continue;
    }
    patterns.push(extractPatternFromHtml(fetched.html, fetched.finalUrl));
  }

  const consensus =
    patterns.length >= minN
      ? buildPatternConsensus(patterns, minN)
      : null;

  return { patterns, consensus, errors };
}
