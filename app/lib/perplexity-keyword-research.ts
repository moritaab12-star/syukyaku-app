/**
 * 需要リサーチ用: エリア・業種・過去履歴を踏まえた Perplexity キーワード選定。
 */

import type { LpIndustryTone } from '@/app/lib/lp-industry';
import {
  parseKeywordsFromJsonText,
  perplexityChatCompletion,
} from '@/app/lib/perplexity-api';

export type DemandKeywordResearchInput = {
  areaKey: string;
  service: string;
  industryKeyRaw: string | null;
  industryTone: LpIndustryTone;
  industryDescription: string;
  avoidKeywords: string[];
};

function formatAvoidList(list: string[]): string {
  if (list.length === 0) return '（なし・初回）';
  return list.map((k, i) => `${i + 1}. ${k}`).join('\n');
}

/**
 * 業種を厳守し、他業種の検索語を混ぜないようプロンプトで指示する。
 */
export async function fetchDemandKeywordsWithIndustryContext(
  input: DemandKeywordResearchInput,
): Promise<{ keywords: string[]; rawText?: string }> {
  const userPrompt = `あなたは日本のSEOリサーチャーです。次の条件だけを根拠にキーワードを選んでください。

【対象地域（area）】
${input.areaKey.trim()}

【サービス表記（service）】
${(input.service ?? '').trim() || '（未指定）'}

【projects.industry_key（DBの値・そのまま）】
${input.industryKeyRaw ?? '（未設定）'}

【業種トーン（システム判定・内部キー）】
${input.industryTone}

【業種の説明（これが業種の正。ここにない業種の用語は出さない）】
${input.industryDescription}

【過去に選出済み・避ける語句（同義・細かい表記ゆれも避ける）】
${formatAvoidList(input.avoidKeywords)}

## あなたのタスク
- Google検索で、この業種の顧客が実際に打ちそうなキーワード・フレーズを **5〜15件** 提案する。
- 「悩み」「比較」「費用・相場」「手続き・期限」「地域名＋サービス」など、**検索クエリらしい語**を含める。
- **上記の業種説明に関係しない語は禁止**（例: 不動産の依頼で剪定・庭木だけ、リフォーム依頼で賃貸仲介だけ、など他業中心の語は出さない）。
- 「安心」「丁寧」など**抽象的な単独語だけ**で埋めない。
- avoid にある語の**反復・明らかな同義**は避ける。

応答は次のJSONオブジェクトのみ（前後に説明やマークダウンを付けない）:
{"keywords":["...", "..."]}`;

  const chat = await perplexityChatCompletion({
    system:
      'You output only valid JSON when asked. Keys: keywords (array of strings). Japanese only for keyword strings. No markdown.',
    user: userPrompt,
    temperature: 0.25,
    max_tokens: 1400,
  });

  if (chat.ok === false) {
    console.error(
      '[perplexity-keyword-research] API error',
      chat.status,
      chat.errorText,
    );
    return { keywords: [], rawText: chat.errorText };
  }

  const keywords = parseKeywordsFromJsonText(chat.content, 15);
  return { keywords, rawText: chat.content.slice(0, 6000) };
}
