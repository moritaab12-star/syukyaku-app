/**
 * HTML から LP らしさ・業種らしさのヒューリスティック（0–1）。長文は保持しない。
 */

import type { IndustryMaster } from '@/types/industry';

function countMatches(html: string, patterns: RegExp[]): number {
  let n = 0;
  for (const re of patterns) {
    if (re.test(html)) n += 1;
  }
  return n;
}

export type HtmlScoreResult = {
  lp_likelihood_score: number;
  industry_fit_score: number;
  signals: string[];
};

export function scoreHtmlForReferencePage(
  html: string,
  master: IndustryMaster,
  context: { service?: string | null },
): HtmlScoreResult {
  const lower = html.toLowerCase();
  const signals: string[] = [];

  let lpPoints = 0;

  if (/href\s*=\s*["']tel:/i.test(html) || /電話\s*で|お電話|tel\./i.test(html)) {
    lpPoints += 0.22;
    signals.push('cta_tel');
  }
  if (/<form[\s>]/i.test(html)) {
    lpPoints += 0.2;
    signals.push('form_present');
  }
  if (/line\.me|line\.official|line-add|line友だち/i.test(html)) {
    lpPoints += 0.18;
    signals.push('line_link');
  }
  if (/無料相談|無料お見積|お問い合わせ|contact|資料請求|申し込み/i.test(html)) {
    lpPoints += 0.18;
    signals.push('cv_copy_hint');
  }
  if (/mailto:/i.test(html)) {
    lpPoints += 0.08;
    signals.push('mailto');
  }

  const h2count = (html.match(/<h2[\s>]/gi) ?? []).length;
  if (h2count >= 3) {
    lpPoints += 0.12;
    signals.push('multi_h2');
  } else if (h2count >= 2) {
    lpPoints += 0.06;
    signals.push('some_h2');
  }

  if (/料金|価格|費用|プラン|見積/i.test(html)) {
    lpPoints += 0.08;
    signals.push('price_has');
  }

  const lp_likelihood_score = Math.min(1, lpPoints);

  const service = (context.service ?? '').trim();
  let indHits = 0;
  const checks: string[] = [];
  if (service.length >= 2) {
    const escaped = service.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(escaped, 'i').test(html)) {
      indHits += 1;
      checks.push('service_in_page');
    }
  }
  for (const el of master.important_elements) {
    const t = el.trim();
    if (t.length >= 2 && html.includes(t)) {
      indHits += 1;
      checks.push(`element:${t.slice(0, 12)}`);
    }
  }
  if (master.name && master.name.length >= 2 && html.includes(master.name)) {
    indHits += 0.5;
    checks.push('master_name');
  }

  const industry_den = Math.max(
    2,
    master.important_elements.length + (service ? 1 : 0),
  );
  const industry_fit_score = Math.min(1, indHits / industry_den);

  return {
    lp_likelihood_score,
    industry_fit_score,
    signals: [...signals, ...checks.slice(0, 6)],
  };
}

/** 複合スコア（候補ソート用） */
export function combinedReferenceScore(
  lp: number,
  industry: number,
  weights = { lp: 0.65, industry: 0.35 },
): number {
  return lp * weights.lp + industry * weights.industry;
}
