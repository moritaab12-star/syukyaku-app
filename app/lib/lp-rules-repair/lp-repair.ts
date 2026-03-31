import { geminiGeneratePlainText } from '@/app/lib/agent/gemini-json';

/** 修正 AI への入力キー（欠損ログ・エラー表示用） */
export type LpRepairInputKey = 'masterJson' | 'lpText' | 'auditResult';

const REPAIR_INSTRUCTIONS = `あなたはLP修正AIです。
以下の監査結果に従って、LP文章を修正してください。

条件：
- master_json のルールを絶対優先
- 監査で指摘された違反をすべて修正
- 禁止語は完全に除去
- CTAは許可された候補の意味に合わせる
- 不自然な日本語を自然に直す
- 文章量は大きく減らしすぎない
- 元の業種以外の世界観を混ぜない

━━━━━━━━━━━━━━━━━━
【出力ルール】
━━━━━━━━━━━━━━━━━━
- 修正後のLP文章だけを出力
- 解説や言い訳は不要
- セクション構造はできるだけ維持`;

/**
 * API ボディなどから snake_case / camelCase のどちらでも取得する。
 */
export function normalizeLpRepairBodyFields(raw: Record<string, unknown>): {
  masterJson: unknown;
  lpText: unknown;
  auditResult: unknown;
} {
  return {
    masterJson: raw.masterJson ?? raw.master_json,
    lpText: raw.lpText ?? raw.lp_text,
    auditResult: raw.auditResult ?? raw.audit_result,
  };
}

function isRecordObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 修正 AI を呼ぶ前に必須入力が揃っているか検査する。
 * - masterJson: null / undefined は不可。ルートはオブジェクト（配列不可）。空オブジェクト {} は可。
 * - lpText: 非空文字列のみ可。
 * - auditResult: null / undefined / 空文字列は不可。オブジェクト・配列・非空文字列・数値・真偽値は可。
 */
export function listMissingLpRepairInputKeys(input: {
  masterJson?: unknown;
  lpText?: unknown;
  auditResult?: unknown;
}): LpRepairInputKey[] {
  const missing: LpRepairInputKey[] = [];

  const mj = input.masterJson;
  if (mj === null || mj === undefined) {
    missing.push('masterJson');
  } else if (!isRecordObject(mj)) {
    missing.push('masterJson');
  }

  const lp = input.lpText;
  if (lp === null || lp === undefined) {
    missing.push('lpText');
  } else if (typeof lp !== 'string' || lp.trim().length === 0) {
    missing.push('lpText');
  }

  const ar = input.auditResult;
  if (ar === null || ar === undefined) {
    missing.push('auditResult');
  } else if (typeof ar === 'string' && ar.trim().length === 0) {
    missing.push('auditResult');
  }

  return missing;
}

const MISSING_LABELS: Record<LpRepairInputKey, string> = {
  masterJson: '業種ルール master_json（オブジェクト）',
  lpText: '元のLP文章（lp_text）',
  auditResult: '監査結果（audit_result）',
};

export function formatLpRepairMissingInputsMessage(
  missing: LpRepairInputKey[],
): string {
  if (missing.length === 0) return '';
  const labels = missing.map((k) => MISSING_LABELS[k]);
  return `LP修正AI を実行できません。次の入力が null / undefined、または不正です: ${labels.join('、')}`;
}

function formatAuditResultBlock(auditResult: unknown): string {
  if (typeof auditResult === 'string') {
    return auditResult.trim();
  }
  return JSON.stringify(auditResult, null, 2);
}

/**
 * 実データを埋め込んだ修正プロンプト全文（Gemini ユーザー文面）。
 * 呼び出し前に `listMissingLpRepairInputKeys` で欠損がないことを確認すること。
 */
export function buildLpRepairPromptResolved(input: {
  masterJson: Record<string, unknown>;
  lpText: string;
  auditResult: unknown;
}): string {
  const masterBlock = JSON.stringify(input.masterJson, null, 2);
  const auditBlock = formatAuditResultBlock(input.auditResult);

  return `${REPAIR_INSTRUCTIONS}

━━━━━━━━━━━━━━━━━━
【業種ルール master_json】
━━━━━━━━━━━━━━━━━━
${masterBlock}

━━━━━━━━━━━━━━━━━━
【元のLP文章】
━━━━━━━━━━━━━━━━━━
${input.lpText.trim()}

━━━━━━━━━━━━━━━━━━
【監査結果】
━━━━━━━━━━━━━━━━━━
${auditBlock}`;
}

export type RunLpRepairGeminiResult =
  | {
      ok: true;
      prompt: string;
      revisedLpText: string;
    }
  | {
      ok: false;
      reason: 'missing_inputs';
      missing: LpRepairInputKey[];
      userMessage: string;
    }
  | {
      ok: false;
      reason: 'gemini_unavailable';
      userMessage: string;
    };

/**
 * 欠損があれば Gemini を呼ばずに打ち切り、ログを出す。
 * 揃っている場合のみ `buildLpRepairPromptResolved` → `geminiGeneratePlainText`。
 */
export async function runLpRepairGeminiIfInputsComplete(input: {
  masterJson?: unknown;
  lpText?: unknown;
  auditResult?: unknown;
}): Promise<RunLpRepairGeminiResult> {
  const missing = listMissingLpRepairInputKeys(input);
  if (missing.length > 0) {
    const userMessage = formatLpRepairMissingInputsMessage(missing);
    console.warn('[lp-repair] skipped Gemini call: missing inputs', {
      missing,
      userMessage,
    });
    return {
      ok: false,
      reason: 'missing_inputs',
      missing,
      userMessage,
    };
  }

  const masterJson = input.masterJson as Record<string, unknown>;
  const lpText = (input.lpText as string).trim();

  const prompt = buildLpRepairPromptResolved({
    masterJson,
    lpText,
    auditResult: input.auditResult,
  });

  const revised = await geminiGeneratePlainText(prompt);
  if (!revised) {
    const userMessage =
      'LP修正AI（Gemini）の応答を取得できませんでした。GEMINI_API_KEY とネットワークを確認してください。';
    console.error('[lp-repair] gemini returned empty');
    return { ok: false, reason: 'gemini_unavailable', userMessage };
  }

  return { ok: true, prompt, revisedLpText: revised };
}
