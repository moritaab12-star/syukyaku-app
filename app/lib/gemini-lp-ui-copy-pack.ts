/**
 * LP 一式の UI コピー（FV + CTA + 悩み/診断ブロック等）を Gemini で生成。
 * 既定: キー集合を分割した複数回呼び出しで生成しマージ（単発より JSON 欠落を抑える）。
 * GEMINI_LP_UI_COPY_SINGLE_CALL=1 で従来の1回生成に切り替え可能。
 */

import type { GeminiFvCatchInput } from '@/app/lib/gemini-fv-catch';
import {
  lpAppealAngleMeaningJa,
  resolveLpAppealAngle,
} from '@/app/lib/lp-copy-appeal-angle';
import { buildServiceGroundingRulesForPrompt } from '@/app/lib/lp-copy-service-grounding';
import {
  formatValidationRepairHint,
  validateLpUiCopyPack,
} from '@/app/lib/lp-copy-output-validate';

const MODEL =
  process.env.GEMINI_LP_UI_COPY_MODEL?.trim() ||
  process.env.GEMINI_FV_CATCH_MODEL?.trim() ||
  process.env.GEMINI_LP_MODEL?.trim() ||
  'gemini-1.5-flash';

export type LpUiCopyPackInput = GeminiFvCatchInput;

export type LpUiCopyPackResult = Record<string, unknown>;

const SLICE_A_KEYS = [
  'headline',
  'subheadline',
  'hero_badge_label',
  'hero_cta_primary_phone',
  'hero_cta_primary_web',
  'hero_cta_note',
  'line_cta_label',
] as const;

const SLICE_B_KEYS = [
  'problems_title',
  'problems_lead',
  'problems_bullets',
  'diagnosis_lead',
  'diagnosis_check_items',
  'diagnosis_cta_phone',
  'diagnosis_cta_web',
] as const;

const SLICE_C_KEYS = [
  'cta_second_primary_phone',
  'cta_second_primary_web',
  'cta_second_title',
  'cta_second_lead',
  'cta_second_note',
  'consultation_lead',
  'consultation_form_cta',
  'consultation_note',
  'trust_inline_title',
  'trust_inline_lead',
  'benefit_inline_title',
  'benefit_inline_lead',
] as const;

function stripJsonFence(s: string): string {
  let t = s.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  }
  return t.trim();
}

function useSingleCallOnly(): boolean {
  const v = process.env.GEMINI_LP_UI_COPY_SINGLE_CALL?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** 分割・一括生成の共通 Gemini 呼び出し */
export async function runGeminiLpUiJsonPrompt(
  userText: string,
  options?: { maxOutputTokens?: number },
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    MODEL,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.52,
        maxOutputTokens: options?.maxOutputTokens ?? 4096,
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
  return raw;
}

function pickKeys<K extends string>(
  src: Record<string, unknown>,
  keys: readonly K[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in src) out[k] = src[k];
  }
  return out;
}

