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

/** agent / planLpThemes 向けの候補1件 */
export type KeywordResearchCandidate = {
  keyword: string;
  intent?: string | null;
  note?: string | null;
};

export type LpGroupKeywordResearchInput = {
  areaKey: string;
  service: string;
  industryKeyRaw: string | null;
  industryTone: LpIndustryTone;
  industryDescription: string;
  /** 同一 parent×service×area の既存LP由来（keyword / title） */
  lpGroupAvoidKeywords: string[];
  /** keyword_research_run 等・同エリア×サービス候補の再利用抑止用（任意） */
  extraAvoidKeywords?: string[];
  target?: string;
  appeal?: string;
  projectType?: string | null;
  maxCandidates?: number;
};

function capAvoidLines(list: string[], maxLines: number): string[] {
  return list.slice(0, maxLines);
}

function parseCandidatesFromJsonText(
  text: string,
  maxItems: number,
): KeywordResearchCandidate[] {
  let trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) trimmed = fence[1]!.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const slice = jsonMatch ? jsonMatch[0] : trimmed;
  try {
    const parsed = JSON.parse(slice) as { candidates?: unknown; keywords?: unknown };
    if (Array.isArray(parsed.candidates)) {
      const out: KeywordResearchCandidate[] = [];
      for (const c of parsed.candidates) {
        if (out.length >= maxItems) break;
        if (!c || typeof c !== 'object') continue;
        const o = c as Record<string, unknown>;
        const kw = typeof o.keyword === 'string' ? o.keyword.trim() : '';
        if (!kw) continue;
        const intent =
          typeof o.intent === 'string' && o.intent.trim() ? o.intent.trim() : null;
        const note =
          typeof o.note === 'string' && o.note.trim() ? o.note.trim() : null;
        out.push({
          keyword: kw.slice(0, 200),
          intent,
          note,
        });
      }
      if (out.length > 0) return out;
    }
    const kws = parseKeywordsFromJsonText(text, maxItems);
    return kws.map((keyword) => ({ keyword }));
  } catch {
    return [];
  }
}

function normKeyword(s: string): string {
  return s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * 同一LPグループの avoid に明確に被る候補だけ落とす（Gemini へ渡す直前用）。
 */
export function filterKeywordCandidatesForLpGroup(
  candidates: KeywordResearchCandidate[],
  lpGroupAvoidKeywords: string[],
  maxItems?: number,
): KeywordResearchCandidate[] {
  const avoid = new Set<string>();
  for (const a of lpGroupAvoidKeywords) {
    const n = normKeyword(a);
    if (n.length >= 2) avoid.add(n);
  }
  const cap = maxItems ?? 18;
  const out: KeywordResearchCandidate[] = [];
  for (const c of candidates) {
    if (out.length >= cap) break;
    const t = normKeyword(c.keyword);
    if (!t) continue;
    let drop = false;
    if (avoid.has(t)) drop = true;
    if (!drop) {
      for (const a of avoid) {
        if (
          a.length >= 8 &&
          t.length >= 8 &&
          (t.includes(a) || a.includes(t))
        ) {
          drop = true;
          break;
        }
      }
    }
    if (!drop) out.push(c);
  }
  return out;
}

/**
 * 同一LPグループ向け: 既存 avoid を踏まえ、未使用で需要がありそうなロングテール候補を Perplexity で取得。
 * API キー未設定・失敗時は { candidates: [] }（呼び出し側でフォールバック）。
 */
export async function fetchLpGroupKeywordCandidates(
  input: LpGroupKeywordResearchInput,
): Promise<{ candidates: KeywordResearchCandidate[]; rawText?: string }> {
  const max = Math.min(18, Math.max(5, input.maxCandidates ?? 14));
  const lpCap = capAvoidLines(input.lpGroupAvoidKeywords, 40);
  const extraRaw = input.extraAvoidKeywords ?? [];
  const extraCap = capAvoidLines(extraRaw, 35);

  const userPrompt = `あなたは日本のSEOリサーチャーです。次の条件だけを根拠にキーワード候補を選んでください。

【対象地域（area）】
${input.areaKey.trim()}

【サービス表記（service）】
${(input.service ?? '').trim() || '（未指定）'}

【プロジェクト種別（参考）】
${input.projectType?.trim() || 'local'}

【projects.industry_key（DBの値・そのまま）】
${input.industryKeyRaw ?? '（未設定）'}

【業種トーン（内部）】
${input.industryTone}

【業種の説明（正。この範囲外の業種語は出さない）】
${input.industryDescription}

【ターゲット補足】
${(input.target ?? '').trim() || '（なし）'}

【訴求補足】
${(input.appeal ?? '').trim() || '（なし）'}

【同一LPグループ内の既存LPで使用済みのテーマ・キーワード（必ず避ける・焼き直し禁止）】
${formatAvoidList(lpCap)}

【その他・過去のキーワード調査などで既出の語（避ける）】
${formatAvoidList(extraCap)}

## タスク
- **当エリア×当サービス**で、Google検索されそうな **未使用のロングテール・クエリ**を **${max}件程度** 提案する。
- 検索意図を分散: 比較、費用・相場、悩み・不安、手続き、地域＋具体ニーズ などを偏りなく混ぜる。
- 上記「使用済み」「既出」と**明確に同義・言い換えのみ**の語は避け、**別切り口**を優先する。
- 「安心」「丁寧」など抽象的な単語だけの候補は避ける。

応答は次のJSONオブジェクトのみ（前後に説明やマークダウンを付けない）:
{"candidates":[{"keyword":"検索クエリ想定の日本語","intent":"比較|費用|悩み|地域|手続き|その他 のいずれか短く","note":"任意1行メモ"}]}`;

  const chat = await perplexityChatCompletion({
    system:
      'You output only valid JSON when asked. Top-level key: candidates (array of objects). Each object: keyword (string, required), intent (string optional), note (string optional). Japanese text for keyword/intent/note. No markdown.',
    user: userPrompt,
    temperature: 0.28,
    max_tokens: 1600,
  });

  if (chat.ok === false) {
    console.error(
      '[perplexity-keyword-research] fetchLpGroupKeywordCandidates',
      chat.status,
      chat.errorText,
    );
    return { candidates: [], rawText: chat.errorText };
  }

  const candidates = parseCandidatesFromJsonText(chat.content, max);
  return { candidates, rawText: chat.content.slice(0, 6000) };
}
