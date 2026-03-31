/**
 * LP 全文パック用: アンケ回答の軽量最適化（LLM 追加呼び出しなし）。
 * - ノイズとなる重複文末・typo 系を緩く除去
 * - 長文は句点優先で切り詰め
 */

function collapseDuplicateStockPhrases(s: string): string {
  let t = s;
  const phrases = [
    'ご安心ください',
    'お気軽にご相談ください',
    'まずはお気軽にご相談ください',
    'お任せください',
    '安心してお任せください',
  ];
  for (const p of phrases) {
    if (p.length < 4) continue;
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${esc})(\\s*[、,．.]?\\s*\\1)+`, 'g');
    t = t.replace(re, '$1');
  }
  return t;
}

/** 隣接する同一文（句点区切り）を 1 回にまとめる */
function dedupeAdjacentSentences(s: string): string {
  if (!s.includes('。')) return s;
  const hadTerminalPeriod = s.trim().endsWith('。');
  const parts = s.split('。').map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return s;
  const out: string[] = [];
  for (const p of parts) {
    const prev = out[out.length - 1];
    if (prev !== undefined && prev === p) continue;
    out.push(p);
  }
  if (out.length === 0) return s;
  const body = out.join('。');
  return hadTerminalPeriod ? `${body}。` : body;
}

/**
 * アンケ生テキスト向けの安全な正規化（意味変更を避けつつノイズのみ落とす）
 */
export function normalizeSurveyAnswerForLpPack(input: string): string {
  let s = (input ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!s) return '';

  s = s.replace(/になりますになります/g, 'になります');
  s = s.replace(/ですのでですので/g, 'ですので');
  s = s.replace(/ますです/g, 'です');
  s = collapseDuplicateStockPhrases(s);
  s = dedupeAdjacentSentences(s);
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

/**
 * 最大文字数内に収める。可能なら最後の「。」で切って読み切りやすくする。
 */
export function trimSurveyAnswerSmart(text: string, maxChars: number): string {
  const t = text.trim();
  if (!t) return '';
  if (t.length <= maxChars) return t;

  let cut = t.slice(0, maxChars);
  const lastPeriod = cut.lastIndexOf('。');
  const minKeep = Math.floor(maxChars * 0.45);
  if (lastPeriod >= minKeep) {
    cut = cut.slice(0, lastPeriod + 1);
  }
  return `${cut.endsWith('…') ? cut : `${cut}…`}`;
}