function buildPackContextPreamble(input: LpUiCopyPackInput): string {
  const seed = Number.isFinite(input.variationSeed)
    ? Math.trunc(input.variationSeed)
    : 0;
  const instr = (input.editorInstruction ?? '').trim();
  const appeal = resolveLpAppealAngle(instr, seed);
  const angle = appeal.code;
  const angleSourceNote =
    appeal.source === 'instruction'
      ? '（編集者指示のキーワードから決定）'
      : '（variation_seed から決定）';

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
【編集者・エージェント指示（解釈範囲は指定どおりに限定）】
${instr}

- **業種・メニュー・商品/サービスの事実**は「対応サービス原文」と「アンケート50問」に書かれている内容だけを根拠にする。指示に別の業種・商材が書かれていても **無視** する。
- 指示は **訴求モデル**（価格・信頼・共感・緊急性・地域密着など）と **デザイン意図**（落ち着き/力強さ/カジュアルさ・情報の優先順位の言語化）の解釈にだけ使う。
`
      : '';

  return `あなたは日本の地域密着ランディングページのコピーライターです。
【このプロジェクト専用】に、**指定したキーだけ**を含む **1つの JSON オブジェクト** を返す（キー以外のプロパティや説明文は付けない）。

【対応サービス・業種の原文（フォームの target_services / DB の service。業種・何屋か・メニュー判断の最優先。カンマ区切りも含めてそのまま読む）】
${service}

${buildServiceGroundingRulesForPrompt(service)}

【補助メタ（サービス原文と矛盾させない）】
- 地域（多用しない。各フィールドで重複させない）: ${area}
- 業種キー（補助）: ${ik}
- 業種トーン説明（補助。原文と食い違う場合は原文優先）: ${idesc}
- 会社・屋号（短く。未入力なら無理に入れない）: ${cn || '（なし）'}
${editorBlock}
【訴求角度（内部のみ。出力に書かない）】
- variation_seed: ${seed}
- 採用角度「${angle}」${angleSourceNote} を全体のトーンに反映: ${lpAppealAngleMeaningJa(angle)}

【アンケート（事実・アンカー。未記入分はサービス原文に即した語で補い、事実の捏造はしない）】
${qa}

【同一グループの既存 headline（似せない）】
${existing}
${(input.servicePersonaBlock ?? '').trim() ? `\n${(input.servicePersonaBlock ?? '').trim()}\n` : ''}`;
}

function priorBlock(label: string, obj: Record<string, unknown>): string {
  if (Object.keys(obj).length === 0) return '';
  return `
${label}
${JSON.stringify(obj)}
`;
}

function buildSlicePrompt(
  slice: 'a' | 'b' | 'c',
  input: LpUiCopyPackInput,
  repairExtra: string,
  priorForTone: Record<string, unknown>,
): string {
  const preamble = buildPackContextPreamble(input);
  const prior = priorBlock(
    '【先行ブロックの出力（トーン・敬体・ターゲットをこれに揃える。語句は丸写ししない）】',
    priorForTone,
  );

  const commonRules = `
【共通ルール】
1. 出力は **有効な JSON のみ**（前後に説明禁止）。キー名はスネークケース厳守。指定キー以外は出力しない。
2. 地域名は全体を通じ **2 回以内** を目安。サービス表現は原文の語をそのまままたは自然な短縮で活かす。
3. 未入力の数値実績・保証の断定はしない。
`;

  if (slice === 'a') {
    return `${preamble}
${repairExtra}
${commonRules}
【ブロック1 専用ルール】
- headline: 全角18〜28文字目安。subheadline: 2〜3文・ですます。**いずれもサービス原文の業務語を最低1つ含める**（原文に無い業種語は禁止）。
- hero_badge_label: バッジ1行。**サービス原文の語を必ず含む**。抽象ラベルだけにしない。
- hero CTA: 押し売り感が強すぎない。電話版・Web版で文言を変える。
- line_cta_label: LINE 導線用。長さは一般的なボタン文言程度。

【必須キー（この7つだけ）】
${SLICE_A_KEYS.map((k) => `- ${k}`).join('\n')}
`;
  }

  if (slice === 'b') {
    return `${preamble}
${prior}
${repairExtra}
${commonRules}
【ブロック2 専用ルール】
- problems_bullets / diagnosis_check_items は **文字列ちょうど3要素の配列**。各要素に **サービス原文に由来する語** を含める。
- problems / diagnosis の見出し・リードは **サービス原文の語を織り込む**。汎用句の連載は避ける。

【必須キー（この7つだけ）】
${SLICE_B_KEYS.map((k) => `- ${k}`).join('\n')}
`;
  }

  return `${preamble}
${prior}
${repairExtra}
${commonRules}
【ブロック3 専用ルール】
- 中盤〜下部の CTA: 電話版・Web版で文言を変える。押し売り過多にしない。
- consultation_note: エリア名は自然に **1 回まで**。
- trust_inline_*, benefit_inline_*: **汎用句だけの連載**にせず、原文の業種に即した内容にする。

【必須キー（この12個だけ）】
${SLICE_C_KEYS.map((k) => `- ${k}`).join('\n')}
`;
}

async function parseSliceJson(raw: string | null): Promise<LpUiCopyPackResult | null> {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as LpUiCopyPackResult;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function generateLpUiCopyPackSplit(
  input: LpUiCopyPackInput,
  repairExtra: string,
): Promise<LpUiCopyPackResult | null> {
  const tokenBudget = { maxOutputTokens: 2800 };

  const rawA = await runGeminiLpUiJsonPrompt(
    buildSlicePrompt('a', input, repairExtra, {}),
    tokenBudget,
  );
  const partA = await parseSliceJson(rawA);
  if (!partA) return null;

  const priorB = pickKeys(partA, SLICE_A_KEYS as unknown as string[]);
  const rawB = await runGeminiLpUiJsonPrompt(
    buildSlicePrompt('b', input, repairExtra, priorB),
    tokenBudget,
  );
  const partB = await parseSliceJson(rawB);
  if (!partB) return null;

  const priorC = {
    ...pickKeys(partA, SLICE_A_KEYS as unknown as string[]),
    ...pickKeys(partB, ['problems_title', 'problems_lead', 'diagnosis_lead']),
  };
  const rawC = await runGeminiLpUiJsonPrompt(
    buildSlicePrompt('c', input, repairExtra, priorC),
    tokenBudget,
  );
  const partC = await parseSliceJson(rawC);
  if (!partC) return null;

  return {
    ...partA,
    ...partB,
    ...partC,
  } as LpUiCopyPackResult;
}

function buildPackPromptSingleCall(input: LpUiCopyPackInput): string {
  return `${buildPackContextPreamble(input)}
【ルール】
1. 出力は **有効なJSONのみ**（前後に説明禁止）。
2. headline: 全角18〜28文字目安。subheadline: 2〜3文・ですます。**いずれもサービス原文の業務語を最低1つ含める**（原文に無い業種語は禁止）。
3. CTAは押し売り感が強すぎない。電話版・Web版で文言を変える。
4. problems_bullets / diagnosis_check_items は **文字列ちょうど3要素の配列**。各要素に **サービス原文に由来する語**を含める。
5. 地域名は全体を通じ **2回以内** を目安。サービス表現は原文の語をそのまままたは自然な短縮で活かす。
6. 未入力の数値実績・保証の断定はしない。
7. trust_inline_*, benefit_inline_*, cta_second_* も **汎用句の連載禁止**。原文の業種に即した内容にする。

【必須キー一覧（すべて文字列または配列で出力。キー以外は出力しない）】
- headline, subheadline
- hero_badge_label （バッジ1行。**サービス原文の語を必ず含む**。「地域密着〇〇」だけの抽象バッジにしない）
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

const PACK_MAX_VALIDATION_ATTEMPTS = 3;

async function generateLpUiCopyPackSingleCallLoop(
  input: LpUiCopyPackInput,
): Promise<LpUiCopyPackResult | null> {
  const basePrompt = buildPackPromptSingleCall(input);
  let lastParsed: LpUiCopyPackResult | null = null;
  let lastReasons: string[] = [];

  for (let attempt = 0; attempt < PACK_MAX_VALIDATION_ATTEMPTS; attempt++) {
    const repair =
      attempt === 0
        ? ''
        : `\n\n${formatValidationRepairHint(lastReasons)}\n\n【不合格だった直前のJSON（表現を参考にしつつ修正・truncate可）】\n${JSON.stringify(lastParsed).slice(0, 1800)}`;
    const userText = basePrompt + repair;

    const gotRaw = await runGeminiLpUiJsonPrompt(userText);
    if (!gotRaw) return lastParsed;

    try {
      const parsed = JSON.parse(stripJsonFence(gotRaw)) as LpUiCopyPackResult;
      if (!parsed || typeof parsed !== 'object') {
        console.error('[gemini-lp-ui-copy-pack] parse not object');
        continue;
      }
      lastParsed = parsed;
      const v = validateLpUiCopyPack(input.service, parsed, {
        forbiddenPhrases: input.servicePersonaForbiddenPhrases,
      });
      if (v.ok) {
        return parsed;
      }
      lastReasons = v.reasons;
      console.warn(
        '[gemini-lp-ui-copy-pack] validation',
        attempt + 1,
        v.reasons.join(' | '),
      );
    } catch {
      console.error(
        '[gemini-lp-ui-copy-pack] parse',
        gotRaw.slice(0, 300),
      );
    }
  }

  if (lastParsed) {
    console.warn(
      '[gemini-lp-ui-copy-pack] using last output after failed validation',
      lastReasons.join(' | '),
    );
    return lastParsed;
  }
  return null;
}

export async function generateLpUiCopyPackWithGemini(
  input: LpUiCopyPackInput,
): Promise<LpUiCopyPackResult | null> {
  if (useSingleCallOnly()) {
    return generateLpUiCopyPackSingleCallLoop(input);
  }

  let lastParsed: LpUiCopyPackResult | null = null;
  let lastReasons: string[] = [];

  for (let attempt = 0; attempt < PACK_MAX_VALIDATION_ATTEMPTS; attempt++) {
    const repair =
      attempt === 0
        ? ''
        : `\n\n${formatValidationRepairHint(lastReasons)}\n\n【不合格だった直前のマージ済みJSON（修正して各部分を再出力する際の参考・truncate可）】\n${JSON.stringify(lastParsed).slice(0, 1800)}`;

    let merged = await generateLpUiCopyPackSplit(input, repair);

    if (!merged) {
      console.warn(
        '[gemini-lp-ui-copy-pack] split failed, falling back to single-call',
      );
      merged = await generateLpUiCopyPackSingleCallLoop(input);
      return merged;
    }

    lastParsed = merged;
    const v = validateLpUiCopyPack(input.service, merged, {
      forbiddenPhrases: input.servicePersonaForbiddenPhrases,
    });
    if (v.ok) {
      return merged;
    }
    lastReasons = v.reasons;
    console.warn(
      '[gemini-lp-ui-copy-pack] validation (split)',
      attempt + 1,
      v.reasons.join(' | '),
    );
  }

  if (lastParsed) {
    console.warn(
      '[gemini-lp-ui-copy-pack] using last merged output after failed validation',
      lastReasons.join(' | '),
    );
    return lastParsed;
  }

  return generateLpUiCopyPackSingleCallLoop(input);
}
