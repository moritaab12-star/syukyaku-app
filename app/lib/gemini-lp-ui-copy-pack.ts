/**
 * LP 一式の UI コピー（FV + CTA + 悩み/診断ブロック等）を Gemini で1回生成。
 */

import type { GeminiFvCatchInput } from '@/app/lib/gemini-fv-catch';

const MODEL =
  process.env.GEMINI_LP_UI_COPY_MODEL?.trim() ||
  process.env.GEMINI_FV_CATCH_MODEL?.trim() ||
  process.env.GEMINI_LP_MODEL?.trim() ||
  'gemini-1.5-flash';

const ANGLE_FROM_SEED = ['A', 'B', 'C', 'D', 'E'] as const;

export type LpUiCopyPackInput = GeminiFvCatchInput;

export type LpUiCopyPackResult = Record<string, unknown>;

function stripJsonFence(s: string): string {
  let t = s.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  }
  return t.trim();
}

function buildPackPrompt(input: LpUiCopyPackInput): string {
  const seed = Number.isFinite(input.variationSeed)
    ? Math.trunc(input.variationSeed)
    : 0;
  const angle =
    ANGLE_FROM_SEED[((seed % 5) + 5) % 5] ?? 'A';

  const area = input.area.trim() || '（未設定）';
  const service = input.service.trim() || '（未設定）';
  const ik = input.industryKey.trim() || '（未設定）';
  const idesc = input.industryDescription.trim() || '（未設定）';
  const cn = input.companyName.trim();
  const qa = input.qaContext.trim() || '（未入力）';
  const existing = input.existingHeadlinesBlock.trim() || '（なし）';

  return `あなたは日本の地域密着ランディングページのコピーライターです。
【このプロジェクト専用】に、以下のキーをすべて満たす **1つのJSONオブジェクト** を返してください。

【メタ情報】
- 地域（多用しない。各フィールドで重複させない）: ${area}
- サービス・業種の要約: ${service}
- 業種キー: ${ik}
- 業種の文脈・トーン説明: ${idesc}
- 会社・屋号（短く。未入力なら無理に入れない）: ${cn || '（なし）'}

【訴求角度（内部のみ。出力に書かない）】
- variation_seed: ${seed}
- 割当角度コード「${angle}」のみを全体のトーンに反映:
  (A)手順 (B)不安先回り (C)人柄・対話 (D)地域・現場（地名連発禁止） (E)誠実・見積/追加費用

【アンケート要約（事実優先。ない事実は書かない）】
${qa}

【同一グループの既存 headline（似せない）】
${existing}

【ルール】
1. 出力は **有効なJSONのみ**（前後に説明禁止）。
2. headline: 全角18〜28文字目安。subheadline: 2〜3文・ですます。
3. CTAは押し売り感が強すぎない。電話版・Web版で文言を変える。
4. problems_bullets / diagnosis_check_items は **文字列ちょうど3要素の配列**。
5. 地域名・サービス名は全体を通じ **それぞれ2回以内** を目安。
6. 未入力の数値実績・保証の断定はしない。

【必須キー一覧（すべて文字列または配列で出力）】
- headline, subheadline
- hero_badge_label （バッジ1行。例:「◯◯に根ざした□□サポート」— ◯◯は地域でも業種でもよいが冗長にしない）
- hero_cta_primary_phone （「電話で〜」系・短く）
- hero_cta_primary_web （「無料で相談〜」系）
- hero_cta_note （ヒーロー直下の補足1文）
- line_cta_label （LINEボタン。通常「LINEで相談する」に近い長さ）
- cta_second_primary_phone, cta_second_primary_web （中盤大CTA）
- cta_second_title, cta_second_lead, cta_second_note
- problems_title, problems_lead, problems_bullets
- diagnosis_lead, diagnosis_check_items, diagnosis_cta_phone, diagnosis_cta_web
- consultation_lead, consultation_form_cta, consultation_note （※noteはエリア名を自然に1回まで）
- trust_inline_title, trust_inline_lead （信頼テンプレ用の中間CTA見出し・リード）
- benefit_inline_title, benefit_inline_lead （ベネフィットテンプレ用）

JSONのキー名は上記スネークケースを厳守すること。`;
}

export async function generateLpUiCopyPackWithGemini(
  input: LpUiCopyPackInput,
): Promise<LpUiCopyPackResult | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    MODEL,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPackPrompt(input) }] }],
      generationConfig: {
        temperature: 0.65,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error(
      '[gemini-lp-ui-copy-pack] failed',
      res.status,
      errBody.slice(0, 600),
    );
    return null;
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  if (!raw) return null;

  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as LpUiCopyPackResult;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    console.error('[gemini-lp-ui-copy-pack] parse', raw.slice(0, 300));
    return null;
  }
}
