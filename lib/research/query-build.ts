import type { IndustryMaster } from '@/types/industry';
import type { ReferenceQueryContext } from '@/types/industry';
import { buildReferenceSearchQueries } from '@/lib/industry/load-masters';

export type ResearchQueryInput = {
  master: IndustryMaster;
  context: ReferenceQueryContext;
  /** 検索意図・KW（任意。クエリ末尾に付与して多様化） */
  intentKeyword?: string | null;
};

/**
 * マスター雛形の展開 + 意図語による追加クエリ。
 * Perplexity 1 回に束ねて渡す想定。
 */
export function buildResearchQueries(input: ResearchQueryInput): string[] {
  const base = buildReferenceSearchQueries(input.master, input.context);
  const intent = (input.intentKeyword ?? '').trim();
  const service = (input.context.service ?? '').trim();

  const extra: string[] = [];
  if (intent && service) {
    extra.push(`${service} ${intent} 公式`);
    extra.push(`${intent} ${service} 申し込み`);
  } else if (intent) {
    extra.push(`${input.master.name} ${intent} サービス`);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of [...base, ...extra]) {
    const t = q.replace(/\s+/g, ' ').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
