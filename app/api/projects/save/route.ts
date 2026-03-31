import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { detectSearchIntent } from '@/app/lib/intent';
import { splitProjectsByAreaAndService } from '@/app/lib/projectSplit';
import { runFvCatchForLpGroupMembersIfNeeded } from '@/app/lib/fv-catch-generation';
import { normalizeServiceName } from '@/app/lib/agent/normalize-service';
import { assertIndustryKeyAllowedForLocalSave } from '@/app/lib/service-persona/save-gate';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveLpGroupId(
  bodyVal: string | null | undefined,
  existingVal: string | null | undefined,
): string {
  const b = typeof bodyVal === 'string' ? bodyVal.trim() : '';
  if (UUID_RE.test(b)) return b;
  const e = typeof existingVal === 'string' ? existingVal.trim() : '';
  if (UUID_RE.test(e)) return e;
  return randomUUID();
}

function isPublishedOnSite(row: { publish_status?: string | null } | null): boolean {
  const s = typeof row?.publish_status === 'string' ? row.publish_status.trim() : '';
  return s === 'published';
}

type SaveProjectPayload = {
  project_type?: string | null;
  status?: string | null;
  company_name?: string | null;
  resolved_area?: string | null;
  areas?: string[] | null;
  service?: string | null;
  /** 業種バケット（任意）。関連LPの industry_key 一致に使う */
  industry_key?: string | null;
  keyword?: string | null;
  raw_answers?: unknown;
  company_info?: unknown;
  slug?: string | null;
  lp_group_id?: string | null;
  /** 行ごとの edition（決定的バリエーション seed）。未送時は 0 */
  variation_seed?: number | null;
  /** LP生成: 訴求・デザイン意図（service/raw_answers の業種ファクトを置き換えない） */
  lp_editor_instruction?: string | null;
};

