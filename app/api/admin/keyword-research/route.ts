import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { verifyAdminRequest } from '@/lib/admin-auth';
import {
  lpIndustryToneDescriptionForPrompt,
  resolveLpIndustryTone,
} from '@/app/lib/lp-industry';
import { fetchDemandKeywordsWithIndustryContext } from '@/app/lib/perplexity-keyword-research';
import {
  loadAvoidKeywordsFromHistory,
  normalizeResearchService,
} from '@/app/lib/keyword-research-db';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json(
      {
        error:
          '認可に失敗しました。/admin/login でセッションを開始するか、ADMIN_API_SECRET を未設定の開発環境で利用してください。',
      },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const areaKey = typeof b.area_key === 'string' ? b.area_key.trim() : '';
  if (!areaKey) {
    return NextResponse.json({ error: 'area_key は必須です。' }, { status: 400 });
  }

  const serviceNorm = normalizeResearchService(
    typeof b.service === 'string' ? b.service : '',
  );
  const industryKey =
    typeof b.industry_key === 'string' && b.industry_key.trim()
      ? b.industry_key.trim()
      : null;
  const matrixIdRaw = typeof b.matrix_id === 'string' ? b.matrix_id.trim() : '';
  const matrixId = UUID_RE.test(matrixIdRaw) ? matrixIdRaw : null;

  let supabase: ReturnType<typeof createSupabaseAdminClient>;
  try {
    supabase = createSupabaseAdminClient();
  } catch (e) {
    console.error('[keyword-research]', e);
    return NextResponse.json(
      { error: 'Supabase サービスロールの環境変数が不足しています。' },
      { status: 500 },
    );
  }

  const avoidKeywords = await loadAvoidKeywordsFromHistory(supabase, {
    areaKey,
    service: serviceNorm,
    industryKey,
  });

  const tone = resolveLpIndustryTone(industryKey, serviceNorm);
  const industryDescription = lpIndustryToneDescriptionForPrompt(tone);

  const { keywords, rawText } = await fetchDemandKeywordsWithIndustryContext({
    areaKey,
    service: serviceNorm,
    industryKeyRaw: industryKey,
    industryTone: tone,
    industryDescription,
    avoidKeywords,
  });

  const model = process.env.PERPLEXITY_MODEL?.trim() || 'sonar';

  const insertPayload: Record<string, unknown> = {
    area_key: areaKey,
    service: serviceNorm,
    industry_key: industryKey,
    provider: 'perplexity',
    model,
    suggested_keywords: keywords,
    raw_response_json: rawText ? { preview: rawText.slice(0, 8000) } : null,
  };

  if (matrixId) {
    insertPayload.matrix_id = matrixId;
  }

  const { data: inserted, error: insErr } = await supabase
    .from('keyword_research_run')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insErr) {
    console.error('[keyword-research] insert', insErr);
    return NextResponse.json(
      {
        ok: false,
        error: insErr.message,
        suggested_keywords: keywords,
        industry_tone: tone,
        avoid_count: avoidKeywords.length,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    run_id: inserted?.id,
    suggested_keywords: keywords,
    industry_tone: tone,
    avoid_count: avoidKeywords.length,
  });
}
