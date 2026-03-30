/**
 * LP のデザイン戦略・デザイントークン決定用（Gemini 等の system 指示）。
 * AgentAppealMode（コピー）とは直交。本文・CTA・セクション構造は扱わない。
 */

import type {
  Q33PriceSignal,
  DesignStrategy,
  LpDesignTokens,
  LpDiagramFlags,
} from '@/app/lib/lp-design-layer/schema';

export type {
  Q33PriceSignal,
  DesignStrategy,
  LpDesignTokens,
  LpDiagramFlags,
} from '@/app/lib/lp-design-layer/schema';

export const DESIGN_STRATEGY_ASSISTANT_SYSTEM_PROMPT = `あなたは LP の「デザイン戦略」と「デザイントークン」を決めるアシスタントです。

絶対ルール:
- 既存の訴求モード AgentAppealMode（price/trust/empathy/urgency/local）は「コピー」用。あなたはそれを変更・推測・出力してはいけない。
- あなたの出力は「見た目（UI）」のみ。コピー本文・見出し文言・CTA ラベル・セクション順・新セクション追加は禁止。
- 出力は有効な JSON 1個のみ。前後に説明文やマークダウンを付けない。

用語:
- tone = 見た目の雰囲気（デザイン）
- priority（design_strategy 内）= ビジネス上の最優先目的（コピーの trust とは別物）

矛盾防止（モデル側でも従うこと）:
- informationDensity が high のとき visualLevel を minimal にしてはいけない。誤ってそうなら visualLevel を medium に寄せる。

図解は新セクションを作らない。挿入可否のフラグだけを出す（位置はシステムが固定）。
`;

export type DesignStrategyPromptInput = {
  instruction: string;
  service: string;
  rawAnswersSummary: string;
  q23Excerpt: string;
  q33Excerpt: string;
  q33PriceSignal: Q33PriceSignal;
};

/**
 * design_strategy JSON 生成用ユーザープロンプト（Call 1）。
 * system には `DESIGN_STRATEGY_ASSISTANT_SYSTEM_PROMPT` を渡す。
 */
export function buildDesignStrategyUserPrompt(input: DesignStrategyPromptInput): string {
  const {
    instruction,
    service,
    rawAnswersSummary,
    q23Excerpt,
    q33Excerpt,
    q33PriceSignal,
  } = input;

  const head = `以下の入力から design_strategy の JSON を生成せよ。

design_strategy のスキーマ（値はこの列挙のみ）:
{
  "tone": "trust" | "pop" | "luxury" | "friendly",
  "priority": "cv" | "trust_focus" | "speed",
  "targetType": "young" | "senior" | "business",
  "informationDensity": "high" | "medium" | "low",
  "visualLevel": "strong" | "medium" | "minimal"
}

判断材料（必ず参照）:
- 指示欄（ユーザー要望）
- 業種・サービス名 service
- raw_answers の要約（特に不安の強さに関わる q23、料金・価格に関わる q33）
- システム計算済み q33_price_signal: "strong" | "medium" | "weak"（これは参考。q33 の本文を優先して整合を取る）

方針:
- q23 が不安・リスクを強く述べるなら tone は trust 寄り、visualLevel は strong/medium を検討。luxury は乱用しない（業種と整合する場合のみ）。
- q33_price_signal が strong でも priority を必ず変える必要はない。priority はページ全体の主目的で決める。

出力は上記キーだけを持つ JSON。他キー禁止。

--- 入力 ---
instruction: `;

  return [
    head,
    instruction,
    '\n\nservice: ',
    service,
    '\n\nraw_answers_summary: ',
    rawAnswersSummary,
    '\n\nq23_excerpt: ',
    q23Excerpt,
    '\n\nq33_excerpt: ',
    q33Excerpt,
    '\n\nq33_price_signal: ',
    q33PriceSignal,
    '\n',
  ].join('');
}

export type DesignTokensPromptInput = {
  /** 確定済み design_strategy（オブジェクトまたは JSON 文字列） */
  designStrategy: DesignStrategy | string;
  variationSeed: number;
  q33PriceSignal: Q33PriceSignal;
  instruction: string;
};

function formatDesignStrategyForPrompt(designStrategy: DesignStrategy | string): string {
  if (typeof designStrategy === 'string') return designStrategy;
  return JSON.stringify(designStrategy, null, 2);
}

/**
 * design_tokens + diagram_flags 生成用ユーザープロンプト（Call 2）。
 * system には `DESIGN_STRATEGY_ASSISTANT_SYSTEM_PROMPT` を渡す。
 */
export function buildDesignTokensUserPrompt(input: DesignTokensPromptInput): string {
  const { designStrategy, variationSeed, q33PriceSignal, instruction } = input;
  const strategyJson = formatDesignStrategyForPrompt(designStrategy);
  const seedText = String(variationSeed);

  const head = `確定した design_strategy と variation のための seed に基づき、design_tokens と diagram_flags を生成せよ。

design_tokens（値は次の列挙のみ。自由文字列禁止）:
{
  "themeKey": "trust_neutral" | "fresh_pop" | "luxury_subtle" | "warm_friendly",
  "radius": "sm" | "md" | "lg",
  "shadow": "none" | "soft" | "elevated",
  "iconSet": "outline" | "filled" | "minimal_line",
  "surfaceContrast": "low" | "medium" | "high"
}

diagram_flags:
{
  "checklist": boolean,  // Problem（悩み）ブロック内
  "compare": boolean,   // Service ブロック内
  "stats": boolean,     // Trust ブロック内
  "flow": boolean       // 最終 CTA 直前
}

ルール:
- 新セクションは作らない。フラグは「その位置に小ブロックを出すか」だけ。
- informationDensity が high なら checklist か stats を true にしやすくする。low なら flow を優先しすぎない。
- visualLevel が minimal なら shadow は none or soft、iconSet は minimal_line を優先。
- variation_seed により、同等条件下でも themeKey/radius/iconSet の組み合わせに「わずかな揺らぎ」を入れる（同 seed では同じ結果）。

絶対に変えてはいけないもの（トークンに含めない・これらを上書きするキーは禁止）:
- CTA の色仕様、フォントサイズ、最小余白（システム固定）

出力 JSON 形式:
{ "design_tokens": { ... }, "diagram_flags": { ... } }
他キー禁止。

--- 入力 ---
design_strategy: `;

  return [
    head,
    strategyJson,
    '\n\nvariation_seed: ',
    seedText,
    '\n\nq33_price_signal: ',
    q33PriceSignal,
    '\n\ninstruction: ',
    instruction,
    '\n',
  ].join('');
}
