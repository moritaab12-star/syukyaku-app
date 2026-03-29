/**
 * Industry master（業種メタ）。
 * トーン解決ロジックは `app/lib/lp-industry.ts` に置き、ここは参照用 ID・検索・推奨構造のみ。
 */

/** `projects.industry_key` やマスター JSON の `id` と揃えるキー */
export type IndustryMasterId = string;

/**
 * セクションの「役割」スロット（抽象 ID）。
 * `buildLpHtmlMarkup` の実ブロックと 1:1 でなくてよいが、変換層でマッピングする。
 */
export type RecommendedSectionRole =
  | 'hero'
  | 'problems'
  | 'solution'
  | 'services'
  | 'price'
  | 'trust'
  | 'social_proof'
  | 'flow'
  | 'faq'
  | 'cta_mid'
  | 'diagnosis'
  | 'consultation'
  | 'related'
  | 'footer'
  | 'custom';

export type IndustryMaster = {
  id: IndustryMasterId;
  /** 表示名（管理画面・ログ用） */
  name: string;
  /**
   * 参照 LP 探索用クエリ雛形。
   * プレースホルダ: `{area}`, `{service}`, `{industryKey}`
   */
  reference_queries: string[];
  /** この業種で重要な訴求要素のラベル（抽象・コピー本文は入れない） */
  important_elements: string[];
  /** トーンの抽象ラベル（例: 誠実・安心、スピード重視） */
  tone: string;
  /** 主要 CV の型の推奨（抽象） */
  cta_type: string;
  /** フォールバックのセクション順（チャーター: 調査ルールが弱いときの補完） */
  recommended_structure: RecommendedSectionRole[];
};

/** `reference_queries` 展開時のコンテキスト */
export type ReferenceQueryContext = {
  area?: string | null;
  service?: string | null;
  industryKey?: string | null;
};
