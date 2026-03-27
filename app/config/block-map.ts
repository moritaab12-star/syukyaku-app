/**
 * raw_answers の設問ID（qID）→ LP本文ブロック の対応表。
 *
 * ブロックの意味:
 * - trust:    信頼・実績
 * - local:    地域・親近感
 * - pain:     ターゲットの悩み
 * - strength: 差別化・強み
 * - story:    エピソード・未来
 *
 * メンテナンス:
 * - 新しい設問を追加する場合、下の `LP_BLOCK_QUESTION_IDS` の該当ブロック配列に qID を1つ追加する。
 * - qID の並び順は分類に影響しない（マップ参照のみ）。
 * - マップに存在しない qID は `getBlockForQuestionId` が null を返し、ブロック集計から除外される（エラーにしない）。
 */

export type LpBlockKey = 'trust' | 'local' | 'pain' | 'strength' | 'story';

/** q1, q2, … 形式のIDを連番で生成（従来の q1〜q50 範囲と同等の既定マップ用） */
function qids(from: number, to: number): readonly string[] {
  return Array.from({ length: to - from + 1 }, (_, i) => `q${from + i}`);
}

/**
 * 各ブロックに属する設問ID一覧。
 * 必要に応じて任意の qID 文字列を追加可能（例: `custom_foo` など）。
 */
export const LP_BLOCK_QUESTION_IDS: Record<LpBlockKey, readonly string[]> = {
  trust: qids(1, 10),
  local: qids(11, 20),
  pain: qids(21, 30),
  strength: qids(31, 40),
  story: qids(41, 50),
};

function buildQuestionIdToBlockMap(): Readonly<Record<string, LpBlockKey>> {
  const m: Record<string, LpBlockKey> = {};
  (Object.keys(LP_BLOCK_QUESTION_IDS) as LpBlockKey[]).forEach((block) => {
    for (const id of LP_BLOCK_QUESTION_IDS[block]) {
      const k = String(id).trim().toLowerCase();
      if (k) m[k] = block;
    }
  });
  return m;
}

/** ルックアップ用（モジュール読み込み時に1回構築） */
export const QUESTION_ID_TO_LP_BLOCK: Readonly<Record<string, LpBlockKey>> =
  buildQuestionIdToBlockMap();

/**
 * 設問IDをブロック種別に変換する。
 * - マップにない qID → null（無視。バケツに入れない）
 * - 空・不正 → null
 */
export function getBlockForQuestionId(
  questionId: string | undefined | null,
): LpBlockKey | null {
  if (questionId == null) return null;
  const key = String(questionId).trim().toLowerCase();
  if (!key) return null;
  return QUESTION_ID_TO_LP_BLOCK[key] ?? null;
}
