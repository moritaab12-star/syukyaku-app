/**
 * 日付文字列（YYYY-MM-DD）をシードにしたシャッフル。同じ日なら同じ順序。
 */
export function seededShuffle<T>(array: T[], seed: string): T[] {
  const arr = [...array];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  const rng = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 2 ** 32;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function getTodaySeed(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}
