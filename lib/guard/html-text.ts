/**
 * ガード用の軽量テキスト化（構造・類似度のみ。長文保管禁止方針に沿い呼び出し側で長さ制限可）
 */

export function stripHtmlToPlainText(html: string, maxChars = 50_000): string {
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t.length > maxChars ? t.slice(0, maxChars) : t;
}
