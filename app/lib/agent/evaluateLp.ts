import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentAppealMode, EvaluateResult } from '@/app/lib/agent/types';
import { evaluateAgainstLpGroupHistory } from '@/app/lib/agent/evaluateLpGroupSimilarity';
import { loadLpGroupHistory } from '@/app/lib/agent/loadLpGroupHistory';
import { normalizeServiceName } from '@/app/lib/agent/normalize-service';
import { buildLpViewModel } from '@/app/lib/lp-template';
import { buildLpHtmlMarkup } from '@/app/lib/lpToHtmlCore';
import { resolveLpDesignLayer } from '@/app/lib/lp-design-layer/resolve';
import { parseLpUiCopy } from '@/app/lib/lp-ui-copy';
import { runLpHtmlGuards } from '@/lib/guard/lp-html-static-check';
import { stripHtmlToPlainText } from '@/lib/guard/html-text';

function normalizeKeyword(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function decideStatus(score: number, guardOk: boolean): 'ok' | 'fix' | 'ng' {
  if (!guardOk) return 'ng';
  if (score >= 80) return 'ok';
  if (score >= 45) return 'fix';
  return 'ng';
}

const AGENT_MODES: AgentAppealMode[] = [
  'price',
  'trust',
  'empathy',
  'urgency',
  'local',
];

function asAgentMode(v: unknown): AgentAppealMode | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return AGENT_MODES.includes(s as AgentAppealMode) ? (s as AgentAppealMode) : null;
}

/**
 * 保存済み行を読み、HTML ガードと簡易ヒューリスティクスで採点して DB 更新する。
 */
