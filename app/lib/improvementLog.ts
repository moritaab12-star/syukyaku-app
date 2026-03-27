/**
 * improvement_log の型定義とヘルパー
 * Perplexity連携・WordPress投稿データとの紐づけを想定
 */

export type ImprovementLogEntry = {
  impressions?: number;
  clicks?: number;
  conversions?: number;
  ctr?: number;
  cv_rate?: number;
  last_updated?: string; // ISO8601
};

export type ImprovementLog = ImprovementLogEntry;

export const EMPTY_IMPROVEMENT_LOG: ImprovementLog = {};

/**
 * 空の improvement_log を返す
 */
export function createEmptyImprovementLog(): ImprovementLog {
  return { ...EMPTY_IMPROVEMENT_LOG };
}

/**
 * 最後の更新日時を更新したログを返す
 */
export function withLastUpdated(entry: ImprovementLog): ImprovementLog {
  return {
    ...entry,
    last_updated: new Date().toISOString(),
  };
}
