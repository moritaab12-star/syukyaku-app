import { parseInstruction } from '@/app/lib/agent/parseInstruction';
import { planLpThemes } from '@/app/lib/agent/planLpThemes';
import { researchCompetitors } from '@/app/lib/agent/researchCompetitors';
import { extractCommonPatterns } from '@/app/lib/agent/extractCommonPatterns';
import { selectMode } from '@/app/lib/agent/selectMode';
import type {
  CommonPatternSummary,
  LpTheme,
  ParsedInstruction,
} from '@/app/lib/agent/types';

export type AgentThemePreviewRow = { title: string; mode: string };

export type AgentPlanFromInstruction = {
  parsed: ParsedInstruction;
  themes: LpTheme[];
  themePreview: AgentThemePreviewRow[];
  patternSummary: CommonPatternSummary | null;
  researchUsed: boolean;
};

/** parse → themes → 任意リサーチ → モード付きプレビュー（executeLpGeneration より前）。 */
export async function buildAgentPlanFromInstruction(
  instruction: string,
  useCompetitorResearch: boolean,
): Promise<AgentPlanFromInstruction> {
  const parsed = await parseInstruction(instruction);
  const themes = await planLpThemes(parsed);

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
