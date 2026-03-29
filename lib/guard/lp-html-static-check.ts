import type {
  LpHtmlGuardFinding,
  LpHtmlGuardReport,
} from '@/types/lp-guard';
import { stripHtmlToPlainText } from './html-text';
import {
  charTrigramSet,
  maxSharedSubstringLengthCompact,
  trigramOverlapCoefficient,
} from './ngram-similarity';

export type RunLpHtmlGuardsOpts = {
  /** 最低 CTA タッチポイント数（既定 3） */
  minCtaTouchpoints?: number;
  /** 最低セクション相当ブロック数（既定 5） */
  minSections?: number;
  /** 参照 HTML（調査時のスナップショット）。未指定なら n-gram / 長文一致はスキップ */
  referenceHtml?: string;
  /** トライグラム重なりがこの値を超えたら warning */
  trigramWarnThreshold?: number;
  /** これ以上の共通連続部分（空白除く）があれば warning */
  longSubstringWarnMin?: number;
};

function countLpBtnOpeningTags(html: string): number {
  const m = html.match(/<a\b[^>]*\blp-btn\b[^>]*>|<button\b[^>]*\blp-btn\b[^>]*>/gi);
  return m?.length ?? 0;
}

function countTelLinks(html: string): number {
  return (html.match(/href\s*=\s*["']tel:/gi) ?? []).length;
}

function countForms(html: string): number {
  return (html.match(/<form\b/gi) ?? []).length;
}

function hasLineHint(html: string): boolean {
  return /line\.me|line-official|line\.jp/i.test(html);
}

function countSectionLikeBlocks(html: string): number {
  const sections = (html.match(/<section\b/gi) ?? []).length;
  const hero = (html.match(/<header\b[^>]*\blp-hero\b/gi) ?? []).length;
  const footer = (html.match(/<footer\b[^>]*\blp-section\b/gi) ?? []).length;
  return sections + hero + footer;
}

/** インライン multi-column の稚拙な検出（LP HTML に無ければ OK） */
function mobileSingleColumnHintOk(html: string): boolean {
  if (/grid-template-columns\s*:\s*repeat\s*\(\s*[2-9]/i.test(html)) {
    return false;
  }
  if (/display\s*:\s*grid[^;]{0,120};\s*[^}]{0,80}grid-template-columns\s*:\s*1fr\s+1fr/i.test(html)) {
    return false;
  }
  return true;
}

/**
 * 生成直後・CI 用の静的ガード。error は minCta / minSections 未達など。
 */
export function runLpHtmlGuards(
  bodyInnerHtml: string,
  opts: RunLpHtmlGuardsOpts = {},
): LpHtmlGuardReport {
  const minCta = opts.minCtaTouchpoints ?? 3;
  const minSec = opts.minSections ?? 5;
  const trigramTh = opts.trigramWarnThreshold ?? 0.38;
  const longSubMin = opts.longSubstringWarnMin ?? 72;

  const lpBtn = countLpBtnOpeningTags(bodyInnerHtml);
  const tel = countTelLinks(bodyInnerHtml);
  const forms = countForms(bodyInnerHtml);
  const line = hasLineHint(bodyInnerHtml);
  const sectionLike = countSectionLikeBlocks(bodyInnerHtml);
  const mobileOk = mobileSingleColumnHintOk(bodyInnerHtml);

  /** 主指標は lp-btn 数（ページ上の明示 CTA） */
  const ctaTouchpoints = lpBtn;

  const findings: LpHtmlGuardFinding[] = [];

  if (lpBtn < minCta) {
    findings.push({
      code: 'CTA_COUNT_LOW',
      severity: 'error',
      message: `lp-btn 相当のリンク数が不足: ${lpBtn}（要 ${minCta} 以上）`,
    });
  }

  if (sectionLike < minSec) {
    findings.push({
      code: 'SECTION_COUNT_LOW',
      severity: 'error',
      message: `セクション相当ブロックが不足: ${sectionLike}（要 ${minSec} 以上）`,
    });
  }

  if (!mobileOk) {
    findings.push({
      code: 'MULTI_COLUMN_INLINE_HINT',
      severity: 'warning',
      message:
        'インライン styles に複数列グリッドの示唆があります。モバイル1カラム方針を確認してください。',
    });
  }

  let trigramOverlapRatio: number | undefined;
  let longestSharedSubstringLen: number | undefined;

  const ref = opts.referenceHtml?.trim();
  if (ref && ref.length >= 48) {
    const genPlain = stripHtmlToPlainText(bodyInnerHtml, 24_000);
    const refPlain = stripHtmlToPlainText(ref, 24_000);
    const tgA = charTrigramSet(refPlain);
    const tgB = charTrigramSet(genPlain);
    trigramOverlapRatio = trigramOverlapCoefficient(tgA, tgB);
    longestSharedSubstringLen = maxSharedSubstringLengthCompact(
      refPlain,
      genPlain,
      Math.min(longSubMin, 48),
    );

    if (trigramOverlapRatio >= trigramTh) {
      findings.push({
        code: 'HIGH_TRIGRAM_OVERLAP',
        severity: 'warning',
        message: `参照テキストとのトライグラム重なりが高めです: ${trigramOverlapRatio.toFixed(
          3,
        )}（閾値 ${trigramTh}）。コピペでないか確認してください。`,
      });
    }

    if (longestSharedSubstringLen >= longSubMin) {
      findings.push({
        code: 'LONG_SHARED_SUBSTRING',
        severity: 'warning',
        message: `参照と ${longestSharedSubstringLen} 文字前後の連続一致があります。`,
      });
    }
  }

  const hasError = findings.some((f) => f.severity === 'error');

  return {
    findings,
    metrics: {
      cta_touchpoints: ctaTouchpoints,
      lp_btn_elements: lpBtn,
      tel_links: tel,
      forms,
      line_hint: line,
      section_like_blocks: sectionLike,
      mobile_single_column_hint_ok: mobileOk,
      trigram_overlap_ratio: trigramOverlapRatio,
      longest_shared_substring_len: longestSharedSubstringLen,
    },
    ok: !hasError,
  };
}
