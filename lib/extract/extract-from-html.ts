/**
 * HTML から構造メタのみ抽出。見出しテキストは分類にのみ使い、出力に含めない。
 */

import type { RecommendedSectionRole } from '@/types/industry';
import type { CtaKind, ExtractedPattern, SpacingRhythm } from '@/types/lp';

const HEADING_SNIP_MAX = 120;

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** メモリ内のみ。ExtractedPattern には載せない */
function headingForClassification(raw: string): string {
  const t = stripTags(raw).slice(0, HEADING_SNIP_MAX);
  return t.toLowerCase();
}

function classifySectionRole(text: string): RecommendedSectionRole | null {
  if (/お悩み|悩み|こんな|課題|不安|よくある/.test(text)) return 'problems';
  if (/解決|選ばれる|理由|メリット|ベネフィット|強み/.test(text)) {
    if (/お客様の声|口コミ|レビュ|評価/.test(text)) return 'social_proof';
    if (/メリット|ベネフィット|選ばれる|3つ|ポイント/.test(text))
      return 'solution';
  }
  if (/サービス|事業内容|施工|対応内容|取扱|プラン一覧/.test(text)) return 'services';
  if (/料金|価格|費用|見積|プラン|明朗/.test(text)) return 'price';
  if (/お客様の声|口コミ|レビュ|事例紹介|導入事例/.test(text)) return 'social_proof';
  if (/会社概要|代表|沿革|企業情報|信頼|実績|選ばれ/.test(text)) {
    if (/お客様|声|レビュ/.test(text)) return 'social_proof';
    return 'trust';
  }
  if (/流れ|ステップ|までの流れ|ご利用の流れ/.test(text)) return 'flow';
  if (/よくある|質問|faq|q＆a|q&a/.test(text)) return 'faq';
  if (/チェック|診断|あてはまる/.test(text)) return 'diagnosis';
  if (/お問い合わせ|無料相談|お申し込み|contact/.test(text)) return 'consultation';
  if (/関連|おすすめ記事|リンク/.test(text)) return 'related';
  return null;
}

function detectHero(html: string): boolean {
  return /<h1[^>]*>/i.test(html);
}

function extractH2Sections(html: string): string[] {
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const snippet = m[1] ?? '';
    out.push(headingForClassification(snippet));
  }
  return out;
}

function buildSectionSequence(html: string): RecommendedSectionRole[] {
  const seq: RecommendedSectionRole[] = [];
  if (detectHero(html)) seq.push('hero');
  for (const h2 of extractH2Sections(html)) {
    const role = classifySectionRole(h2);
    if (role) seq.push(role);
  }
  const tailText = headingForClassification(html.slice(Math.max(0, html.length * 0.75)));
  if (/お問い合わせ|無料相談|footer|フッター/.test(tailText) && !seq.includes('consultation')) {
    seq.push('consultation');
  }
  if (!seq.includes('footer') && /<footer[\s>]/i.test(html)) seq.push('footer');

  const deduped: RecommendedSectionRole[] = [];
  for (const r of seq) {
    if (deduped.length && deduped[deduped.length - 1] === r) continue;
    deduped.push(r);
  }
  return deduped;
}

function detectCtaKinds(html: string): CtaKind[] {
  const out: CtaKind[] = [];
  if (/href\s*=\s*["']tel:/i.test(html) || /電話で|お電話はこちら/i.test(html)) out.push('tel');
  if (/<form[\s>]/i.test(html)) out.push('form');
  if (/line\.me|line-official|line\.jp|line友だち/i.test(html)) out.push('line');
  if (/mailto:/i.test(html)) out.push('email');
  if (/チャット|chat-widget|intercom/i.test(html)) out.push('chat');
  if (/無料相談|お問い合わせ|資料請求|申し込み/i.test(html)) out.push('generic_link');
  return [...new Set(out)];
}

function detectTrustBlockKinds(html: string): string[] {
  const kinds: string[] = [];
  if (/創業|設立|周年|年の実績/i.test(html)) kinds.push('years');
  if (/\d+\s*件|実績|導入企業|対応件数/i.test(html)) kinds.push('cases');
  if (/★|星[0-5]|レビュ|評価|口コミ/i.test(html)) kinds.push('reviews');
  if (/認定|許可|資格|所属|〇〇協会/i.test(html)) kinds.push('credentials');
  if (/パートナー|提携|取引先|ロゴ/i.test(html)) kinds.push('partner_logos');
  return [...new Set(kinds)];
}

function countBenefitBlocks(html: string): number {
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = headingForClassification(m[1] ?? '');
    if (/メリット|ベネフィット|選ばれる|理由|ポイント|3つ/.test(t)) n += 1;
  }
  return n;
}

function maxHeadingLevel(html: string): number {
  let max = 0;
  const re = /<h([1-6])[\s>]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const lv = parseInt(m[1]!, 10);
    if (lv > max) max = lv;
  }
  return max || 2;
}

function guessRhythm(html: string): SpacingRhythm | undefined {
  const h2count = (html.match(/<h2[\s>]/gi) ?? []).length;
  const approxLen = html.length;
  if (h2count >= 6 && approxLen > 80_000) return 'airy';
  if (h2count >= 4 && approxLen > 45_000) return 'comfortable';
  if (h2count <= 2) return 'compact';
  return 'comfortable';
}

export function extractPatternFromHtml(
  html: string,
  sourceUrl: string,
): ExtractedPattern {
  const now = new Date().toISOString();
  return {
    source_url: sourceUrl,
    extracted_at: now,
    section_sequence: buildSectionSequence(html),
    cta_kinds_found: detectCtaKinds(html),
    trust_block_kinds: detectTrustBlockKinds(html),
    benefit_block_count: countBenefitBlocks(html),
    heading_max_level: maxHeadingLevel(html),
    rhythm_label: guessRhythm(html),
  };
}
