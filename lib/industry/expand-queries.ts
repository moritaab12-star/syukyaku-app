import type { ReferenceQueryContext } from '@/types/industry';

/**
 * IndustryMaster.reference_queries のプレースホルダを埋め、重複・空を除く。
 * プレースホルダ: `{area}`, `{service}`, `{industryKey}`
 */
export function expandReferenceQueries(
  templates: string[],
  context: ReferenceQueryContext,
): string[] {
  const area = (context.area ?? '').trim();
  const service = (context.service ?? '').trim();
  const industryKey = (context.industryKey ?? '').trim();

  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of templates) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    let s = raw
      .replace(/\{area\}/gi, area)
      .replace(/\{service\}/gi, service)
      .replace(/\{industryKey\}/gi, industryKey);
    s = s.replace(/\s+/g, ' ').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }

  return out;
}
