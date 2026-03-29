import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  CommonPatternSummary,
  ExecuteLpGenerationResult,
  ParsedInstruction,
} from '@/app/lib/agent/types';
import type { LpTheme } from '@/app/lib/agent/types';
import { detectSearchIntent } from '@/app/lib/intent';
import { runFvCatchForLpGroupMembersIfNeeded } from '@/app/lib/fv-catch-generation';
import { selectMode } from '@/app/lib/agent/selectMode';
import { applyEnhancement } from '@/app/lib/agent/applyEnhancement';
import {
  mergeLpUiCopyAfterFv,
  mergeLpUiCopyForInsert,
} from '@/app/lib/agent/merge-lp-ui-copy';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DRAFT_OR_NULL_STATUS =
  'publish_status.eq.draft,publish_status.is.null';

type ProjectRow = Record<string, unknown>;

function serviceMatches(row: ProjectRow, service: string): boolean {
  const s = row.service;
  return typeof s === 'string' && s.trim() === service;
}

async function resolveTemplateRow(
  supabase: SupabaseClient,
  service: string,
  focusProjectId: string | null,
): Promise<{ template: ProjectRow | null; error: string | null }> {
  if (focusProjectId && UUID_RE.test(focusProjectId.trim())) {
    const { data: focusRow, error: focusErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', focusProjectId.trim())
      .maybeSingle();
    if (focusErr) {
      return { template: null, error: focusErr.message };
    }
    if (focusRow && serviceMatches(focusRow as ProjectRow, service)) {
      return { template: focusRow as ProjectRow, error: null };
    }
  }

  const { data: cand, error: candErr } = await supabase
    .from('projects')
    .select('*')
    .or(DRAFT_OR_NULL_STATUS)
    .not('slug', 'is', null)
    .neq('slug', '')
    .eq('service', service)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (candErr) {
    return { template: null, error: candErr.message };
  }
  if (!cand) {
    return {
      template: null,
      error:
        '複製元となるプロジェクトがありません。同じ業種の下書きを用意するか、template_project_id を指定してください。',
    };
  }
  return { template: cand as ProjectRow, error: null };
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function slugifyPart(s: string): string {
  const base = s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, 48) || 'lp';
}

async function uniqueSlugForInsert(
  supabase: SupabaseClient,
  base: string,
): Promise<string> {
  const stamp = Date.now().toString(36);
  let candidate = `${base}-${stamp}`;
  for (let i = 0; i < 12; i++) {
    const { data } = await supabase
      .from('projects')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${base}-${stamp}-${i}`;
  }
  return `${base}-${stamp}-${randomUUID().slice(0, 8)}`;
}

function patchRawAnswersKeyword(rawAnswers: unknown, keyword: string): unknown {
  if (!Array.isArray(rawAnswers)) return rawAnswers;
  const copy = deepClone(rawAnswers) as Array<Record<string, unknown>>;
  for (const entry of copy) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.id === 'q49' && typeof keyword === 'string') {
      entry.answer = keyword;
      return copy;
    }
  }
  return copy;
}

export type ExecuteLpGenerationInput = {
  supabase: SupabaseClient;
  planId: string;
  lpGroupId: string;
  parsed: ParsedInstruction;
  themes: LpTheme[];
  templateProjectId: string | null;
  patternSummary: CommonPatternSummary | null;
  researchUsed: boolean;
};

export async function executeLpGeneration(
  input: ExecuteLpGenerationInput,
): Promise<ExecuteLpGenerationResult> {
  const {
    supabase,
    planId,
    lpGroupId,
    parsed,
    themes,
    templateProjectId,
    patternSummary,
    researchUsed,
  } = input;

  const { template, error: tmplErr } = await resolveTemplateRow(
    supabase,
    parsed.service.trim(),
    templateProjectId,
  );

  if (!template || tmplErr) {
    console.error('[agent] executeLpGeneration template', tmplErr);
    return { created: [], error: tmplErr ?? 'テンプレートが見つかりません' };
  }

  const areas =
    parsed.area.trim().length > 0
      ? [parsed.area.trim()]
      : Array.isArray(template.areas)
        ? (template.areas as string[])
        : [];

  const created: ExecuteLpGenerationResult['created'] = [];

  for (let i = 0; i < themes.length; i++) {
    const theme = themes[i];
    const keyword = theme.title;
    const rawAnswers = patchRawAnswersKeyword(
      deepClone(template.raw_answers),
      keyword,
    );
    const companyInfo = deepClone(template.company_info);

    const { mode } = selectMode({
      themeTitle: theme.title,
      keyword,
      parsed,
    });

    const agentPatch = await applyEnhancement({
      mode,
      themeTitle: theme.title,
      parsed,
      rawAnswers,
      patternSummary,
    });

    const lpUiMerged = mergeLpUiCopyForInsert(
      template.lp_ui_copy,
      agentPatch,
    );

    const areaVal =
      parsed.area.trim().length > 0
        ? parsed.area.trim()
        : typeof template.area === 'string'
          ? template.area
          : null;
    const serviceVal =
      parsed.service.trim().length > 0
        ? parsed.service.trim()
        : typeof template.service === 'string'
          ? template.service
          : null;

    const baseSlug = slugifyPart(
      [areaVal, serviceVal, keyword, String(i + 1)].filter(Boolean).join('-'),
    );
    const slug = await uniqueSlugForInsert(supabase, baseSlug);

    const intent = detectSearchIntent(keyword);

    const row: Record<string, unknown> = {
      company_name: template.company_name ?? null,
      project_type: template.project_type ?? 'local',
      status: typeof template.status === 'string' ? template.status : 'draft',
      slug,
      raw_answers: rawAnswers,
      company_info: companyInfo,
      area: areaVal,
      target_area: areaVal ?? template.target_area ?? template.area ?? null,
      areas,
      service: serviceVal,
      industry_key: template.industry_key ?? null,
      keyword,
      intent,
      wp_page_id: null,
      wp_url: null,
      publish_status: 'draft',
      published_at: null,
      lp_group_id: lpGroupId,
      variation_seed: i,
      parent_project_id: null,
      agent_plan_id: planId,
      agent_status: 'pending',
      agent_score: null,
      mode,
      research_used: researchUsed,
      lp_ui_copy: lpUiMerged,
    };

    const { data: ins, error: insErr } = await supabase
      .from('projects')
      .insert(row)
      .select('id')
      .single();

    if (insErr || !ins?.id) {
      console.error('[agent] executeLpGeneration insert', insErr?.message);
      continue;
    }
    created.push({
      id: ins.id as string,
      mode,
      agentPatch,
    });
  }

  try {
    await runFvCatchForLpGroupMembersIfNeeded(supabase, lpGroupId);
  } catch (e) {
    console.error('[agent] fv-catch after batch', e);
  }

  for (const c of created) {
    const { data: row } = await supabase
      .from('projects')
      .select('lp_ui_copy')
      .eq('id', c.id)
      .maybeSingle();
    const merged = mergeLpUiCopyAfterFv(row?.lp_ui_copy, c.agentPatch);
    const { error: upErr } = await supabase
      .from('projects')
      .update({ lp_ui_copy: merged })
      .eq('id', c.id);
    if (upErr) {
      console.error('[agent] post-fv lp_ui_copy merge', c.id, upErr.message);
    }
  }

  if (created.length === 0) {
    return { created: [], error: 'プロジェクト行の作成に失敗しました' };
  }

  return { created };
}
