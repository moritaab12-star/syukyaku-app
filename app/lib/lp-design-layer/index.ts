export {
  type Q33PriceSignal,
  type DesignStrategy,
  type LpDesignTokens,
  type LpDiagramFlags,
  type LpDesignRow,
  DesignStrategySchema,
  LpDesignTokensSchema,
  LpDiagramFlagsSchema,
  LpDesignRowSchema,
  FALLBACK_DESIGN_STRATEGY,
  FALLBACK_DESIGN_TOKENS,
  FALLBACK_DIAGRAM_FLAGS,
  applyDesignConstraints,
  safeParseDesignStrategy,
  safeParseLpDesignTokens,
  safeParseLpDiagramFlags,
  safeParseLpDesignRow,
} from '@/app/lib/lp-design-layer/schema';

export { computeQ33PriceSignal } from '@/app/lib/lp-design-layer/q33-signal';
export {
  rawAnswerById,
  buildRawAnswersSummaryForDesign,
} from '@/app/lib/lp-design-layer/raw-answers-helpers';
export { resolveLpDesignLayer, type ResolveLpDesignInput } from '@/app/lib/lp-design-layer/resolve';
export { lpDesignTokensToBodyClasses } from '@/app/lib/lp-design-layer/tokens-to-classes';
export {
  buildDiagramSnippets,
  type DiagramSnippets,
} from '@/app/lib/lp-design-layer/diagram-snippets';
export {
  generateLpDesignRowForProject,
  type GenerateLpDesignRowInput,
} from '@/app/lib/lp-design-layer/generate-with-gemini';
