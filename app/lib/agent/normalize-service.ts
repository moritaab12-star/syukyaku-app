/**
 * projects.service の表記揺れを抑える（検索・保存・テンプレ解決で共通利用）。
 * 別名は SERVICE_NAME_ALIASES に [完全一致 → 置換先] を追加して拡張する。
 */
const SERVICE_NAME_ALIASES: ReadonlyArray<readonly [string, string]> = [
  // 例: ['不動産会社', '不動産'],
];

export function normalizeServiceName(input: string | null | undefined): string {
  if (input == null) return '';
  let s = String(input)
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');

  for (const [from, to] of SERVICE_NAME_ALIASES) {
    const fromN = String(from)
      .normalize('NFKC')
      .trim()
      .replace(/\s+/g, ' ');
    if (s === fromN) {
      s = String(to)
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ');
      break;
    }
  }
  return s;
}
