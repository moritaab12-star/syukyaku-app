/**
 * projects.lp_ui_copy（一式）と fv_catch_* の生成・更新（Supabase + Gemini）。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { rawAnswersJsonToRecord } from '@/app/admin/projects/new/questions';
import {
  lpIndustryToneDescriptionForPrompt,
  resolveLpIndustryTone,
} from '@/app/lib/lp-industry';
import { buildLpPackSurveyContext } from '@/app/lib/raw-answer-suggest';
import { generateLpUiCopyPackWithGemini } from '@/app/lib/gemini-lp-ui-copy-pack';
import { lpUiCopyHeadlineFromRow, parseLpUiCopy } from '@/app/lib/lp-ui-copy';
import { syncLpDesignForProject } from '@/app/lib/lp-design-sync';
import {
  countActiveServicePersonas,
  getActiveServicePersonaByKey,
} from '@/app/lib/service-persona/db-server';
import {
  buildServicePersonaPromptBlock,
  forbiddenPhrasesForValidation,
} from '@/app/lib/service-persona/prompt-block';

type ProjectRow = {
  id: string;
  area: string | null;
  service: string | null;
  industry_key: string | null;
  company_name: string | null;
  raw_answers: unknown;
  lp_group_id: string | null;
  variation_seed: number | null;
  fv_catch_headline: string | null;
  lp_ui_copy: unknown;
  lp_editor_instruction: string | null;
};

function asHeadlinesList(lines: string[]): string {
  if (lines.length === 0) return '（なし）';
  return lines.map((h, i) => `${i + 1}. ${h}`).join('\n');
}

export async function runFvCatchForProject(
  supabase: SupabaseClient,
  projectId: string,
  options?: { force?: boolean },
): Promise<
  | { ok: true; skipped: true }
  | { ok: true; headline: string; subheadline: string }
  | { ok: false; error: string }
> {
  const { data: row, error: fetchErr } = await supabase
    .from('projects')
    .select(
      'id, area, service, industry_key, company_name, raw_answers, lp_group_id, variation_seed, fv_catch_headline, lp_ui_copy, lp_editor_instruction',
    )
    .eq('id', projectId)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, error: fetchErr.message };
  }
  const p = row as ProjectRow | null;
  if (!p?.id) {
    return { ok: false, error: 'プロジェクトが見つかりません' };
  }

  const existingPack = parseLpUiCopy(p.lp_ui_copy);
  if (!options?.force && existingPack?.headline?.trim()) {
    return { ok: true, skipped: true };
  }

  let existingHeadlines: string[] = [];
  const gid =
    typeof p.lp_group_id === 'string' && p.lp_group_id.trim().length > 0
      ? p.lp_group_id.trim()
      : null;
  if (gid) {
    const { data: sibs, error: sibErr } = await supabase
      .from('projects')
      .select('id, fv_catch_headline, lp_ui_copy')
      .eq('lp_group_id', gid)
      .neq('id', projectId);

    if (!sibErr && Array.isArray(sibs)) {
      existingHeadlines = sibs
        .map((r) => lpUiCopyHeadlineFromRow(r as ProjectRow))
        .filter(Boolean)
        .slice(0, 12);
    }
  }

  const rawRecord = rawAnswersJsonToRecord(p.raw_answers);
  const qaContext = buildLpPackSurveyContext(rawRecord);
  const editorInstruction =
    typeof p.lp_editor_instruction === 'string'
      ? p.lp_editor_instruction.trim()
      : '';

  const area = typeof p.area === 'string' ? p.area : '';
  const service = typeof p.service === 'string' ? p.service : '';
  const ik =
    typeof p.industry_key === 'string' ? p.industry_key.trim() : '';
  const companyName =
    typeof p.company_name === 'string' ? p.company_name.trim() : '';
  const vs =
    typeof p.variation_seed === 'number' && Number.isFinite(p.variation_seed)
      ? Math.trunc(p.variation_seed)
      : 0;

  const activePersonaCount = await countActiveServicePersonas(supabase);
  if (activePersonaCount > 0 && !ik) {
    return {
      ok: false,
      error:
        '業種（業種人格）が未設定です。プロジェクトの industry_key に登録済みの service_key を設定してから再実行してください。',
    };
  }

  const persona =
    ik.length > 0 ? await getActiveServicePersonaByKey(supabase, ik) : null;
  if (ik.length > 0 && !persona) {
    return {
      ok: false,
      error:
        '登録済み・有効な業種人格が見つかりません（削除または無効化された可能性があります）。管理画面の業種JSON一覧を確認してください。',
    };
  }

  const tone = resolveLpIndustryTone(ik || null, service || 'サービス');
  let industryDescription = lpIndustryToneDescriptionForPrompt(tone);
  if (persona?.tone?.trim()) {
    industryDescription = `${industryDescription}\n【業種人格のトーン】${persona.tone.trim()}`;
  }

  const servicePersonaBlock = buildServicePersonaPromptBlock(persona);
  const servicePersonaForbiddenPhrases =
    forbiddenPhrasesForValidation(persona);

  const generated = await generateLpUiCopyPackWithGemini({
    area,
    service,
    industryKey: ik,
    industryDescription,
    companyName,
    qaContext,
    existingHeadlinesBlock: asHeadlinesList(existingHeadlines),
    variationSeed: vs,
    editorInstruction: editorInstruction || undefined,
    servicePersonaBlock: servicePersonaBlock || undefined,
    servicePersonaForbiddenPhrases:
      servicePersonaForbiddenPhrases.length > 0
        ? servicePersonaForbiddenPhrases
        : undefined,
  });

  if (!generated) {
    return {
      ok: false,
      error:
        'LPコピーパックの生成に失敗しました（GEMINI_API_KEY またはモデル応答を確認）',
    };
  }

  const headline =
    typeof generated.headline === 'string' ? generated.headline.trim() : '';
  const subheadline =
    typeof generated.subheadline === 'string'
      ? generated.subheadline.trim()
      : '';
  if (!headline || !subheadline) {
    return { ok: false, error: '生成結果に headline / subheadline がありません' };
  }

  const { error: updErr } = await supabase
    .from('projects')
    .update({
      lp_ui_copy: generated,
      fv_catch_headline: headline,
      fv_catch_subheadline: subheadline,
    })
    .eq('id', projectId);

  if (updErr) {
    return { ok: false, error: updErr.message };
  }

  try {
    const designRes = await syncLpDesignForProject(supabase, projectId);
    if (designRes.ok === false) {
      console.warn('[fv-catch] lp_design sync', projectId, designRes.error);
    }
  } catch (e) {
    console.warn('[fv-catch] lp_design sync exception', projectId, e);
  }

  return {
    ok: true,
    headline,
    subheadline,
  };
}

/** 新規保存後など: 同一 lp_group の未設定行にまとめて生成（順次・件数小想定） */
export async function runFvCatchForLpGroupMembersIfNeeded(
  supabase: SupabaseClient,
  lpGroupId: string,
): Promise<void> {
  if (!lpGroupId || !process.env.GEMINI_API_KEY?.trim()) {
    return;
  }

  const { data: rows, error } = await supabase
    .from('projects')
    .select('id, fv_catch_headline, lp_ui_copy')
    .eq('lp_group_id', lpGroupId);

  if (error || !Array.isArray(rows)) {
    console.error('[fv-catch] lp_group list failed', error?.message);
    return;
  }

  for (const r of rows) {
    const id =
      typeof (r as { id?: string }).id === 'string'
        ? (r as { id: string }).id
        : '';
    if (!id) continue;
    const hasPack = parseLpUiCopy(
      (r as { lp_ui_copy?: unknown }).lp_ui_copy,
    )?.headline?.trim();
    if (hasPack) continue;
    const res = await runFvCatchForProject(supabase, id, { force: false });
    if (res.ok === false) {
      console.error('[fv-catch] run failed', id, res.error);
    }
  }
}
