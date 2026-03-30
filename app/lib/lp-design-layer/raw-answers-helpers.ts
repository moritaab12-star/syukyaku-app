/** raw_answers 配列から id の answer を取得 */
export function rawAnswerById(rawAnswers: unknown, qid: string): string {
  if (!Array.isArray(rawAnswers)) return '';
  for (const item of rawAnswers) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (o.id !== qid) continue;
    if (typeof o.answer === 'string') return o.answer;
    if (o.answer != null) return String(o.answer);
  }
  return '';
}

/**
 * プロンプト用の短い要約（トークン節約）。全問は並べずプレフィックスのみ。
 */
export function buildRawAnswersSummaryForDesign(
  rawAnswers: unknown,
  maxChars = 2400,
): string {
  if (!Array.isArray(rawAnswers)) return '';
  const lines: string[] = [];
  for (const item of rawAnswers) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : '';
    if (!id || !/^q\d+$/i.test(id)) continue;
    let a =
      typeof o.answer === 'string'
        ? o.answer
        : o.answer != null
          ? String(o.answer)
          : '';
    a = a.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!a) continue;
    if (a.length > 160) a = `${a.slice(0, 157)}…`;
    lines.push(`${id}: ${a}`);
  }
  const out = lines.join('\n');
  if (out.length <= maxChars) return out;
  return `${out.slice(0, maxChars - 1)}…`;
}
