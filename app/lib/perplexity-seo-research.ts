/**
 * Perplexity（オンライン検索付き）で、業種・サービスに紐づく検索需要キーワードを取得する。
 */

export type SeoDemandResearchResult = {
  keywords: string[];
  rawText?: string;
};

function safeParseKeywordJson(text: string): string[] {
  let trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) trimmed = fence[1]!.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const slice = jsonMatch ? jsonMatch[0] : trimmed;
  try {
    const parsed = JSON.parse(slice) as { keywords?: unknown };
    if (!Array.isArray(parsed.keywords)) return [];
    return parsed.keywords
      .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
      .map((k) => k.trim())
      .slice(0, 12);
  } catch {
    return [];
  }
}

/**
 * 業種ラベルとサービス名から、Google 検索で想定される悩み・比較・トレンドを 5〜10 件程度取得。
 */
export async function fetchSeoDemandKeywords(opts: {
  industryLabel: string;
  service: string;
}): Promise<SeoDemandResearchResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) {
    return { keywords: [] };
  }

  const model =
    process.env.PERPLEXITY_MODEL?.trim() || 'sonar';

  const userPrompt = `あなたは日本のSEOリサーチャーです。

業種の文脈: 「${opts.industryLabel}」
サービス内容: 「${opts.service}」

上記に関連して、ターゲットがGoogle検索で実際に入力しそうな「悩み」「比較」「費用・相場」「期限・手続き」「地域＋サービス」などのキーワードや短いフレーズを、5〜10個ピックアップしてください。
植木屋なら剪定の料金・時期、空き家の庭、高木の伐採など。火災保険なら申請期限・手数料・鑑定・水災など、業種に即した具体語を含めてください。

応答は次のJSONオブジェクトのみ（前後に説明文を付けない）:
{"keywords": ["...", "...", ...]}`;

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You output only valid JSON when asked. Use Japanese for keyword strings.',
        },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1200,
    }),
  });

  const rawText =
    (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (!res.ok) {
    console.error('[perplexity-seo-research] API error', res.status, rawText);
    return { keywords: [], rawText: JSON.stringify(rawText) };
  }

  const content = extractAssistantText(rawText);
  const keywords = safeParseKeywordJson(content);
  return {
    keywords,
    rawText: content.slice(0, 4000),
  };
}

function extractAssistantText(data: Record<string, unknown> | null): string {
  if (!data || typeof data !== 'object') return '';
  const choices = data.choices as unknown;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const msg = (choices[0] as { message?: { content?: string } })?.message;
  const c = msg?.content;
  return typeof c === 'string' ? c : '';
}
