import type { LpViewModel } from '@/app/lib/lp-template';
import type { LpDiagramFlags } from '@/app/lib/lp-design-layer/schema';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Problem（#problems）内末尾に差し込むチェック風リスト（既存コピーは変更しない） */
export function renderChecklistDiagramBlock(): string {
  return `<div class="lp-diagram lp-diagram--checklist" data-lp-diagram="checklist">
    <p class="lp-diagram__title">ご依頼前の確認ポイント</p>
    <ul class="lp-diagram__list">
      <li>お悩みの範囲（場所・サイズ感）が整理できている</li>
      <li>希望の時期・急ぎの有無が分かる</li>
      <li>連絡手段（電話・フォーム）のどちらでも相談できる</li>
    </ul>
  </div>`;
}

/** Service 内の簡易比較（装飾のみ・固定的な対比表現） */
export function renderCompareDiagramBlock(): string {
  return `<div class="lp-diagram lp-diagram--compare" data-lp-diagram="compare">
    <p class="lp-diagram__title">見極めのポイント</p>
    <div class="lp-diagram__compare">
      <div class="lp-diagram__compare-col lp-diagram__compare-col--a">
        <span class="lp-diagram__compare-label">当社の姿勢</span>
        <p>事前説明と透明性を重視し、進め方を確認しながら対応します。</p>
      </div>
      <div class="lp-diagram__compare-col lp-diagram__compare-col--b">
        <span class="lp-diagram__compare-label">ご注意</span>
        <p>条件や範囲が曖昧なまま進むと、認識違いが起きやすくなります。</p>
      </div>
    </div>
  </div>`;
}

/** Trust 内の数値強調（view の実データを再利用、新コピーは最小） */
export function renderStatsDiagramBlock(view: LpViewModel): string {
  return `<div class="lp-diagram lp-diagram--stats" data-lp-diagram="stats">
    <p class="lp-diagram__title">数字で見るポイント</p>
    <div class="lp-diagram__stats">
      <div class="lp-diagram__stat"><span class="lp-diagram__stat-value">${esc(view.trustYears)}</span><span class="lp-diagram__stat-label">実績・年数</span></div>
      <div class="lp-diagram__stat"><span class="lp-diagram__stat-value">${esc(view.trustCases)}</span><span class="lp-diagram__stat-label">対応件数</span></div>
      <div class="lp-diagram__stat"><span class="lp-diagram__stat-value">${esc(view.areaName)}</span><span class="lp-diagram__stat-label">対応エリア</span></div>
    </div>
  </div>`;
}

/** CTA 直前のフロー補助（3 ステップ・汎用） */
export function renderFlowDiagramBlock(): string {
  return `<div class="lp-diagram lp-diagram--flow" data-lp-diagram="flow">
    <p class="lp-diagram__title">ご相談の流れ（目安）</p>
    <ol class="lp-diagram__flow">
      <li><span class="lp-diagram__flow-step">1</span> お問い合わせ・現状のヒアリング</li>
      <li><span class="lp-diagram__flow-step">2</span> ご提案・条件のすり合わせ</li>
      <li><span class="lp-diagram__flow-step">3</span> ご納得いただいたうえで着手</li>
    </ol>
  </div>`;
}

export type DiagramSnippets = {
  problemsAppend: string;
  servicesAppend: string;
  trustAppend: string;
  beforeCtaSecond: string;
};

export function buildDiagramSnippets(
  flags: LpDiagramFlags,
  view: LpViewModel,
): DiagramSnippets {
  return {
    problemsAppend: flags.checklist ? renderChecklistDiagramBlock() : '',
    servicesAppend: flags.compare ? renderCompareDiagramBlock() : '',
    trustAppend: flags.stats ? renderStatsDiagramBlock(view) : '',
    beforeCtaSecond: flags.flow ? renderFlowDiagramBlock() : '',
  };
}
