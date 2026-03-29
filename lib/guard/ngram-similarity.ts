/**
 * 文字トライグラム集合の重なり（日本語・英語混在でも素朴に利用）
 */

export function charTrigramSet(text: string): Set<string> {
  const compact = text.replace(/\s/g, '');
  const set = new Set<string>();
  if (compact.length < 3) return set;
  for (let i = 0; i <= compact.length - 3; i++) {
    set.add(compact.slice(i, i + 3));
  }
  return set;
}

/** |A∩B| / min(|A|,|B|) */
export function trigramOverlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const smaller = a.size <= b.size ? a : b;
  const other = a.size <= b.size ? b : a;
  for (const x of smaller) {
    if (other.has(x)) inter += 1;
  }
  return inter / smaller.size;
}

/**
 * 空白除去後の共通部分文字列の最大長（先頭〜数KBのみ走査して CI 時間を抑える）
 */
export function maxSharedSubstringLengthCompact(
  a: string,
  b: string,
  minReport = 48,
): number {
  const sa = a.replace(/\s/g, '');
  const sb = b.replace(/\s/g, '');
  const limA = Math.min(sa.length, 6_000);
  const limB = Math.min(sb.length, 20_000);
  if (limA < minReport || limB < minReport) return 0;
  const scan = Math.min(limA, 4_000);
  for (let len = Math.min(scan, limB, 400); len >= minReport; len--) {
    for (let i = 0; i + len <= scan; i++) {
      if (sb.includes(sa.slice(i, i + len))) return len;
    }
  }
  return 0;
}
