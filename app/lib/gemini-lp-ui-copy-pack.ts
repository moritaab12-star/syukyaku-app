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
  'hero_meta_line_1',
  'hero_meta_line_2',
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

/** LP 本文ほぼ全面（テンプレ依存を下げ、人格・事実に基づくコピー） */
const SLICE_D_KEYS = [
  'solution_section_title',
  'solution_lead_body',
  'solution_bullets',
  'services_section_title',
  'service_cards',
  'price_section_title',
  'price_section_lead',
  'price_table_footer_note',
  'price_rows',
  'flow_section_title',
  'flow_steps',
  'narrative_trust_items',
  'narrative_local_items',
  'narrative_pain_items',
  'narrative_strength_items',
  'narrative_story_items',
  'faq_items',
  'trust_review_1_text',
  'trust_review_1_meta',
  'trust_review_2_text',
  'trust_review_2_meta',
  'trust_metric_years_label',
  'trust_metric_cases_label',
  'trust_metric_area_label',
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

【絶対禁止（品質）】
1. アンケート50問の**設問文をそのまま**出力に含めない（「〜について：」等の監査表オウム返し禁止）。
2. アンケの**回答文の長い丸写し・口語のそのまま貼り付け**禁止。事実だけ取り、**必ずプロ向けに書き換え**る。
3. 「になりますです」「ご安心くださいです」など**二重語尾・破綻した敬語**を出さない。
4. 人格（業種人格）ブロックがあるときは **文体・CTAのニュアンス・悩み・FAQ論点・禁止語**を最優先。サービス原文と矛盾する業種語は禁止（既存ルールどおり）。

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

【アンケート要約（内部資料・事実抽出のみ。出力に設問番号・設問文・生回答のコピペを混ぜない）】
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
  slice: 'a' | 'b' | 'c' | 'd',
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
- headline: 全角18〜28文字目安。subheadline: 2〜3文・ですます。**いずれもサービス原文の業務語を最低1つ含める**（原文に無い業種語は禁止）。**業種人格のトーンに最適化**。
- hero_badge_label: バッジ1行。**サービス原文の語を必ず含む**。抽象ラベルだけにしない。
- hero_meta_line_1: ヒーロー直下メタ1行。**例「〇〇市を中心に対応」**など地域＋サービスが伝わる短い文（「対応エリア：」のプレフィックスは付けても付けなくてもよい）。
- hero_meta_line_2: メタ2行目。**運営主体・屋号・サービス名**が分かる短い文（「運営：」プレフィックス任意）。
- hero CTA: 押し売り感が強すぎない。電話版・Web版で文言を変える。
- line_cta_label: LINE 導線用。長さは一般的なボタン文言程度。

【必須キー（この9つだけ）】
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

  if (slice === 'd') {
    return `${preamble}
${prior}
${repairExtra}
${commonRules}
【ブロック4 本文一式（アンケ生文禁止・人格に寄せたLPコピー）】
- solution_section_title: 「そのお悩み、◯◯が解決します」に近い見出し（サービス名を自然に含む）。
- solution_lead_body: リード2〜4文。{area} プレースホルダは使わず地域名を直接書く（全体で2回以内）。
- solution_bullets: 文字列 **ちょうど3要素**の配列。
- services_section_title: サービス内容セクションの見出し（全文）。
- service_cards: **ちょうど3要素**の配列。各要素は {"title","text"}。
- price_section_title, price_section_lead: 料金セクション見出し・リード。
- price_table_footer_note: 注記1文。
- price_rows: **ちょうど2要素**の配列。各要素 {"label","price","note"}。
- flow_section_title: 流れセクション見出し。
- flow_steps: **ちょうど3要素** {"title","text"}。
- narrative_* : 各 **文字列2〜3要素**。**設問文を入れない**。
- faq_items: **3〜5要素** {"q","a"}。
- trust_review_*_text / *_meta: レビュー引用と属性行。
- trust_metric_*: メトリック用短文（不明な数値は断定しない）。

【必須キー（この24個だけ）】
${SLICE_D_KEYS.map((k) => `- ${k}`).join('\n')}
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
  const tokenBudgetBody = { maxOutputTokens: 8192 };

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

  const priorD = {
    ...pickKeys(partA, SLICE_A_KEYS as unknown as string[]),
    ...pickKeys(partB, SLICE_B_KEYS as unknown as string[]),
    ...pickKeys(partC, SLICE_C_KEYS as unknown as string[]),
  };
  const rawD = await runGeminiLpUiJsonPrompt(
    buildSlicePrompt('d', input, repairExtra, priorD),
    tokenBudgetBody,
  );
  const partD = await parseSliceJson(rawD);
  const mergedBase = {
    ...partA,
    ...partB,
    ...partC,
    ...(partD ?? {}),
  } as LpUiCopyPackResult;
  if (!partD) {
    console.warn(
      '[gemini-lp-ui-copy-pack] slice D parse failed; saved FV/CTA only (re-run or check model output)',
    );
  }
  return mergedBase;
}

function buildPackPromptSingleCall(input: LpUiCopyPackInput): string {
  const sliceDList = SLICE_D_KEYS.map((k) => `- ${k}`).join('\n');
  return `${buildPackContextPreamble(input)}
【ルール】
1. 出力は **有効なJSONのみ**（前後に説明禁止）。
2. headline / FV: 業種人格のトーンに最適化。サービス原文の業務語を最低1つ。
3. **アンケ設問文のオウム返し・回答の長文コピペ禁止**。必ずプロコピーに書き換え。
4. problems_bullets / diagnosis_check_items は **ちょうど3要素**の配列。
5. solution_bullets **ちょうど3要素**。service_cards **ちょうど3** {title,text}。flow_steps **ちょうど3**。price_rows **ちょうど2** {label,price,note}。faq_items **3〜5** {q,a}。narrative_* 各 **2〜3要素**。
6. 地域名は全体で2回以内目安。未入力の数値断定しない。二重語尾（になりますです等）禁止。
7. CTAは押し売り過多にしない。

【必須キー（キー以外は出力しない。すべて含める）】
- headline, subheadline
- hero_badge_label, hero_meta_line_1, hero_meta_line_2
- hero_cta_primary_phone, hero_cta_primary_web, hero_cta_note, line_cta_label
- cta_second_primary_phone, cta_second_primary_web, cta_second_title, cta_second_lead, cta_second_note
- problems_title, problems_lead, problems_bullets
- diagnosis_lead, diagnosis_check_items, diagnosis_cta_phone, diagnosis_cta_web
- consultation_lead, consultation_form_cta, consultation_note
- trust_inline_title, trust_inline_lead, benefit_inline_title, benefit_inline_lead
【本文・ブロック4（LP全面コピー）】
${sliceDList}

JSONのキー名はスネークケースを厳守すること。`;
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

    const gotRaw = await runGeminiLpUiJsonPrompt(userText, {
      maxOutputTokens: 8192,
    });
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
