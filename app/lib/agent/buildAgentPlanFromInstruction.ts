import type { SupabaseClient } from '@supabase/supabase-js';
import { parseInstruction } from '@/app/lib/agent/parseInstruction';
import { planLpThemes } from '@/app/lib/agent/planLpThemes';
import { researchCompetitors } from '@/app/lib/agent/researchCompetitors';
import { extractCommonPatterns } from '@/app/lib/agent/extractCommonPatterns';
import { selectMode } from '@/app/lib/agent/selectMode';
import {
  buildAvoidKeywordsFromHistory,
  loadLpGroupHistory,
} from '@/app/lib/agent/loadLpGroupHistory';
import {
  lpIndustryToneDescriptionForPrompt,
  resolveLpIndustryTone,
} from '@/app/lib/lp-industry';
import { loadAvoidKeywordsFromHistory, normalizeResearchService } from '@/app/lib/keyword-research-db';
import {
  fetchLpGroupKeywordCandidates,
  filterKeywordCandidatesForLpGroup,
  type KeywordResearchCandidate,
} from '@/app/lib/perplexity-keyword-research';
import { normalizeServiceName } from '@/app/lib/agent/normalize-service';
import type {
  CommonPatternSummary,
  LpTheme,
  ParsedInstruction,
} from '@/app/lib/agent/types';

/** テンプレ／親 project id を基準に、同一 service・area の履歴からテーマ被りを避ける */
export type BuildAgentPlanContext = {
  supabase: SupabaseClient;
  historyAnchorProjectId: string;
};

export type AgentThemePreviewRow = { title: string; mode: string };

export type AgentPlanFromInstruction = {
  parsed: ParsedInstruction;
  themes: LpTheme[];
  themePreview: AgentThemePreviewRow[];
  patternSummary: CommonPatternSummary | null;
  researchUsed: boolean;
};

/** parse → （任意）同一LPグループ履歴 → themes → 任意リサーチ → モード付きプレビュー（executeLpGeneration より前）。 */
export async function buildAgentPlanFromInstruction(
  instruction: string,
  useCompetitorResearch: boolean,
  planContext?: BuildAgentPlanContext | null,
): Promise<AgentPlanFromInstruction> {
  const parsed = await parseInstruction(instruction);

  let avoidKeywords: string[] = [];
  const anchor = planContext?.historyAnchorProjectId?.trim() ?? '';
  if (planContext?.supabase && anchor) {
    const hist = await loadLpGroupHistory(planContext.supabase, {
      parentProjectId: anchor,
      service: parsed.service,
      area: parsed.area,
    });
    avoidKeywords = buildAvoidKeywordsFromHistory(hist);
  }

  let keywordCandidates: KeywordResearchCandidate[] = [];
  if (planContext?.supabase && anchor && normalizeServiceName(parsed.service)) {
    try {
      const { data: metaRow, error: metaErr } = await planContext.supabase
        .from('projects')
        .select('industry_key, project_type')
        .eq('id', anchor)
        .maybeSingle();

      if (metaErr) {
        console.error('[agent] template meta for Perplexity', metaErr.message);
      }

      const row = metaRow as {
        industry_key?: string | null;
        project_type?: string | null;
      } | null;

      const industryKey =
        typeof row?.industry_key === 'string' && row.industry_key.trim()
          ? row.industry_key.trim()
          : null;
      const projectType =
        typeof row?.project_type === 'string' && row.project_type.trim()
          ? row.project_type.trim()
          : null;

      const serviceNorm = normalizeServiceName(parsed.service);
      const areaKey =
        typeof parsed.area === 'string' && parsed.area.trim() ? parsed.area.trim() : '地域';

      const researchAvoid = await loadAvoidKeywordsFromHistory(
        planContext.supabase,
        {
          areaKey,
          service: normalizeResearchService(serviceNorm),
          industryKey,
        },
        { maxPhrases: 80, maxTotalChars: 4000 },
      );

      const lpLower = new Set(
        avoidKeywords.map((k) => k.normalize('NFKC').trim().toLowerCase()),
      );
      const extraAvoid = researchAvoid.filter(
        (k) => !lpLower.has(k.normalize('NFKC').trim().toLowerCase()),
      );

      const tone = resolveLpIndustryTone(industryKey, serviceNorm);
      const industryDescription = lpIndustryToneDescriptionForPrompt(tone);

      const { candidates } = await fetchLpGroupKeywordCandidates({
        areaKey,
        service: serviceNorm,
        industryKeyRaw: industryKey,
        industryTone: tone,
        industryDescription,
        lpGroupAvoidKeywords: avoidKeywords,
        extraAvoidKeywords: extraAvoid,
        target: parsed.target,
        appeal: parsed.appeal,
        projectType,
        maxCandidates: 14,
      });

      keywordCandidates = filterKeywordCandidatesForLpGroup(
        candidates,
        avoidKeywords,
        18,
      );
    } catch (e) {
      console.error('[agent] lp-group Perplexity keyword candidates failed', e);
    }
  }

  const themes = await planLpThemes(parsed, {
    avoidKeywords,
    keywordCandidates,
  });

  let patternSummary: CommonPatternSummary | null = null;
  let researchUsed = false;
  if (useCompetitorResearch) {
    const r = await researchCompetitors({
      area: parsed.area || null,
      service: parsed.service || null,
      intentKeyword: parsed.target || parsed.appeal || null,
    });
    if (r.ok && r.urls.length > 0) {
      patternSummary = await extractCommonPatterns(r.urls);
      researchUsed = true;
    } else {
      console.error('[agent] research skipped or failed', r.ok === false ? r.code : '');
    }
  }

  const themePreview = themes.map((t) => ({
    title: t.title,
    mode: selectMode({
      themeTitle: t.title,
      keyword: t.title,
      parsed,
    }).mode,
  }));

  return {
    parsed,
    themes,
    themePreview,
    patternSummary,
    researchUsed,
  };
}
