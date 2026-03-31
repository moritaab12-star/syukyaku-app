/**
 * textarea「1行1項目」→ 配列。空行・前後空白を除去。
 */
export function linesToStringArray(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.normalize('NFKC').trim())
    .filter((l) => l.length > 0);
}

export function sanitizeStringList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const x of list) {
    if (typeof x !== 'string') continue;
    const t = x.normalize('NFKC').trim();
    if (t.length > 0) out.push(t);
  }
  return out;
}
