import type { SupabaseClient } from '@supabase/supabase-js';
import { buildLpViewModel } from '@/app/lib/lp-template';
import { fetchRelatedProjectRows, buildAnchorTitle, type RelatedLink } from '@/app/lib/related-links';
import { buildPublicLpUrl } from '@/app/lib/seo-indexing';
import { validateLpQuality } from '@/app/lib/agent/validateLpQuality';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

export type PublishProjectNextResult =
  | {
      success: true;
      url: string;
      slug: string;
      dbUpdateWarning?: string;
    }
  | { success: false; error: string; httpStatus: number };

/**
 * 1件のプロジェクトを「Next 上で公開済み」にマークする（WP は使わない）。
 * 公開 URL は `buildPublicLpUrl(slug)`（`/p/{slug}/`）。
 */
export async function publishProjectToNextSite(
  supabase: SupabaseClient,
  slugOrId: string,
  options?: { projectId?: string | null },
): Promise<PublishProjectNextResult> {
  const explicitId = (options?.projectId ?? '').trim();
  const slugOrIdTrim = slugOrId.trim();

  const selectCols =
    'id, slug, company_name, project_type, raw_answers, company_info, area, service, industry_key, target_area, areas, keyword, intent, lp_group_id, variation_seed, lp_ui_copy, fv_catch_headline, fv_catch_subheadline, mode';

  let q = supabase.from('projects').select(selectCols);

  if (explicitId && isUuid(explicitId)) {
    q = q.eq('id', explicitId);
  } else if (isUuid(slugOrIdTrim)) {
    q = q.eq('id', slugOrIdTrim);
  } else if (slugOrIdTrim) {
    q = q.eq('slug', slugOrIdTrim);
  } else {
    return {
      success: false,
      error: 'slug または projectId（UUID）を指定してください。',
      httpStatus: 400,
    };
  }

  const { data: projectData, error: projectErr } = await q.maybeSingle();

  if (projectErr) {
    console.error('[publishProjectToNextSite] query error', projectErr);
    return {
      success: false,
      error: projectErr.message || 'プロジェクトの取得に失敗しました。',
      httpStatus: 500,
    };
  }

  if (!projectData) {
    return {
      success: false,
      error: 'プロジェクトが見つかりません。',
      httpStatus: 404,
    };
  }

  const proj = projectData as {
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
    lp_ui_copy?: unknown;
    fv_catch_headline?: string | null;
    fv_catch_subheadline?: string | null;
    mode?: string | null;
  };


  const relatedRows = await fetchRelatedProjectRows(
    supabase,
    {
      id: proj.id,
      slug: proj.slug || proj.id,
      area: proj.area ?? null,
      service: proj.service ?? null,
      intent: proj.intent ?? null,
      industry_key: proj.industry_key ?? null,
    },
    { min: 3, max: 5 },
  );

  const relatedLinks: RelatedLink[] = relatedRows.map((r) => {
    const area = (
      r.area ??
      r.target_area ??
      (Array.isArray(r.areas) ? r.areas[0] : '') ??
      ''
    ).trim();
    const service = (r.service ?? '').trim();
    const intent = (typeof r.intent === 'string' ? (r.intent as any) : 'general') as any;
    const fallbackTitle = buildAnchorTitle({ area, service, intent });
    return {
      title: fallbackTitle,
      slug: r.slug,
      area: area || '{{area_name}}',
      service: service || '{{service_name}}',
      intent,
    };
  });

  const vs =
    typeof proj.variation_seed === 'number' && Number.isFinite(proj.variation_seed)
      ? Math.trunc(proj.variation_seed)
      : 0;

  const { intent } = buildLpViewModel(proj.raw_answers, {
    projectType: proj.project_type,
    fallbackName: proj.company_name ?? undefined,
    companyInfoRaw: proj.company_info,
    areaOverride: proj.area ?? undefined,
    targetArea: proj.target_area ?? undefined,
    areasList: proj.areas ?? undefined,
    serviceOverride: proj.service ?? undefined,
    keywordOverride: proj.keyword ?? undefined,
    industryKey: proj.industry_key ?? null,
    relatedLinks,
    projectStableId: proj.id,
    lpGroupId: proj.lp_group_id ?? undefined,
    variationSeed: vs,
  });

  if (typeof proj.keyword === 'string' && proj.keyword.trim().length > 0) {
    const prev = typeof proj.intent === 'string' ? proj.intent : null;
    if (prev !== intent) {
      const { error: intentUpdateError } = await supabase
        .from('projects')
        .update({ intent })
        .eq('id', proj.id);
      if (intentUpdateError) {
        console.error('[INTENT] Failed to update projects.intent', intentUpdateError);
      }
    }
  }

  const pageSlug = (proj.slug || proj.id).trim();
  if (!pageSlug) {
    return {
      success: false,
      error: 'slug が空のため公開できません。',
      httpStatus: 400,
    };
  }

  const quality = validateLpQuality(
    {
      project_type: proj.project_type,
      company_name: proj.company_name,
      service: proj.service ?? null,
      area: proj.area ?? null,
      target_area: proj.target_area ?? null,
      areas: proj.areas ?? null,
      keyword: proj.keyword ?? null,
      raw_answers: proj.raw_answers,
      company_info: proj.company_info,
      lp_ui_copy: proj.lp_ui_copy ?? null,
      fv_catch_headline: proj.fv_catch_headline ?? null,
      fv_catch_subheadline: proj.fv_catch_subheadline ?? null,
      mode: proj.mode ?? null,
      industry_key: proj.industry_key ?? null,
    },
    {
      relatedLinks,
      variationSeed: vs,
      projectStableId: proj.id,
      lpGroupId: proj.lp_group_id ?? null,
    },
  );

  if (!quality.canPublish) {
    return {
      success: false,
      error: quality.errors.join(' '),
      httpStatus: 422,
    };
  }

  const publicUrl = buildPublicLpUrl(pageSlug);

  // wp_url / wp_page_id 列名は DB レガシー（wp_url は canonical URL）。将来マイグレーションは docs/db-legacy-wordpress-columns.md
  const { error: updateError } = await supabase
    .from('projects')
    .update({
      wp_page_id: null,
      wp_url: publicUrl,
      publish_status: 'published',
      published_at: new Date().toISOString(),
      publish_retry_count: 0,
      last_publish_error: null,
      next_publish_retry_at: null,
    })
    .eq('id', proj.id);

  let dbUpdateWarning: string | undefined;
  if (updateError) {
    console.error('[NEXT PUBLISH] Failed to update projects row', updateError);
    dbUpdateWarning = '公開 URL は算出しましたが、DB の更新に失敗しました。';
  }

  return {
    success: true,
    url: publicUrl,
    slug: pageSlug,
    dbUpdateWarning,
  };
}
