import { runPatternExtraction } from '@/lib/extract/run-extraction';
import type { CommonPatternSummary } from '@/app/lib/agent/types';

/**
 * 受け入れ URL から構造メタのみ要約（本文・見出しの生コピーは含めない）。
 */
export async function extractCommonPatterns(
  urls: string[],
): Promise<CommonPatternSummary> {
  const empty: CommonPatternSummary = {
    commonHeadlines: [],
    commonCtas: [],
    commonSections: [],
    notes: [],
  };

  if (!urls.length) {
    return empty;
  }

  try {
    const { patterns, consensus, errors } = await runPatternExtraction({
      urls: urls.slice(0, 8),
      minSupportUrlCount: 2,
    });

    for (const e of errors) {
      empty.notes.push(`fetch:${e.url.slice(0, 48)}:${e.code}`);
    }

    if (consensus) {
      empty.commonSections = consensus.section_sequence.map(String);
      empty.commonCtas = consensus.cta_kinds_common.map(String);
      empty.notes.push(
        `consensus_urls:${consensus.supporting_url_count}`,
      );
      if (consensus.typical_cta_kind_count != null) {
        empty.notes.push(
          `typical_cta_kinds:${consensus.typical_cta_kind_count}`,
        );
      }
      empty.commonHeadlines = consensus.section_sequence.slice(0, 4).map(
        (role) => `block_${String(role)}`,
      );
    } else if (patterns.length) {
      const p = patterns[0];
      empty.commonSections = p.section_sequence.map(String);
      empty.commonCtas = p.cta_kinds_found.map(String);
      empty.notes.push('consensus:insufficient_single_pattern');
      empty.commonHeadlines = p.section_sequence.slice(0, 3).map(
        (role) => `block_${String(role)}`,
      );
    }

    return empty;
  } catch (e) {
    console.error('[agent] extractCommonPatterns', e);
    empty.notes.push(
      `error:${e instanceof Error ? e.message.slice(0, 120) : 'unknown'}`,
    );
    return empty;
  }
}
