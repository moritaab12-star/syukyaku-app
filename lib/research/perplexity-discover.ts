/**
 * Perplexity（オンライン検索）で参照 LP 候補 URL を列挙。
 * SEO キーワード取得（perplexity-seo-research）とは役割分担: こちらは **URL 列挙のみ**。
 */

import { perplexityChatCompletion } from '@/app/lib/perplexity-api';
import { parseUrlsFromAssistantText } from './parse-urls-json';

export type LpUrlDiscoverResult =
  | { ok: true; urls: string[]; raw_snippet: string }
  | { ok: false; status: number; errorText: string };

export async function discoverLpUrlsWithPerplexity(opts: {
  queries: string[];
  industryLabel: string;
  maxUrls?: number;
}): Promise<LpUrlDiscoverResult> {
  const list = opts.queries
    .map((q, i) => `${i + 1}. ${q}`)
    .join('\n');

  const user = `あなたは日本のマーケティングリサーチャーです。

対象業種のラベル: 「${opts.industryLabel}」

次の検索意図の一覧に沿って、実在する Web ページの URL を集めてください。

【クエリ一覧】
${list}

【厳守】
- 日本の事業者の公式サイト上のページ（ランディング、サービス紹介、お問い合わせ導線付き）を優先。
- ブログ記事単体、ニュース一覧のみ、IR・採用のみ、SNS・動画サイト、Google/Bing の検索結果ページは除外。
- URL は実在する https のみ。推測で URL を作らない。
- 応答は **JSON のみ**（前後に説明禁止）:
{"urls":["https://...","https://..."]}
- 重複なし、最大 ${opts.maxUrls ?? 20} 件。`;

  const chat = await perplexityChatCompletion({
    system:
      'You return only valid JSON with key "urls" (string array). Japanese context.',
    user,
    temperature: 0.15,
    max_tokens: 2000,
  });

  if (chat.ok === false) {
    return {
      ok: false,
      status: chat.status,
      errorText: chat.errorText,
    };
  }

  const urls = parseUrlsFromAssistantText(
    chat.content,
    opts.maxUrls ?? 20,
  );
  return {
    ok: true,
    urls,
    raw_snippet: chat.content.slice(0, 1500),
  };
}
