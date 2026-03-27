import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { publishProjectToNextSite } from '@/app/lib/publish-project-next';

const ALLOWED_POST_COUNTS = new Set([1, 3, 5, 10]);

/** publish-candidates の候補条件と揃える（draft または NULL、未公開、slug あり） */
const DRAFT_OR_NULL_STATUS =
  'publish_status.eq.draft,publish_status.is.null';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProjectRow = Record<string, unknown>;

function makeTempSlug(suffix: string): string {
  return `temp-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}${suffix}`;
}

function serviceMatches(row: ProjectRow, service: string): boolean {
  const s = row.service;
  return typeof s === 'string' && s.trim() === service;
}

/** テンプレ決定: focus → なければ候補先頭のフル行 */
async function resolveTemplateRow(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
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
        '複製元となるプロジェクトがありません。同じ業種の下書き・未公開行を1件以上用意するか、フォーカス行を指定してください。',
    };
  }
  return { template: cand as ProjectRow, error: null };
}

async function fetchCandidateIdSlugs(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  service: string,
): Promise<{ id: string; slug: string }[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug')
    .or(DRAFT_OR_NULL_STATUS)
    .not('slug', 'is', null)
    .neq('slug', '')
    .eq('service', service)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  const out: { id: string; slug: string }[] = [];
  for (const r of data) {
    const row = r as { id?: string; slug?: string };
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
    if (id && slug) out.push({ id, slug });
  }
  return out;
}

function buildInsertFromTemplate(
  template: ProjectRow,
  slug: string,
  variationSeed: number,
): Record<string, unknown> {
  const areas = Array.isArray(template.areas) ? template.areas : [];
  const baseStatus =
    typeof template.status === 'string' ? template.status : 'draft';

  return {
    company_name: template.company_name ?? null,
    project_type: template.project_type ?? 'local',
    status: baseStatus,
    slug,
    raw_answers: template.raw_answers ?? [],
    company_info: template.company_info ?? {},
    area: template.area ?? null,
    target_area: template.target_area ?? template.area ?? null,
    areas,
    service: template.service ?? null,
    keyword: template.keyword ?? null,
    intent: template.intent ?? null,
    wp_page_id: null,
    wp_url: null,
    publish_status: 'draft',
    published_at: null,
    lp_group_id: template.lp_group_id ?? null,
    variation_seed: variationSeed,
    parent_project_id: template.parent_project_id ?? null,
  };
}

type PlanResult = {
  ok: boolean;
  service: string;
  postCount: number;
  /** DB 上の下書き・未公開候補の総数 */
  existingCandidateCount: number;
  clonesToCreate: number;
  willPublish: number;
  canProceed: boolean;
  firstSlug: string | null;
  previewTargets: { id: string; slug: string }[];
  error?: string;
};

async function computePlan(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  service: string,
  postCount: number,
  focusProjectId: string | null,
): Promise<PlanResult> {
  const candidates = await fetchCandidateIdSlugs(supabase, service);
  const existingCandidateCount = candidates.length;

  if (existingCandidateCount >= postCount) {
    const slice = candidates.slice(0, postCount);
    return {
      ok: true,
      service,
      postCount,
      existingCandidateCount,
      clonesToCreate: 0,
      willPublish: postCount,
      canProceed: true,
      firstSlug: slice[0]?.slug ?? null,
      previewTargets: slice,
    };
  }

  const { template, error } = await resolveTemplateRow(
    supabase,
    service,
    focusProjectId,
  );
  if (!template || error) {
    return {
      ok: false,
      service,
      postCount,
      existingCandidateCount,
      clonesToCreate: postCount - existingCandidateCount,
      willPublish: 0,
      canProceed: false,
      firstSlug: candidates[0]?.slug ?? null,
      previewTargets: candidates,
      error: error ?? 'テンプレート行を解決できませんでした。',
    };
  }

  const shortfall = postCount - existingCandidateCount;
  return {
    ok: true,
    service,
    postCount,
    existingCandidateCount,
    clonesToCreate: shortfall,
    willPublish: postCount,
    canProceed: true,
    firstSlug: candidates[0]?.slug ?? null,
    previewTargets: candidates.slice(0, Math.min(candidates.length, postCount)),
  };
}

