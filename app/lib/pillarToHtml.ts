import type { PillarViewModel } from './pillar';
import { LP_REVEAL_ATTR } from './lpRevealAttr';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPillarHtml(vm: PillarViewModel): string {
  const intro = vm.description
    ? `<p class="lp-section__lead">${esc(vm.description)}</p>`
    : '';

  const summary =
    Array.isArray(vm.summarySections) && vm.summarySections.length > 0
      ? `<section class="lp-section"${LP_REVEAL_ATTR} id="pillar-summary">
  <div class="lp-container">
    <h2 class="lp-section__title">まず押さえるポイント</h2>
    <ul class="lp-list lp-list--check">
      ${vm.summarySections
        .slice(0, 6)
        .map((t) => `<li class="lp-list__item">${esc(t)}</li>`)
        .join('')}
    </ul>
  </div>
</section>`
      : '';

  const worries = `<section class="lp-section lp-section--muted"${LP_REVEAL_ATTR} id="pillar-worries">
  <div class="lp-container">
    <h2 class="lp-section__title">${esc(vm.area)}で${esc(vm.service)}を検討する人の悩み</h2>
    <ul class="lp-list lp-list--problems">
      <li class="lp-list__item">費用感が分からない</li>
      <li class="lp-list__item">どこに依頼すべきか迷う</li>
      <li class="lp-list__item">追加費用や作業範囲が不安</li>
    </ul>
  </div>
</section>`;

  const points = `<section class="lp-section"${LP_REVEAL_ATTR} id="pillar-points">
  <div class="lp-container">
    <h2 class="lp-section__title">サービス選びのポイント</h2>
    <div class="lp-cards lp-cards--services">
      <article class="lp-card">
        <h3 class="lp-card__title">見積もりが具体的</h3>
        <p class="lp-card__text">作業範囲・材料・保証の条件が明確かを確認しましょう。</p>
      </article>
      <article class="lp-card">
        <h3 class="lp-card__title">実績・事例がある</h3>
        <p class="lp-card__text">同じ地域や似た条件での対応実績があると安心です。</p>
      </article>
      <article class="lp-card">
        <h3 class="lp-card__title">連絡手段と対応スピード</h3>
        <p class="lp-card__text">電話/LINE、即日対応の可否など「連絡→着手」までを確認。</p>
      </article>
    </div>
  </div>
</section>`;

  const faq =
    Array.isArray(vm.faqItems) && vm.faqItems.length > 0
      ? `<section class="lp-section lp-section--muted"${LP_REVEAL_ATTR} id="pillar-faq">
  <div class="lp-container">
    <h2 class="lp-section__title">よくある質問</h2>
    <div class="lp-faq">
      ${vm.faqItems
        .slice(0, 8)
        .map(
          (f) => `<div class="lp-faq__item">
        <h3 class="lp-faq__question">${esc(f.q)}</h3>
        <p class="lp-faq__answer">${esc(f.a)}</p>
      </div>`,
        )
        .join('')}
    </div>
  </div>
</section>`
      : '';

  const related =
    Array.isArray(vm.relatedLps) && vm.relatedLps.length > 0
      ? `<section class="lp-section"${LP_REVEAL_ATTR} id="pillar-related">
  <div class="lp-container">
    <h2 class="lp-section__title">関連ページ</h2>
    <p class="lp-section__lead">${esc(vm.area)} × ${esc(vm.service)} の関連ページ一覧です。</p>
    <div class="lp-cards lp-cards--services">
      ${vm.relatedLps
        .slice(0, 10)
        .map((l) => {
          const href = `/p/${encodeURIComponent(l.slug)}`;
          return `<article class="lp-card">
        <h3 class="lp-card__title"><a href="${esc(href)}">${esc(l.title)}</a></h3>
        <p class="lp-card__text">${esc(l.intent)}</p>
      </article>`;
        })
        .join('')}
    </div>
  </div>
</section>`
      : '';

  const companyBlock = vm.company
    ? `<section class="lp-section lp-section--muted"${LP_REVEAL_ATTR} id="pillar-company">
  <div class="lp-container">
    <h2 class="lp-section__title">運営情報</h2>
    <div class="lp-cards lp-cards--services">
      <article class="lp-card">
        <h3 class="lp-card__title">${esc(vm.company.name)}</h3>
        <p class="lp-card__text">${esc(vm.company.intro)}</p>
      </article>
    </div>
  </div>
</section>`
    : '';

  return `<div class="lp-body" data-page-type="pillar">
  <header class="lp-hero" id="hero"${LP_REVEAL_ATTR}>
    <div class="lp-container lp-hero__inner">
      <div>
        <div class="lp-hero__badge"><span class="lp-hero__badge-label">${esc(vm.area)}の${esc(vm.service)}ガイド</span></div>
        <h1 class="lp-hero__title">${esc(vm.title)}</h1>
        ${intro}
        <div class="lp-hero__meta">
          <span class="lp-hero__meta-item">対象地域：${esc(vm.area)}</span>
          <span class="lp-hero__meta-item">テーマ：${esc(vm.service)}</span>
        </div>
      </div>
      <div class="lp-hero__image"><div class="lp-hero__image-placeholder">ここにガイド用のイメージが入ります</div></div>
    </div>
  </header>

  ${summary}
  ${worries}
  ${points}
  ${faq}
  ${related}
  ${companyBlock}
</div>`;
}

