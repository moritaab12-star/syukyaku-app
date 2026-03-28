import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import {
  lpIndustryToneDescriptionForPrompt,
  resolveLpIndustryTone,
} from '@/app/lib/lp-industry';
import { generateRawAnswerWithGemini } from '@/app/lib/gemini-lp-answer';
import { fetchSeoDemandKeywords } from '@/app/lib/perplexity-seo-research';
import { suggestRawAnswerLocal, type RawAnswerSuggestInput } from '@/app/lib/raw-answer-suggest';

type GenerateBody = RawAnswerSuggestInput & {
  /** projects.industry_key（任意） */
  industryKey?: string | null;
  /**
   * クライアントが初回取得した検索キーワードを再利用する場合に渡す。
   * 1件以上あると Perplexity を再実行しない。
   */
  seoKeywords?: string[];
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

  const tone = resolveLpIndustryTone(industryKey, service);
  const industryDescription = lpIndustryToneDescriptionForPrompt(tone);

  let seoKeywords: string[] = [];
  const cached = Array.isArray(b.seoKeywords)
    ? b.seoKeywords.filter((k) => typeof k === 'string' && k.trim().length > 0).map((k) => k.trim())
    : null;

  if (cached && cached.length > 0) {
    seoKeywords = cached.slice(0, 15);
  } else {
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
