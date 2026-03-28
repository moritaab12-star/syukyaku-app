/**
 * Perplexity（オンライン検索付き）で、業種・サービスに紐づく検索需要キーワードを取得する。
 */

import {
  parseKeywordsFromJsonText,
  perplexityChatCompletion,
} from '@/app/lib/perplexity-api';

export type SeoDemandResearchResult = {
  keywords: string[];
  rawText?: string;
};

/**
 * 業種ラベルとサービス名から、Google 検索で想定される悩み・比較・トレンドを 5〜10 件程度取得。
 */
export async function fetchSeoDemandKeywords(opts: {
  industryLabel: string;
  service: string;
}): Promise<SeoDemandResearchResult> {
  const userPrompt = `あなたは日本のSEOリサーチャーです。

業種の文脈: 「${opts.industryLabel}」
サービス内容: 「${opts.service}」

上記に関連して、ターゲットがGoogle検索で実際に入力しそうな「悩み」「比較」「費用・相場」「期限・手続き」「地域＋サービス」などのキーワードや短いフレーズを、5〜10個ピックアップしてください。
植木屋なら剪定の料金・時期、空き家の庭、高木の伐採など。火災保険なら申請期限・手数料・鑑定・水災など、業種に即した具体語を含めてください。

応答は次のJSONオブジェクトのみ（前後に説明文を付けない）:
{"keywords": ["...", "...", ...]}`;

  const chat = await perplexityChatCompletion({
    system:
      'You output only valid JSON when asked. Use Japanese for keyword strings.',
    user: userPrompt,
    temperature: 0.2,
    max_tokens: 1200,
  });

  if (chat.ok === false) {
    console.error(
      '[perplexity-seo-research] API error',
      chat.status,
      chat.errorText,
    );
    return { keywords: [], rawText: chat.errorText };
  }

  const keywords = parseKeywordsFromJsonText(chat.content, 12);
  return {
    keywords,
    rawText: chat.content.slice(0, 4000),
  };
}