/**
 * GET: プレビュー用（INSERT なし）。clone 件数・実行可否を返す。
 * POST: 不足分を INSERT したうえで N 件を順に Next 公開（DB の publish_status + wp_url を更新）。
 */
export async function GET(request: Request) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: '認可に失敗しました。/admin/login でセッションを開始してください。',
      },
      { status: 401 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const service = (searchParams.get('service') ?? '').trim();
    const postCountParam = parseInt(searchParams.get('postCount') ?? '1', 10);
    const postCount = ALLOWED_POST_COUNTS.has(postCountParam)
      ? postCountParam
      : 1;
    const focusRaw = (searchParams.get('focusProjectId') ?? '').trim();
    const focusProjectId = focusRaw.length > 0 ? focusRaw : null;

    if (!service) {
      return NextResponse.json(
        { ok: false, error: 'service を指定してください。' },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const plan = await computePlan(supabase, service, postCount, focusProjectId);
    return NextResponse.json(plan);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '不明なエラー';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: '認可に失敗しました。/admin/login でセッションを開始してください。',
      },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      service?: string;
      postCount?: number;
      focusProjectId?: string | null;
    };

    const service = typeof body.service === 'string' ? body.service.trim() : '';
    const postCountParam = parseInt(String(body.postCount ?? 1), 10);
    const postCount = ALLOWED_POST_COUNTS.has(postCountParam)
      ? postCountParam
      : 1;
    const focusProjectId =
      typeof body.focusProjectId === 'string' &&
      body.focusProjectId.trim().length > 0
        ? body.focusProjectId.trim()
        : null;

    if (!service) {
      return NextResponse.json(
        { ok: false, error: 'service が必要です。' },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const candidates = await fetchCandidateIdSlugs(supabase, service);

    let targets: { id: string; slug: string }[];
    let createdCount = 0;

    if (candidates.length >= postCount) {
      targets = candidates.slice(0, postCount);
    } else {
      const { template, error } = await resolveTemplateRow(
        supabase,
        service,
        focusProjectId,
      );
      if (!template || error) {
        return NextResponse.json(
          { ok: false, error: error ?? 'テンプレートを解決できませんでした。' },
          { status: 400 },
        );
      }

      const shortfall = postCount - candidates.length;
      const baseVs =
        typeof template.variation_seed === 'number' &&
        Number.isFinite(template.variation_seed)
          ? Math.trunc(template.variation_seed as number)
          : 0;

      const newRows: { id: string; slug: string }[] = [];
      for (let i = 0; i < shortfall; i++) {
        const slug = makeTempSlug(String(i));
        const variationSeed = baseVs + i + 1;
        const insertRow = buildInsertFromTemplate(template, slug, variationSeed);
        const { data: inserted, error: insErr } = await supabase
          .from('projects')
          .insert(insertRow)
          .select('id, slug')
          .single();

        if (insErr || !inserted) {
          return NextResponse.json(
            {
              ok: false,
              error: insErr?.message ?? 'プロジェクト行の複製に失敗しました。',
              createdPartial: newRows.length,
            },
            { status: 500 },
          );
        }
        const ins = inserted as { id?: string; slug?: string };
        const id = typeof ins.id === 'string' ? ins.id : '';
        const s = typeof ins.slug === 'string' ? ins.slug : '';
        if (!id || !s) {
          return NextResponse.json(
            { ok: false, error: 'INSERT 結果が不正です。' },
            { status: 500 },
          );
        }
        newRows.push({ id, slug: s });
      }
      createdCount = newRows.length;
      targets = [...candidates, ...newRows];
    }

    const results: {
      slug: string;
      success: boolean;
      url?: string;
      error?: string;
      dbUpdateWarning?: string;
    }[] = [];

    // 複数 LP は 1 件ずつ await（並列にしない。Vercel 時間制限・API 負荷対策）
    for (const t of targets) {
      const pub = await publishProjectToNextSite(supabase, t.slug, {
        projectId: t.id,
      });
      if (pub.success === true) {
        results.push({
          slug: pub.slug,
          success: true,
          url: pub.url,
          dbUpdateWarning: pub.dbUpdateWarning,
        });
      } else {
        results.push({
          slug: t.slug,
          success: false,
          error: pub.error,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      createdCount,
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '不明なエラー';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
