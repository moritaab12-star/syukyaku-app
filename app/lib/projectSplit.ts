/**
 * エリア × サービス単位でのプロジェクト分割ロジック
 * テスト可能な純粋関数として実装
 */

/**
 * カンマ区切り文字列をトリムして配列に分割（空要素を除去）
 */
export function parseCommaSeparated(input: string): string[] {
  if (!input || typeof input !== 'string') return [];
  return input
    .split(/[,、，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * ターゲットエリア文字列をパース
 * 例: "名古屋, 春日井, 小牧" → ["名古屋", "春日井", "小牧"]
 */
export function parseAreas(input: string): string[] {
  return parseCommaSeparated(input);
}

/**
 * 対応サービス文字列をパース
 * 例: "剪定, 伐採, 草刈り" → ["剪定", "伐採", "草刈り"]
 */
export function parseServices(input: string): string[] {
  return parseCommaSeparated(input);
}

/**
 * スラッグ用に文字列を正規化（英数字・ひらがな・カタカナ・ハイフン）
 */
function slugify(text: string): string {
  const normalized = text
    .replace(/[\s　]+/g, '-')
    .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return normalized || 'lp';
}

/**
 * 短いランダムIDを生成（衝突回避用）
 */
function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export type SplitProjectInput = {
  area: string;
  service: string;
  keyword: string;
  slug: string;
};

export type SplitProjectsParams = {
  areasInput: string;
  servicesInput: string;
  baseSlug?: string;
  /** エリア未入力時のフォールバック（raw_answers の q11 等から取得） */
  fallbackArea?: string;
  /** サービス未入力時のフォールバック（業種・サービス名から取得） */
  fallbackService?: string;
};

/**
 * エリア × サービス の直積でプロジェクト分割案を生成
 * 将来的にキーワード単位分割にも拡張しやすい構造
 * エリア・サービスのいずれかが空の場合はフォールバックで1件生成
 */
export function splitProjectsByAreaAndService(
  params: SplitProjectsParams,
): SplitProjectInput[] {
  const areas = parseAreas(params.areasInput);
  const services = parseServices(params.servicesInput);

  const effectiveAreas =
    areas.length > 0 ? areas : [params.fallbackArea || '未指定'];
  const effectiveServices =
    services.length > 0 ? services : [params.fallbackService || 'サービス'];

  if (effectiveAreas.length === 0 || effectiveServices.length === 0) {
    return [];
  }

  const base = params.baseSlug ? `${params.baseSlug}-` : '';
  const results: SplitProjectInput[] = [];
  const usedSlugs = new Set<string>();

  for (const area of effectiveAreas) {
    for (const service of effectiveServices) {
      const keyword = `${area} ${service}`;
      let slug = `${base}${slugify(area)}-${slugify(service)}`;
      while (usedSlugs.has(slug)) {
        slug = `${slug}-${shortId()}`;
      }
      usedSlugs.add(slug);

      results.push({
        area,
        service,
        keyword,
        slug,
      });
    }
  }

  return results;
}
