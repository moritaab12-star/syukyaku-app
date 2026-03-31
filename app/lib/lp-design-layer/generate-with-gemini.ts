import { z } from 'zod';
import {
  stripJsonFence,
  geminiGenerateJsonWithSystem,
} from '@/app/lib/agent/gemini-json';
import {
  DESIGN_STRATEGY_ASSISTANT_SYSTEM_PROMPT,
  buildDesignStrategyUserPrompt,
  buildDesignTokensUserPrompt,
} from '@/app/lib/agent/design-strategy-prompts';
import {
  type LpDesignRow,
  type DesignStrategy,
  FALLBACK_DESIGN_STRATEGY,
  safeParseDesignStrategy,
  LpDesignTokensSchema,
  LpDiagramFlagsSchema,
} from '@/app/lib/lp-design-layer/schema';
import { computeQ33PriceSignal } from '@/app/lib/lp-design-layer/q33-signal';
import {
  rawAnswerById,
  buildRawAnswersSummaryForDesign,
} from '@/app/lib/lp-design-layer/raw-answers-helpers';
import { deriveFallbackDesignSurface } from '@/app/lib/lp-design-layer/derive-fallback-surface';
import { nudgeTokensAvoidFingerprints } from '@/app/lib/lp-design-layer/token-collision';

const GeminiCall2Schema = z.object({
  design_tokens: LpDesignTokensSchema,
  diagram_flags: LpDiagramFlagsSchema,
});

export type GenerateLpDesignRowInput = {
  /** 指示の自然文（エージェント計画・ユーザー要望など） */
  instruction: string;
  service: string;
  rawAnswers: unknown;
  variationSeed: number;
  /** 業種コンテキスト（design-context / lp-industry） */
  industryContext?: string;
  /** ターゲット層ヒント */
  targetProfileContext?: string;
  /** 同一グループ先行 LP の指紋テキスト */
  siblingDesignContext?: string;
  /** 衝突回避用・先行 LP の token 指紋 */
  siblingTokenFingerprints?: Set<string>;
};

function parseJsonObject(raw: string | null): unknown {
  if (raw == null || !raw.trim()) return null;
  try {
    return JSON.parse(stripJsonFence(raw)) as unknown;
  } catch {
    return null;
  }
}

/**
 * Gemini（設定時）で design_strategy → design_tokens を2段生成し Zod 検証。
 * 失敗・未設定キーはフォールバックで埋める。
 */
export async function generateLpDesignRowForProject(
  input: GenerateLpDesignRowInput,
): Promise<LpDesignRow> {
  const seed = Number.isFinite(input.variationSeed)
    ? Math.trunc(input.variationSeed)
    : 0;

  const q23 = rawAnswerById(input.rawAnswers, 'q23');
  const q33 = rawAnswerById(input.rawAnswers, 'q33');
  const q33PriceSignal = computeQ33PriceSignal(q33);
  const rawAnswersSummary = buildRawAnswersSummaryForDesign(input.rawAnswers);

  const fp = input.siblingTokenFingerprints;
  const hasSiblings = fp != null && fp.size > 0;

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const strategy = FALLBACK_DESIGN_STRATEGY;
    const { tokens: t0, diagram_flags } = deriveFallbackDesignSurface(
      strategy,
      seed,
    );
    const tokens =
      hasSiblings && fp
        ? nudgeTokensAvoidFingerprints(t0, strategy, fp, seed)
        : t0;
    return { strategy, tokens, diagram_flags, source: 'fallback' };
  }

  const user1 = buildDesignStrategyUserPrompt({
    instruction: input.instruction,
    service: input.service,
    rawAnswersSummary,
    q23Excerpt: q23.trim().slice(0, 800),
    q33Excerpt: q33.trim().slice(0, 800),
    q33PriceSignal,
    industryContext: input.industryContext,
    targetProfileContext: input.targetProfileContext,
    siblingDesignContext: input.siblingDesignContext,
  });

  const raw1 = await geminiGenerateJsonWithSystem(
    DESIGN_STRATEGY_ASSISTANT_SYSTEM_PROMPT,
    user1,
  );
  const strategyParsed = safeParseDesignStrategy(parseJsonObject(raw1));
  const strategy: DesignStrategy = strategyParsed.ok
    ? strategyParsed.data
    : FALLBACK_DESIGN_STRATEGY;

  const user2 = buildDesignTokensUserPrompt({
    designStrategy: strategy,
    variationSeed: seed,
    q33PriceSignal,
    instruction: input.instruction,
  });

  const raw2 = await geminiGenerateJsonWithSystem(
    DESIGN_STRATEGY_ASSISTANT_SYSTEM_PROMPT,
    user2,
  );

  const obj2 = parseJsonObject(raw2);
  const call2 = GeminiCall2Schema.safeParse(obj2);

  if (!call2.success) {
    const { tokens: t0, diagram_flags } = deriveFallbackDesignSurface(strategy, seed);
    const tokens =
      hasSiblings && fp
        ? nudgeTokensAvoidFingerprints(t0, strategy, fp, seed)
        : t0;
    return {
      strategy,
      tokens,
      diagram_flags,
      source: 'fallback',
    };
  }

  let tokens = call2.data.design_tokens;
  if (hasSiblings && fp) {
    tokens = nudgeTokensAvoidFingerprints(tokens, strategy, fp, seed);
  }

  return {
    strategy,
    tokens,
    diagram_flags: call2.data.diagram_flags,
    source: 'ai',
  };
}