export async function evaluateLp(
  supabase: SupabaseClient,
  projectId: string,
  opts: { siblingKeywords: string[]; previewPageUrl?: string },
): Promise<EvaluateResult> {
  const reasons: string[] = [];

  const { data: row, error: fetchErr } = await supabase
    .from('projects')
    .select(
      'id, slug, company_name, project_type, raw_answers, company_info, area, service, industry_key, target_area, areas, keyword, intent, lp_group_id, variation_seed, hero_image_url, fv_catch_headline, fv_catch_subheadline, lp_ui_copy, mode, lp_design',
    )
    .eq('id', projectId)
    .maybeSingle();

  if (fetchErr || !row) {
    console.error('[agent] evaluateLp fetch', fetchErr?.message);
    await supabase
      .from('projects')
      .update({ agent_status: 'ng', agent_score: 0 })
      .eq('id', projectId);
    return {
      score: 0,
      status: 'ng',
      title: '',
      reasons: ['project not found'],
    };
  }

  const proj = row as {
    id: string;
    slug: string | null;
    company_name: string | null;
    project_type: string | null;
    raw_answers: unknown;
    company_info: unknown;
    area?: string | null;
    service?: string | null;
    target_area?: string | null;
    areas?: string[] | null;
    keyword?: string | null;
    intent?: string | null;
    lp_group_id?: string | null;
    variation_seed?: number | null;
    industry_key?: string | null;
    hero_image_url?: string | null;
    fv_catch_headline?: string | null;
    fv_catch_subheadline?: string | null;
    lp_ui_copy?: unknown;
    mode?: string | null;
    lp_design?: unknown;
  };

  try {
    const agentMode = asAgentMode(proj.mode);
    const vs =
      typeof proj.variation_seed === 'number' && Number.isFinite(proj.variation_seed)
        ? Math.trunc(proj.variation_seed)
        : 0;
    const lpUiCopy = parseLpUiCopy(proj.lp_ui_copy);

    const { view, company } = buildLpViewModel(proj.raw_answers, {
      projectType: proj.project_type,
      fallbackName: proj.company_name ?? undefined,
      companyInfoRaw: proj.company_info,
      areaOverride: proj.area ?? undefined,
      targetArea: proj.target_area ?? undefined,
      areasList: proj.areas ?? undefined,
      serviceOverride: proj.service ?? undefined,
      keywordOverride: proj.keyword ?? undefined,
      industryKey: proj.industry_key ?? null,
      relatedLinks: [],
      projectStableId: proj.id,
      lpGroupId: proj.lp_group_id ?? undefined,
      variationSeed: vs,
      fvCatchHeadline: proj.fv_catch_headline ?? null,
      fvCatchSubheadline: proj.fv_catch_subheadline ?? null,
      lpUiCopy,
    });

    const diagnosisModeTitle =
      view.diagnosisMode === 'diagnosis'
        ? '3つ当てはまったら早めの診断をおすすめします'
        : 'まずは無料相談からはじめませんか？';

    const pageUrl =
      opts.previewPageUrl?.trim() ||
      (typeof proj.slug === 'string' && proj.slug
        ? `https://example.com/p/${proj.slug}`
        : undefined);

    const designLayer = resolveLpDesignLayer({
      lpDesignJson: proj.lp_design,
      variationSeed: vs,
    });

    const { bodyInner } = buildLpHtmlMarkup({
      view,
      company,
      projectType: proj.project_type,
      diagnosisModeTitle,
      pageUrl,
      template: 'cv',
      templateSeed: vs,
      heroImageUrl: proj.hero_image_url ?? null,
      uiCopy: lpUiCopy,
      designLayer,
    });

    const guard = runLpHtmlGuards(bodyInner);
    if (!guard.ok) {
      for (const f of guard.findings) {
        if (f.severity === 'error') reasons.push(f.message);
      }
    }

    let score = 100;
    const plain = stripHtmlToPlainText(bodyInner, 40_000);

    const expectedArea = (proj.area ?? proj.target_area ?? '').trim();
    if (expectedArea && expectedArea !== '地域') {
      const inBody =
        plain.includes(expectedArea) ||
        (expectedArea.length >= 2 && plain.includes(expectedArea.slice(0, 3)));
      if (!inBody) {
        score -= 20;
        reasons.push('本文と地域の整合が弱い可能性');
      }
    }

    const kw = (proj.keyword ?? '').trim();
    const kn = normalizeKeyword(kw);
    const hl = (view.headline ?? '').trim();
    if (kn.length > 0) {
      const dup = opts.siblingKeywords.filter(
        (x) => normalizeKeyword(x) === kn,
      ).length;
      if (dup > 1) {
        score -= 25;
        reasons.push('同一バッチ内でキーワードが重複');
      }
    }

    let similarityWarnings: EvaluateResult['similarityWarnings'] = undefined;
    const serviceNorm = normalizeServiceName(proj.service ?? '');
    const areaKey = (proj.area ?? proj.target_area ?? '').trim();
    if (serviceNorm && areaKey) {
      try {
        const rawHistory = await loadLpGroupHistory(supabase, {
          parentProjectId: proj.id,
          service: serviceNorm,
          area: areaKey,
          limit: 40,
        });
        const peers = rawHistory.filter((h) => h.id !== proj.id).slice(0, 30);
        if (peers.length > 0) {
          const sim = evaluateAgainstLpGroupHistory(
            {
              projectId: proj.id,
              headline: hl,
              keyword: kw,
              mode: typeof proj.mode === 'string' ? proj.mode.trim() || null : null,
            },
            peers,
          );
          if (sim.penalty > 0) {
            score -= sim.penalty;
            for (const r of sim.reasons) {
              if (!reasons.includes(r)) reasons.push(r);
            }
            similarityWarnings =
              sim.similarityWarnings.length > 0
                ? sim.similarityWarnings
                : undefined;
          }
        }
      } catch (e) {
        console.error('[agent] evaluateLp group similarity', e);
      }
    }
    if (hl.length > 0 && hl.length < 8) {
      score -= 8;
      reasons.push('主見出しが短すぎる');
    }
    if (hl.length > 72) {
      score -= 5;
      reasons.push('主見出しが長すぎる');
    }

    const polite = (plain.match(/です|ます/g) ?? []).length;
    const density = polite / Math.max(1, plain.length / 120);
    if (plain.length > 400 && density < 0.35) {
      score -= 12;
      reasons.push('敬体（です・ます）の比率が低め');
    }

    if (plain.length < 500) {
      score -= 14;
      reasons.push('本文テキスト量が少なめ');
    }

    const hiraganaCount = (plain.match(/[\u3040-\u309f]/g) ?? []).length;
    if (plain.length > 250 && hiraganaCount / plain.length < 0.015) {
      score -= 10;
      reasons.push('日本語として平仮名比率が低め');
    }

    const brokenRepeat = /(.)\1{5,}/.test(plain);
    if (brokenRepeat) {
      score -= 8;
      reasons.push('同一文字の連続が目立つ');
    }

    for (const f of guard.findings) {
      if (f.severity === 'warning') {
        score -= 4;
      }
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    if (!guard.ok) {
      score = Math.min(score, 44);
    }
    const status = decideStatus(score, guard.ok);

    await supabase
      .from('projects')
      .update({ agent_score: score, agent_status: status })
      .eq('id', projectId);

    const title = (proj.keyword ?? '').trim() || hl || '(無題)';

    return {
      score,
      status,
      title,
      reasons,
      ...(similarityWarnings != null && similarityWarnings.length > 0
        ? { similarityWarnings }
        : {}),
    };
  } catch (e) {
    console.error('[agent] evaluateLp', e);
    await supabase
      .from('projects')
      .update({ agent_status: 'ng', agent_score: 0 })
      .eq('id', projectId);
    return {
      score: 0,
      status: 'ng',
      title: (proj.keyword ?? '').toString(),
      reasons: ['evaluation threw'],
    };
  }
}
