import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import {
  lpIndustryToneDescriptionForPrompt,
  resolveLpIndustryTone,
} from '@/app/lib/lp-industry';
import { generateRawAnswerWithGemini } from '@/app/lib/gemini-lp-answer';
import { fetchSeoDemandKeywords } from '@/app/lib/perplexity-seo-research';
import {
  loadLatestSuggestedKeywords,
  normalizeResearchService,
} from '@/app/lib/keyword-research-db';
import { suggestRawAnswerLocal, type RawAnswerSuggestInput } from '@/app/lib/raw-answer-suggest';
import { runHeroImagePipelineForProject } from '@/app/lib/lp-hero-pipeline';

const PROJECT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GenerateBody = RawAnswerSuggestInput & {
  /** projects.industry_key（任意） */
  industryKey?: string | null;
  /**
   * クライアントが初回取得した検索キーワードを再利用する場合に渡す。
   * 1件以上あると Perplexity を再実行しない。
   */
  seoKeywords?: string[];
  /**
   * true のとき、`areaKeyForResearch`＋ service＋industryKey で keyword_research_run の最新1件だけを読む。
   * 行が無い場合のみ既存 fetchSeoDemandKeywords（追加で1回の Perplexity）にフォールバック。
   * true でキャッシュ済み seoKeywords がある場合は Perplexity も DB 参照もしない。
   */
  useKeywordResearch?: boolean;
  /** keyword_research_run のスコープ用（地域の正規化キー） */
  areaKeyForResearch?: string | null;
  /** 保存済みプロジェクトに紐づく場合、ヒーロー画像が未設定ならテキスト生成の前に生成する */
  projectId?: string | null;
  /** true のとき hero_image_url があってもヒーローを再生成（Vertex / Storage 上書き） */
  forceRegenerateHero?: boolean;
};

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

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

  const b = body as GenerateBody;
  const questionId = asString(b.questionId).trim();
  const questionLabel = asString(b.questionLabel).trim();
  const area = asString(b.area).trim() || '地域';
  const service = asString(b.service).trim() || 'サービス';

  if (!questionId || !questionLabel) {
    return NextResponse.json(
      { error: 'questionId と questionLabel は必須です。' },
      { status: 400 },
    );
  }

  const otherAnswers =
    b.otherAnswers && typeof b.otherAnswers === 'object' && !Array.isArray(b.otherAnswers)
      ? (b.otherAnswers as Record<string, string>)
      : undefined;

  const input: RawAnswerSuggestInput = {
    questionId,
    questionLabel,
    area,
    service,
    regenerate: Boolean(b.regenerate),
    variationNonce:
      typeof b.variationNonce === 'number' && Number.isFinite(b.variationNonce)
        ? Math.trunc(b.variationNonce)
        : undefined,
    otherAnswers,
  };

  const industryKey =
    typeof b.industryKey === 'string' ? b.industryKey.trim() : null;

  const rawProjectId =
    typeof b.projectId === 'string' ? b.projectId.trim() : '';
  const linkedProjectId = PROJECT_UUID_RE.test(rawProjectId)
    ? rawProjectId
    : null;
  const forceRegenerateHero = Boolean(b.forceRegenerateHero);

  const tone = resolveLpIndustryTone(industryKey, service);
  const industryDescription = lpIndustryToneDescriptionForPrompt(tone);

  let seoKeywords: string[] = [];
  const cached = Array.isArray(b.seoKeywords)
    ? b.seoKeywords.filter((k) => typeof k === 'string' && k.trim().length > 0).map((k) => k.trim())
    : null;

  // seoKeywords キャッシュあり → Perplexity / DB どちらも呼ばない。
  if (cached && cached.length > 0) {
    seoKeywords = cached.slice(0, 15);
  } else {
    // useKeywordResearch かつ DB に最新 run あり → Perplexity は呼ばない。
    // それ以外は従来どおり fetchSeoDemandKeywords で最大1回。
    let loadedFromDb = false;
    const useKr = Boolean(b.useKeywordResearch);
    const areaKr =
      typeof b.areaKeyForResearch === 'string' ? b.areaKeyForResearch.trim() : '';

    if (useKr && areaKr) {
      try {
        const supabase = createSupabaseAdminClient();
        const fromDb = await loadLatestSuggestedKeywords(supabase, {
          areaKey: areaKr,
          service: normalizeResearchService(service),
          industryKey,
        });
        if (fromDb?.length) {
          seoKeywords = fromDb.slice(0, 15);
          loadedFromDb = true;
        }
      } catch (e) {
        console.error('[api/generate] keyword_research_run read failed', e);
      }
    }

    if (!loadedFromDb) {
      try {
        const research = await fetchSeoDemandKeywords({
          industryLabel: industryDescription,
          service,
        });
        seoKeywords = research.keywords;
      } catch (e) {
        console.error('[api/generate] perplexity research failed', e);
      }
    }
  }

  if (linkedProjectId) {
    try {
      const supabaseHero = createSupabaseAdminClient();
      let needHero = forceRegenerateHero;
      if (!needHero) {
        const { data: heroRow } = await supabaseHero
          .from('projects')
          .select('hero_image_url')
          .eq('id', linkedProjectId)
          .maybeSingle();
        needHero = !heroRow?.hero_image_url?.trim();
      }
      if (needHero) {
        await runHeroImagePipelineForProject(supabaseHero, linkedProjectId);
      }
    } catch (e) {
      console.error('[api/generate] hero pipeline (non-fatal)', e);
    }
  }

  const geminiAnswer = await generateRawAnswerWithGemini({
    ...input,
    seoKeywords,
    industryDescription,
  });

  if (geminiAnswer) {
    return NextResponse.json({
      ok: true,
      answer: geminiAnswer,
      seoKeywords,
      source: 'gemini' as const,
    });
  }

  const local = suggestRawAnswerLocal(input);
  return NextResponse.json({
    ok: true,
    answer: local,
    seoKeywords,
    source: 'local' as const,
  });
}
