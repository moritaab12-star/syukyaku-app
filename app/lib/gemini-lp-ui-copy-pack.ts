/**
 * LP 一式の UI コピー（FV + CTA + 悩み/診断ブロック等）を Gemini で1回生成。
 */

import type { GeminiFvCatchInput } from '@/app/lib/gemini-fv-catch';
import {
  lpAppealAngleMeaningJa,
  resolveLpAppealAngle,
} from '@/app/lib/lp-copy-appeal-angle';

const MODEL =
  process.env.GEMINI_LP_UI_COPY_MODEL?.trim() ||
  process.env.GEMINI_FV_CATCH_MODEL?.trim() ||
  process.env.GEMINI_LP_MODEL?.trim() ||
  'gemini-1.5-flash';

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
  const instr = (input.editorInstruction ?? '').trim();
  const appeal = resolveLpAppealAngle(instr, seed);
  const angle = appeal.code;
  const angleSourceNote =
    appeal.source === 'instruction'
      ? '（編集者指示のキーワードから決定）'
      : '（指示に該当なしのため variation_seed から決定）';

  const area = input.area.trim() || '（未設定）';
  const service = input.service.trim() || '（未設定）';
  const ik = input.industryKey.trim() || '（未設定）';
  const idesc = input.industryDescription.trim() || '（未設定）';
  const cn = input.companyName.trim();
  const qa = input.qaContext.trim() || '（未入力）';
  const existing = input.existingHeadlinesBlock.trim() || '（なし）';

  const editorBlock =
    instr.length > 0
      ? `
【編集者・エージェント指示（解釈範囲は次のみ）】
${instr}

- **業種・メニュー・商品/サービスの事実**は「対応サービス原文」と「アンケート50問」に書かれている内容だけを根拠にする。指示に別の業種・商材が書かれていても **無視** する。
- 指示は **訴求モデル**（価格・信頼・共感・緊急性・地域密着など）と **デザイン意図**（落ち着き/力強さ/カジュアルさ・情報の優先順位の言語化）の解釈にだけ使う。
`
      : '';

  return `あなたは日本の地域密着ランディングページのコピーライターです。
【このプロジェクト専用】に、以下のキーをすべて満たす **1つのJSONオブジェクト** を返してください。

【対応サービス・業種の原文（フォームの target_services / DB の service。業種・何屋か・メニュー判断の最優先。カンマ区切りも含めてそのまま読む）】
${service}

【補助メタ（サービス原文と矛盾させない）】
- 地域（多用しない。各フィールドで重複させない）: ${area}
- 業種キー（補助）: ${ik}
- 業種トーン説明（補助。原文と食い違う場合は原文優先）: ${idesc}
- 会社・屋号（短く。未入力なら無理に入れない）: ${cn || '（なし）'}
${editorBlock}
【訴求角度（内部のみ。出力に書かない）】
- variation_seed: ${seed}
- 採用角度「${angle}」${angleSourceNote} を全体のトーンに反映: ${lpAppealAngleMeaningJa(angle)}

【アンケート50問（事実・アンカー。ここにない具体的事実は断定しない）】
${qa}

【同一グループの既存 headline（似せない）】
${existing}

【ルール】
1. 出力は **有効なJSONのみ**（前後に説明禁止）。
2. headline: 全角18〜28文字目安。subheadline: 2〜3文・ですます。
3. CTAは押し売り感が強すぎない。電話版・Web版で文言を変える。
4. problems_bullets / diagnosis_check_items は **文字列ちょうど3要素の配列**。
5. 地域名は全体を通じ **2回以内** を目安。サービス表現は原文の語を活かしつつ自然な回数に抑える。
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
