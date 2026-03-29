import type { LpUiCopy } from '@/app/lib/lp-ui-copy';

/** 訴求モード（単一 HTML テンプレ内の性格分け） */
export type AgentAppealMode =
  | 'price'
  | 'trust'
  | 'empathy'
  | 'urgency'
  | 'local';

/** 競合ページから抽出した抽象パターン（文言コピー禁止・ラベルのみ） */
export type CommonPatternSummary = {
  commonHeadlines: string[];
  commonCtas: string[];
  commonSections: string[];
  notes: string[];
};

/** 自然文解析結果 */
export type ParsedInstruction = {
  area: string;
  service: string;
  /** 作成本数 1–30 */
  count: number;
  /** ターゲット・訴求の補足（任意） */
  target: string;
  appeal: string;
};

/** 計画された1本の LP テーマ（キーワード / 見出し素材） */
export type LpTheme = {
  title: string;
};

export type AgentCreatedRow = {
  id: string;
  slug: string;
  title: string;
  mode: string | null;
  score: number | null;
  status: string | null;
};

export type AgentRunResult = {
  plan_id: string;
  created: AgentCreatedRow[];
  error?: string;
};

export type EvaluateResult = {
  score: number;
  status: 'ok' | 'fix' | 'ng';
  title: string;
  reasons: string[];
};

export type AgentCreatedProjectRow = {
  id: string;
  mode: AgentAppealMode;
  agentPatch: Partial<LpUiCopy>;
};

export type ExecuteLpGenerationResult = {
  created: AgentCreatedProjectRow[];
  error?: string;
};