function normalizeIndustryKey(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function normalizeLpEditorInstruction(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function rawAnswerById(rawAnswers: unknown, qid: string): string {
  if (!Array.isArray(rawAnswers)) return '';
  for (const entry of rawAnswers) {
    if (!entry || typeof entry !== 'object') continue;
    const o = entry as Record<string, unknown>;
    if (o.id !== qid) continue;
    if (typeof o.answer === 'string') return o.answer.trim();
    if (o.answer != null) return String(o.answer).trim();
  }
  return '';
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveProjectPayload;

    const projectType = body.project_type ?? 'local';
    const status = body.status ?? 'draft';
    const companyName =
      (body.company_name ?? '').trim() || '新規プロジェクト（実店舗）';
    const resolvedArea =
      typeof body.resolved_area === 'string' && body.resolved_area.trim().length > 0
        ? body.resolved_area.trim()
        : null;
    const areas = Array.isArray(body.areas) ? body.areas : [];
    const serviceNorm = normalizeServiceName(
      typeof body.service === 'string' ? body.service : '',
    );
    const service = serviceNorm.length > 0 ? serviceNorm : null;
    const keyword =
      typeof body.keyword === 'string' && body.keyword.trim().length > 0
        ? body.keyword.trim()
        : null;
    const industryKey = normalizeIndustryKey(body.industry_key);
    const rawAnswers = body.raw_answers ?? [];
    const companyInfo = body.company_info ?? {};
    const lpEditorInstruction = normalizeLpEditorInstruction(
      body.lp_editor_instruction,
    );

    const baseSlug =
      typeof body.slug === 'string' && body.slug.trim().length > 0
        ? body.slug.trim()
        : null;
    const slug =
      baseSlug ||
      `temp-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    const supabase = createSupabaseAdminClient();

    const personaGate = await assertIndustryKeyAllowedForLocalSave(
      supabase,
      projectType,
      industryKey,
    );
    if (personaGate.ok === false) {
      return NextResponse.json(
        { success: false, error: personaGate.error },
        { status: 400 },
      );
    }

    const intent = keyword ? detectSearchIntent(keyword) : null;

    /**
     * エリア×サービス直積が 2 件以上かつ slug 未指定のときだけ複数行作成。
     * 明示 slug や WP 済み upsert 分岐は従来どおり 1 行パスのみ（既存挙動を壊さない）。
     */
    const areasInputStr = areas.length > 0 ? areas.join(',') : '';
    const servicesInputStr = service ?? '';
    const splits = splitProjectsByAreaAndService({
      areasInput: areasInputStr,
      servicesInput: servicesInputStr,
      fallbackArea:
        resolvedArea ||
        rawAnswerById(rawAnswers, 'q11') ||
        undefined,
      fallbackService:
        rawAnswerById(rawAnswers, 'q1') || undefined,
    });

    const useMultiRowSplit =
      projectType === 'local' && baseSlug === null && splits.length > 1;

    const lpGroupFromBody =
      typeof body.lp_group_id === 'string' ? body.lp_group_id : null;

    const variationSeedRaw = body.variation_seed;
    const variationSeed =
      typeof variationSeedRaw === 'number' && Number.isFinite(variationSeedRaw)
        ? Math.trunc(variationSeedRaw)
        : 0;

    /*
     * 任意拡張: publish_history（project_id / lp_group_id, slug, published_at, content_hash）
     * を別テーブル or JSON 列で持ち、直近 N 件と content_hash が一致したらトースト警告、など。
     */

    if (useMultiRowSplit) {
      const lpGroupId = resolveLpGroupId(lpGroupFromBody, null);

      const shared = {
        company_name: companyName,
        project_type: projectType,
        status,
        raw_answers: rawAnswers,
        company_info: companyInfo,
        areas,
        industry_key: industryKey,
        wp_page_id: null,
        wp_url: null,
        publish_status: 'draft' as const,
        published_at: null as string | null,
        lp_group_id: lpGroupId,
        variation_seed: variationSeed,
        lp_editor_instruction: lpEditorInstruction,
      };

      const first = splits[0];
      const parentRow = {
        ...shared,
        slug: first.slug,
        area: first.area,
        target_area: first.area,
        service: normalizeServiceName(first.service) || first.service,
        keyword: first.keyword,
        intent: detectSearchIntent(first.keyword),
        parent_project_id: null,
      };

      const { data: parentData, error: parentErr } = await supabase
        .from('projects')
        .insert(parentRow)
        .select('id, slug')
        .single();

      if (parentErr || !parentData) {
        return NextResponse.json(
          {
            success: false,
            error: parentErr?.message ?? '親プロジェクトの作成に失敗しました',
            details: parentErr?.details,
            hint: (parentErr as any)?.hint,
          },
          { status: 500 },
        );
      }

      const parentId = parentData.id;

      for (let i = 1; i < splits.length; i++) {
        const sp = splits[i];
        const childRow = {
          ...shared,
          slug: sp.slug,
          area: sp.area,
          target_area: sp.area,
          service: normalizeServiceName(sp.service) || sp.service,
          keyword: sp.keyword,
          intent: detectSearchIntent(sp.keyword),
          parent_project_id: parentId,
        };
        const { error: childErr } = await supabase
          .from('projects')
          .insert(childRow);
        if (childErr) {
          await supabase
            .from('projects')
            .delete()
            .eq('parent_project_id', parentId);
          await supabase.from('projects').delete().eq('id', parentId);
          return NextResponse.json(
            {
              success: false,
              error: childErr.message,
              details: childErr.details,
              hint: (childErr as any).hint,
            },
            { status: 500 },
          );
        }
      }

      return NextResponse.json({
        success: true,
        slug: parentData.slug,
        id: parentData.id,
        splitCount: splits.length,
        lp_group_id: lpGroupId,
      });
    }

    const { data: existingRow, error: existingErr } = await supabase
      .from('projects')
      .select('id, publish_status, lp_group_id')
      .eq('slug', slug)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json(
        {
          success: false,
          error: existingErr.message,
          details: existingErr.details,
          hint: (existingErr as any).hint,
        },
        { status: 500 },
      );
    }

    const publishedOnSite = existingRow != null && isPublishedOnSite(existingRow as { publish_status?: string | null });

    const existingLpGroup =
      (existingRow as { lp_group_id?: string | null } | null)?.lp_group_id ??
      null;
    const lpGroupId = resolveLpGroupId(lpGroupFromBody, existingLpGroup);

    if (publishedOnSite && existingRow.id) {
      const updateOnly = {
        company_name: companyName,
        project_type: projectType,
        status,
        raw_answers: rawAnswers,
        company_info: companyInfo,
        area: resolvedArea,
        target_area: resolvedArea,
        areas,
        service,
        industry_key: industryKey,
        keyword,
        intent,
        lp_editor_instruction: lpEditorInstruction,
      };
      const { error, data } = await supabase
        .from('projects')
        .update(updateOnly)
        .eq('id', existingRow.id)
        .select('id, slug')
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          {
            success: false,
            error: error.message,
            details: error.details,
            hint: (error as any).hint,
          },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        slug: data?.slug ?? slug,
        id: data?.id ?? existingRow.id,
        lp_group_id: existingLpGroup,
      });
    }

    const row = {
      company_name: companyName,
      project_type: projectType,
      status,
      slug,
      raw_answers: rawAnswers,
      company_info: companyInfo,
      area: resolvedArea,
      target_area: resolvedArea,
      areas,
      service,
      industry_key: industryKey,
      keyword,
      intent,
      wp_page_id: null,
      wp_url: null,
      publish_status: 'draft',
      published_at: null,
      lp_group_id: lpGroupId,
      variation_seed: variationSeed,
      lp_editor_instruction: lpEditorInstruction,
    };

    const { error, data } = await supabase
      .from('projects')
      .upsert(row, { onConflict: 'slug' })
      .select('id, slug')
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          details: error.details,
          hint: (error as any).hint,
        },
        { status: 500 },
      );
    }

    try {
      await runFvCatchForLpGroupMembersIfNeeded(supabase, lpGroupId);
    } catch (e) {
      console.error('[projects/save] auto fv-catch', e);
    }

    return NextResponse.json({
      success: true,
      slug: data?.slug ?? slug,
      id: data?.id ?? null,
      lp_group_id: lpGroupId,
    });
  } catch (err) {
    const anyErr = err as any;
    return NextResponse.json(
      {
        success: false,
        error: anyErr?.message || 'Unknown error',
        details: anyErr?.details,
      },
      { status: 500 },
    );
  }
}

