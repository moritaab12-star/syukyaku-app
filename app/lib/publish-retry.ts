import 'server-only';

export function getNextRetryAt(nextRetryCount: number, now: Date = new Date()): Date {
  const n = Math.max(1, Math.floor(nextRetryCount));
  const d = new Date(now.getTime());

  // 1回目失敗 → 30分後
  if (n === 1) d.setMinutes(d.getMinutes() + 30);
  // 2回目失敗 → 2時間後
  else if (n === 2) d.setHours(d.getHours() + 2);
  // 3回目失敗 → 翌日（24時間後）
  else if (n === 3) d.setDate(d.getDate() + 1);
  // 4回目以降は使わない（failed）
  else d.setDate(d.getDate() + 7);

  return d;
}

export function shouldMarkAsFailed(nextRetryCount: number): boolean {
  return Math.max(0, Math.floor(nextRetryCount)) >= 4;
}

