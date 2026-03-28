/**
 * Gemini で raw_answers 1項目分の文面を生成（Perplexity で得た検索需要をコンテキストに注入）。
 */

import type { RawAnswerSuggestInput } from '@/app/lib/raw-answer-suggest';
import {
  buildOtherAnswersContextSnippet,
  normalizeContext,
} from '@/app/lib/raw-answer-suggest';

const DEFAULT_MODEL =
  process.env.GEMINI_LP_MODEL?.trim() || 'gemini-1.5-flash';

export type GeminiLpAnswerInput = RawAnswerSuggestInput & {
  /** Perplexity 由来の検索需要（空でも可） */
  seoKeywords: string[];
  /** lp-industry の説明文 */
  industryDescription: string;
};

function buildPrompt(input: GeminiLpAnswerInput): string {
  const { area, service } = normalizeContext(input.area, input.service);
  const snippet = buildOtherAnswersContextSnippet(
    input.questionId,
    input.otherAnswers,
  );

  const kwBlock =
    input.seoKeywords.length > 0
      ? input.seoKeywords.map((k, i) => `${i + 1}. ${k}`).join('\n')
      : '（検索キーワードの取得に失敗したため、業種・サービス名から想定する検索ニーズを補完してください）';

  return `あなたはSEOとCVRに強いランディングページのライターです。地域密着の中小事業者向け「アンケート回答」の1項目だけを書いてください。

【地域】${area}
【サービス内容】${service}
【業種の文脈】${input.industryDescription}

【設問の意図】
設問ラベル（そのまま出力に使わない）: ${input.questionLabel}

【以下のキーワードやユーザーの悩みを解決するような構成と文言にしてください】
${kwBlock}

【同じプロジェクトの他回答からの短い抜粋（重複を避け、自然に織り込む）】
${snippet || '（なし）'}

【ルール】
- 日本語のみ。2〜6文程度。口調は親しみやすく具体的。
- 設問ラベル（見出し）を本文にそのまま書かない。
- 上記キーワードを無理に全部は入れず、自然に2〜4個程度を反映する。
- 精神論だけにせず、検索者が知りたいこと（料金感・手続き・不安解消など）に触れる。
- 出力は回答本文のみ（前置き・箇条書き記号・JSON禁止）。`;
}

export async function generateRawAnswerWithGemini(
  input: GeminiLpAnswerInput,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const prompt = buildPrompt(input);
  const model = DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.65,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('[gemini-lp-answer] generateContent failed', res.status, errBody.slice(0, 500));
    return null;
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  if (!text) return null;
  return text.replace(/^["「]|["」]$/g, '').trim();
}
