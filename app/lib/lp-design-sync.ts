/**
 * projects.lp_design を、業種・ターゲット・グループ内差別化を踏まえて生成し DB 更新する。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateLpDesignRowForProject } from '@/app/lib/lp-design-layer/generate-with-gemini';
import {
  designIndustryContextBlock,
  deriveTargetProfileHint,
} from '@/app/lib/lp-design-layer/design-context';
import { loadSiblingDesignContext } from '@/app/lib/lp-design-layer/sibling-design-fingerprints';
import { rawAnswerById } from '@/app/lib/lp-design-layer/raw-answers-helpers';

type ProjectDesignRow = {
  id: string;
  service: string | null;
  industry_key: string | null;
  raw_answers: unknown;
  variation_seed: number | null;
  lp_group_id: string | null;
  lp_editor_instruction: string | null;
};

export async function syncLpDesignForProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = projectId.trim();
  if (!id) return { ok: false, error: 'project id が空です' };

  const { data: row, error: fetchErr } = await supabase
    .from('projects')
    .select(
      'id, service, industry_key, raw_answers, variation_seed, lp_group_id, lp_editor_instruction',
    )
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, error: fetchErr.message };
  }
  const p = row as ProjectDesignRow | null;
  if (!p?.id) {
    return { ok: false, error: 'プロジェクトが見つかりません' };
  }

  const instruction =
    typeof p.lp_editor_instruction === 'string'
      ? p.lp_editor_instruction.trim()
      : '';
  const service = typeof p.service === 'string' ? p.service : '';
  const q23 = rawAnswerById(p.raw_answers, 'q23').trim();

  const sibling = await loadSiblingDesignContext(
    supabase,
    p.lp_group_id,
    id,
  );

  const vs =
    typeof p.variation_seed === 'number' && Number.isFinite(p.variation_seed)
      ? Math.trunc(p.variation_seed)
      : 0;

  const industryContext = designIndustryContextBlock(p.industry_key, service);
  const targetProfileContext = deriveTargetProfileHint(instruction, q23);

  const lpDesign = await generateLpDesignRowForProject({
    instruction:
      instruction ||
      [service && `サービス: ${service}`, q23 && `お客様の不安(q23要旨): ${q23.slice(0, 200)}`]
        .filter(Boolean)
        .join('\n') ||
      '地域密着LP',
    service,
    rawAnswers: p.raw_answers,
    variationSeed: vs,
    industryContext,
    targetProfileContext,
    siblingDesignContext: sibling.summary,
    siblingTokenFingerprints: sibling.fingerprints,
  });

  const { error: updErr } = await supabase
    .from('projects')
    .update({ lp_design: lpDesign })
    .eq('id', id);

  if (updErr) {
    return { ok: false, error: updErr.message };
  }
  return { ok: true };
}
