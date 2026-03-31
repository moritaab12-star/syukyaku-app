import type { CompanyInfoDisplay } from './companyInfoFormatter';
import type { LpViewModel } from './lp-template';
import type { LpUiCopy } from './lp-ui-copy';
import type { RecommendedSectionRole } from '@/types/industry';
import type { GeneratedLp, LpGenerationRule } from '@/types/lp';
import { buildLocalBusinessJsonLd } from './buildLocalBusinessJsonLd';
import { LP_REVEAL_ATTR } from './lpRevealAttr';
import { getLpHtmlSectionCopy } from './lp-industry';
import type { LpDesignRow } from '@/app/lib/lp-design-layer/schema';
import { buildDiagramSnippets } from '@/app/lib/lp-design-layer/diagram-snippets';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function insertAllBlocksBeforeFooter(chunks: string[], allBlocksHtml: string): string[] {
  const insert = allBlocksHtml.trim();
  if (!insert) return chunks;
  const fi = chunks.findIndex((c) => c.includes('id="lp-footer"'));
  if (fi === -1) return [...chunks, insert];
  const copy = chunks.slice();
  copy.splice(fi, 0, insert);
  return copy;
}

/** `LpGenerationRule.section_order` に従いレジストリの HTML を並べる（診断/相談は1ブロックに統合） */
function orderBodyByGenerationRule(
  sectionOrder: RecommendedSectionRole[],
  registry: Partial<Record<RecommendedSectionRole, string>>,
  allBlocksHtml: string,
): string {
  const out: string[] = [];
  let diagnosisEmitted = false;
  for (const role of sectionOrder) {
    if (role === 'diagnosis' || role === 'consultation') {
      if (!diagnosisEmitted) {
        const block = registry.diagnosis;
        if (block?.trim()) out.push(block);
        diagnosisEmitted = true;
      }
      continue;
    }
    const block = registry[role];
    if (block?.trim()) out.push(block);
  }
  return insertAllBlocksBeforeFooter(out, allBlocksHtml)
    .filter((s) => s.trim().length > 0)
    .join('\n');
}

export type LpToHtmlInput = {
  view: LpViewModel;
  company: CompanyInfoDisplay;
  projectType: string | null;
  diagnosisModeTitle: string;
  pageUrl?: string;
  /**
   * HTMLテンプレート（構成差分用）
   * - cv: CV重視型（標準 / 既存の順序に最も近い）
   * - trust: 信頼重視型
   * - benefit: ベネフィット訴求型
   */
  template?: 'cv' | 'trust' | 'benefit';
  /** template 未指定時のランダム選択 seed（未指定なら pageUrl から安定生成） */
  templateSeed?: number;
  /** Supabase 等の公開 URL。あればヒーロー `<img>`、なければプレースホルダ */
  heroImageUrl?: string | null;
  /** projects.lp_ui_copy をパースしたもの。あれば CTA・悩み/診断ブロック等を差し替え */
  uiCopy?: LpUiCopy | null;
  /** Phase 4–5: 調査ベースのセクション順。指定時はセクションをこの順に並べ替え（中身は既存マークアップ） */
  generationRule?: LpGenerationRule | null;
  /** 生成層の出力。title/subtitle/faq を view に上書きしてから HTML を組む */
  generatedLp?: GeneratedLp | null;
  /**
   * デザイン戦略レイヤー（コピー用 mode とは独立）。
   * 指定時のみ既存セクション内に図解ブロックを差し込む。未指定は差し込まない。
   */
  designLayer?: LpDesignRow | null;
};

/**
 * JSON-LD script と `.lp-body` 内に置くセクション HTML（マークアップのみ）。
 * Next の `/p/[slug]` は外側で `<div class="lp-body">` を抱え globals でスタイルを読む。
 * 旧: 外部ホスト向けに `<style>` 付き全文を出す用途は削除済み（`lp-body.css` は Next のみバンドル）。
 */
export function buildLpHtmlMarkup(input: LpToHtmlInput): {
  jsonLdScript: string;
  bodyInner: string;
} {
  const { company, projectType, diagnosisModeTitle, pageUrl, heroImageUrl } = input;
  const view: LpViewModel = (() => {
    const v = input.view;
    const g = input.generatedLp;
    if (!g) return v;
    return {
      ...v,
      headline: (g.title ?? '').trim() || v.headline,
      subheadline: (g.subtitle ?? '').trim() || v.subheadline,
      faqItems:
        Array.isArray(g.faq) && g.faq.length > 0
          ? g.faq.map((x) => ({ q: x.q, a: x.a }))
          : v.faqItems,
    };
  })();
  const designDiagrams = input.designLayer
    ? buildDiagramSnippets(input.designLayer.diagram_flags, view)
    : {
        problemsAppend: '',
        servicesAppend: '',
        trustAppend: '',
        beforeCtaSecond: '',
      };
  const u = input.uiCopy ?? undefined;
  const resolvedDiagnosisTitle =
    typeof view.diagnosisSectionTitleOverride === 'string' &&
    view.diagnosisSectionTitleOverride.trim().length > 0
      ? view.diagnosisSectionTitleOverride.trim()
      : diagnosisModeTitle;

  const ld = buildLocalBusinessJsonLd({ company, view, pageUrl });
  const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;

  const badgeLabel = u?.hero_badge_label?.trim()
    ? esc(u.hero_badge_label.trim())
    : `${esc(view.areaName)}の${projectType === 'saas' ? 'SaaS・Webサービス' : '専門サービス'}`;

  const lineBtnLabel = u?.line_cta_label?.trim() || 'LINEで相談する';

  const heroCta = company.hasPhone
    ? `<a href="${esc(company.phoneHref || '#')}" class="lp-btn lp-btn--primary lp-hero__cta">${esc(
        u?.hero_cta_primary_phone?.trim() || '電話で今すぐ相談する',
      )}</a>`
    : `<a href="${esc(view.ctaUrl)}" class="lp-btn lp-btn--primary lp-hero__cta">${esc(
        u?.hero_cta_primary_web?.trim() || '無料で相談してみる',
      )}</a>`;

  const heroLine = company.hasLine
    ? `<div class="lp-hero__line-wrap"><a href="${esc(
        company.lineUrl || '#',
      )}" class="lp-btn lp-btn--line lp-hero__cta">${esc(lineBtnLabel)}</a></div>`
    : '';

  const ctaSecondBtn = company.hasPhone
    ? `<a href="${esc(company.phoneHref || '#')}" class="lp-btn lp-btn--primary lp-cta-second__btn">${esc(
        u?.cta_second_primary_phone?.trim() || '電話で無料相談する',
      )}</a>`
    : `<a href="${esc(view.ctaUrl)}" class="lp-btn lp-btn--primary lp-cta-second__btn">${esc(
        u?.cta_second_primary_web?.trim() || '無料相談の空き枠を確認する',
      )}</a>`;

  const diagnosisCta = company.hasPhone
    ? `<a href="${esc(company.phoneHref || '#')}" class="lp-btn lp-btn--primary">${esc(
        u?.diagnosis_cta_phone?.trim() || '電話で無料診断を依頼する',
      )}</a>`
    : `<a href="${esc(view.ctaUrl)}" class="lp-btn lp-btn--primary">${esc(
        u?.diagnosis_cta_web?.trim() || 'まずは無料で診断を依頼する',
      )}</a>`;

  const consultationLine = company.hasLine
    ? `<a href="${esc(
        company.lineUrl || '#',
      )}" class="lp-btn lp-btn--line lp-consultation__btn">${esc(lineBtnLabel)}</a>`
    : '';

  const priceRows = view.priceRows
    .map(
      (r) =>
        `<div class="lp-price-table__row">
          <div class="lp-price-table__cell lp-price-table__cell--label">${esc(r.label)}</div>
          <div class="lp-price-table__cell">${esc(r.price)}</div>
          <div class="lp-price-table__cell">${esc(r.note)}</div>
        </div>`,
    )
    .join('');

  const faqItems = view.faqItems
    .map(
      (f) =>
        `<div class="lp-faq__item">
          <h3 class="lp-faq__question">${esc(f.q)}</h3>
          <p class="lp-faq__answer">${esc(f.a)}</p>
        </div>`,
    )
    .join('');

  const footerAddress = company.address
    ? `<p class="lp-footer__item"><strong>住所：</strong>${company.postalCode ? `(${esc(company.postalCode)}) ` : ''}${esc(company.address)}</p>`
    : '';
  const footerHours = company.businessHours
    ? `<p class="lp-footer__item"><strong>営業時間：</strong>${esc(company.businessHours)}</p>`
    : '';
  const footerClosed = company.closedDays
    ? `<p class="lp-footer__item"><strong>定休日：</strong>${esc(company.closedDays)}</p>`
    : '';
  const footerArea = company.areaSummary
    ? `<p class="lp-footer__item"><strong>対応エリア：</strong>${esc(company.areaSummary)}</p>`
    : '';
  const footerPhone = company.hasPhone
    ? `<p class="lp-footer__item"><strong>電話：</strong><a href="${esc(company.phoneHref || '#')}">${esc(company.phone || '')}</a></p>`
    : '';
  const footerEmail = company.hasEmail
    ? `<p class="lp-footer__item"><strong>メール：</strong><a href="${esc(company.emailHref || '#')}">${esc(company.email || '')}</a></p>`
    : '';
  const footerLine = company.hasLine
    ? `<p class="lp-footer__item"><strong>LINE：</strong><a href="${esc(company.lineUrl || '#')}" target="_blank" rel="noopener noreferrer">友だち追加はこちら</a></p>`
    : '';

  const wpOrigin = (() => {
    try {
      return pageUrl ? new URL(pageUrl).origin : '';
    } catch {
      return '';
    }
  })();

  const sectionCopy = getLpHtmlSectionCopy(view.industryTone ?? 'general');
  const servicesSectionTitleFallback = `${view.serviceName}の${sectionCopy.servicesHeadingSuffix}`;
  const serviceCardsHtml = sectionCopy.serviceCards
    .map(
      (c) =>
        `<article class="lp-card"><h3 class="lp-card__title">${esc(c.title)}</h3><p class="lp-card__text">${esc(c.text)}</p></article>`,
    )
    .join('');
  const priceHeadHtml = sectionCopy.priceHeadLabels
    .map((label) => `<span>${esc(label)}</span>`)
    .join('');
  const flowStepsHtml = sectionCopy.flowSteps
    .map(
      (step, i) =>
        `<li class="lp-flow__step"><div class="lp-flow__step-number">${i + 1}</div><div class="lp-flow__step-body"><h3 class="lp-flow__step-title">${esc(step.title)}</h3><p class="lp-flow__step-text">${esc(step.text)}</p></div></li>`,
    )
    .join('');

  /** `buildPublicLpUrl`（`seo-indexing.ts`）と同形。`pageUrl` 由来の origin では絶対 URL、未指定時は相対。 */
  const toInternalHref = (slug: string): string => {
    const s = (slug || '').trim();
    if (!s) return '#';
    const path = `/p/${encodeURIComponent(s)}/`;
    if (wpOrigin) return `${wpOrigin}${path}`;
    return path;
  };

  function hash32(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed: number) {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  const selectedTemplate = (() => {
    if (input.template) return input.template;
    if (input.generationRule) return 'cv';
    const seed =
      typeof input.templateSeed === 'number'
        ? input.templateSeed
        : hash32(String(pageUrl || view.headline || 'lp'));
    const rng = mulberry32(seed);
    const r = rng();
    if (r < 0.5) return 'cv';
    if (r < 0.75) return 'trust';
    return 'benefit';
  })();

  const inlineCta = (title: string, lead: string): string => {
    return `<section class="lp-section lp-section--muted"${LP_REVEAL_ATTR} data-cta="inline">
      <div class="lp-container">
        <h2 class="lp-section__title">${esc(title)}</h2>
        <p class="lp-section__lead">${esc(lead)}</p>
        <div class="lp-cta-row">${ctaSecondBtn}${heroLine}</div>
      </div>
    </section>`;
  };

  const renderBullets = (title: string, items: string[]): string => {
    if (!Array.isArray(items) || items.length === 0) return '';
    const lis = items
      .map((t) => `<li class="lp-list__item">${esc(t)}</li>`)
      .join('');
    return `<section class="lp-section"${LP_REVEAL_ATTR} data-block="${esc(title)}">
      <div class="lp-container">
        <h2 class="lp-section__title">${esc(title)}</h2>
        <ul class="lp-list lp-list--check">${lis}</ul>
      </div>
    </section>`;
  };

  const blocks = view.blockData;
  const blockTrustHtml = blocks ? renderBullets('信頼・実績', blocks.trustBlock) : '';
  const blockLocalHtml = blocks ? renderBullets('地域・親近感', blocks.localBlock) : '';
  const blockPainHtml = blocks ? renderBullets('ターゲットの悩み', blocks.painBlock) : '';
  const blockStrengthHtml = blocks ? renderBullets('差別化・強み', blocks.strengthBlock) : '';
  const blockStoryHtml = blocks ? renderBullets('エピソード・未来', blocks.storyBlock) : '';
  const allBlocksHtml = [blockTrustHtml, blockLocalHtml, blockPainHtml, blockStrengthHtml, blockStoryHtml]
    .filter(Boolean)
    .join('\n');

  const relatedLinks = Array.isArray(view.relatedLinks) ? view.relatedLinks : [];
  const pillarLink = view.pillarLink;
  const relatedLinksHtml =
    relatedLinks.length > 0 || (pillarLink && pillarLink.slug)
      ? `<section class="lp-section lp-section--muted"${LP_REVEAL_ATTR} id="related-pages">
    <div class="lp-container">
      <h2 class="lp-section__title">あわせて読みたい</h2>
      <p class="lp-section__lead">同じ地域で、同じサービス名の公開LPをまとめました。</p>
      ${
        pillarLink && pillarLink.slug
          ? `<div class="lp-cards lp-cards--services lp-cards--mb">
        <article class="lp-card">
          <h3 class="lp-card__title"><a href="${esc(toInternalHref(pillarLink.slug))}">${esc(pillarLink.title)}</a></h3>
          <p class="lp-card__text">${esc(view.areaName)} × ${esc(view.serviceName)} の総合ガイド</p>
        </article>
      </div>`
          : ''
      }
      <div class="lp-cards lp-cards--services">
        ${relatedLinks
          .slice(0, 5)
          .map((l) => {
            const href = toInternalHref(l.slug);
            const meta = `${esc(l.area)} × ${esc(l.service)}`;
            return `<article class="lp-card">
              <h3 class="lp-card__title"><a href="${esc(href)}">${esc(l.title)}</a></h3>
              <p class="lp-card__text">${meta}</p>
            </article>`;
          })
          .join('')}
      </div>
    </div>
  </section>`
      : '';

  const heroUrl = typeof heroImageUrl === 'string' ? heroImageUrl.trim() : '';
  const heroVisual =
    heroUrl.length > 0
      ? `<img src="${esc(heroUrl)}" alt="${esc(view.headline)}" class="lp-hero__image-img" width="1200" height="675" decoding="async" loading="eager" />`
      : `<div class="lp-hero__image-placeholder">ここにメインイメージが入ります</div>`;

  const heroSection = `<header class="lp-hero" id="hero"${LP_REVEAL_ATTR} data-template="${esc(selectedTemplate)}">
    <div class="lp-container lp-hero__inner">
      <div class="lp-hero__badge"><span class="lp-hero__badge-label">${badgeLabel}</span></div>
      <div>
        <h1 class="lp-hero__title">${esc(view.headline)}</h1>
        <p class="lp-hero__subtitle">${esc(view.subheadline)}</p>
        <div class="lp-hero__meta">
          <span class="lp-hero__meta-item">${esc(
            u?.hero_meta_line_1?.trim() || `対応エリア：${view.areaName}`,
          )}</span>
          <span class="lp-hero__meta-item">${esc(
            u?.hero_meta_line_2?.trim() || `運営：${view.serviceName}`,
          )}</span>
        </div>
        <div class="lp-hero__cta-wrap">${heroCta}${heroLine}
          <p class="lp-hero__cta-note">${esc(
            u?.hero_cta_note?.trim() ||
              '「まだ検討中…」という段階でもお気軽にご相談ください。',
          )}</p>
        </div>
      </div>
      <div class="lp-hero__image">${heroVisual}</div>
    </div>
  </header>`;

  const problemsBulletsDefault = [
    'どこに依頼すべきか分からない',
    '費用の相場が見えず不安',
    '信頼できる業者を探している',
  ] as const;
  const problemsBullets: readonly string[] =
    u?.problems_bullets?.length === 3
      ? u.problems_bullets
      : problemsBulletsDefault;
  const problemsSection = `<section class="lp-section lp-section--muted"${LP_REVEAL_ATTR} id="problems">
    <div class="lp-container">
      <h2 class="lp-section__title">${esc(
        u?.problems_title?.trim() || 'こんなお悩みはありませんか？',
      )}</h2>
      <p class="lp-section__lead">${esc(
        u?.problems_lead?.trim() ||
          `${view.areaName}でサービスをご検討中の方から、よくいただくお悩みです。`,
      )}</p>
      <ul class="lp-list lp-list--problems">
        ${problemsBullets.map((t) => `<li class="lp-list__item">${esc(t)}</li>`).join('')}
      </ul>
      ${designDiagrams.problemsAppend}
    </div>
  </section>`;

  const solutionTitle =
    u?.solution_section_title?.trim() ||
    `そのお悩み、${view.serviceName}が解決します`;
  const solutionLeadFinal =
    u?.solution_lead_body?.trim() ||
    sectionCopy.solutionLead.replace(/\{area\}/g, view.areaName);
  const solutionBulletsList =
    u?.solution_bullets &&
    Array.isArray(u.solution_bullets) &&
    u.solution_bullets.length > 0
      ? u.solution_bullets
      : sectionCopy.solutionBullets;
  const solutionBulletsHtml = solutionBulletsList
    .map((t) => `<li class="lp-list__item">${esc(t)}</li>`)
    .join('');

  const solutionSection = `<section class="lp-section"${LP_REVEAL_ATTR} id="solution">
    <div class="lp-container">
      <h2 class="lp-section__title">${esc(solutionTitle)}</h2>
      <div class="lp-solution">
        <p class="lp-solution__text">${esc(solutionLeadFinal)}</p>
        <ul class="lp-list lp-list--check">
          ${solutionBulletsHtml}
        </ul>
      </div>
    </div>
  </section>`;

  const servicesTitleFinalRaw =
    u?.services_section_title?.trim() || servicesSectionTitleFallback;
  const serviceCardsHtmlFinal =
    u?.service_cards &&
    Array.isArray(u.service_cards) &&
    u.service_cards.length > 0
      ? u.service_cards
          .slice(0, 3)
          .map(
            (c) =>
              `<article class="lp-card"><h3 class="lp-card__title">${esc(c.title)}</h3><p class="lp-card__text">${esc(c.text)}</p></article>`,
          )
          .join('')
      : serviceCardsHtml;

  const servicesSection = `<section class="lp-section lp-section--muted"${LP_REVEAL_ATTR} id="services">
    <div class="lp-container">
      <h2 class="lp-section__title">${esc(servicesTitleFinalRaw)}</h2>
      <div class="lp-cards lp-cards--services">
        ${serviceCardsHtmlFinal}
      </div>
      ${designDiagrams.servicesAppend}
    </div>
  </section>`;

  const priceTitleFinal = u?.price_section_title?.trim() || sectionCopy.priceTitle;
  const priceLeadFinal =
    u?.price_section_lead?.trim() || sectionCopy.priceLead;
  const priceFooterNote =
    u?.price_table_footer_note?.trim() ||
    '※上記はあくまで目安です。現状を確認したうえで正式にお見積もりいたします。';

  const priceSection = `<section class="lp-section"${LP_REVEAL_ATTR} id="price">
    <div class="lp-container">
      <h2 class="lp-section__title">${esc(priceTitleFinal)}</h2>
      <p class="lp-section__lead">${esc(priceLeadFinal)}</p>
      <div class="lp-price-table">
        <div class="lp-price-table__head">${priceHeadHtml}</div>
        <div class="lp-price-table__body">${priceRows}</div>
      </div>
      <p class="lp-price-table__note">${esc(priceFooterNote)}</p>
    </div>
  </section>`;

  const trustSection = `<section class="lp-section lp-section--muted"${LP_REVEAL_ATTR} id="trust">
    <div class="lp-container">
      <h2 class="lp-section__title">会社情報・選ばれ続ける理由</h2>
      <div class="lp-trust-intro">
        <h3 class="lp-section__subtitle">${esc(company.name)}</h3>
        <p class="lp-section__lead">${esc(company.intro)}</p>
      </div>
      <div class="lp-trust-metrics">
        <div class="lp-trust-metric"><div class="lp-trust-metric__value">${esc(view.trustYears)}</div><div class="lp-trust-metric__label">創業年数</div></div>
        <div class="lp-trust-metric"><div class="lp-trust-metric__value">${esc(view.trustCases)}</div><div class="lp-trust-metric__label">累計対応件数</div></div>
        <div class="lp-trust-metric"><div class="lp-trust-metric__value">${esc(
          u?.trust_metric_area_label?.trim() || view.areaName,
        )}</div><div class="lp-trust-metric__label">対応エリア</div></div>
      </div>
      <div class="lp-reviews">
        <div class="lp-review"><div class="lp-review__rating">★★★★★</div><p class="lp-review__text">「${esc(
          u?.trust_review_1_text?.trim() ||
            '問い合わせから完了まで、とても丁寧に対応してもらえました。',
        )}」</p><p class="lp-review__meta">${esc(
          u?.trust_review_1_meta?.trim() ||
            `${view.areaName} / 個人のお客様`,
        )}</p></div>
        <div class="lp-review"><div class="lp-review__rating">★★★★☆</div><p class="lp-review__text">「${esc(
          u?.trust_review_2_text?.trim() ||
            '料金やスケジュールも分かりやすく、安心して依頼できました。',
        )}」</p><p class="lp-review__meta">${esc(
          u?.trust_review_2_meta?.trim() ||
            `${view.areaName} / 事業者様`,
        )}</p></div>
      </div>
      ${designDiagrams.trustAppend}
    </div>
  </section>`;

  const flowStepsHtmlFinal =
    u?.flow_steps && u.flow_steps.length > 0
      ? u.flow_steps
          .slice(0, 5)
          .map(
            (step, i) =>
              `<li class="lp-flow__step"><div class="lp-flow__step-number">${i + 1}</div><div class="lp-flow__step-body"><h3 class="lp-flow__step-title">${esc(step.title)}</h3><p class="lp-flow__step-text">${esc(step.text)}</p></div></li>`,
          )
          .join('')
      : flowStepsHtml;
  const flowTitleFinal =
    u?.flow_section_title?.trim() || sectionCopy.flowTitle;

  const flowSection = `<section class="lp-section"${LP_REVEAL_ATTR} id="flow">
    <div class="lp-container">
      <h2 class="lp-section__title">${esc(flowTitleFinal)}</h2>
      <ol class="lp-flow">
        ${flowStepsHtmlFinal}
      </ol>
    </div>
  </section>`;

  const faqSection = `<section class="lp-section lp-section--muted"${LP_REVEAL_ATTR} id="faq">
    <div class="lp-container">
      <h2 class="lp-section__title">よくあるご質問</h2>
      <div class="lp-faq">${faqItems}</div>
    </div>
  </section>`;

  const ctaSecondSection = `${designDiagrams.beforeCtaSecond}<section class="lp-section lp-cta-second"${LP_REVEAL_ATTR} id="cta-second">
    <div class="lp-container lp-cta-second__inner">
      <h2 class="lp-cta-second__title">${esc(
        u?.cta_second_title?.trim() || 'まずはお気軽にご相談ください',
      )}</h2>
      <p class="lp-cta-second__text">${esc(
        u?.cta_second_lead?.trim() ||
          '「まだ検討段階だけど話だけ聞きたい」という方も歓迎です。専門スタッフが丁寧にお答えします。',
      )}</p>
      ${ctaSecondBtn}
      <p class="lp-cta-second__note">${esc(
        u?.cta_second_note?.trim() ||
          '※強引な営業やしつこい勧誘は一切行いません。',
      )}</p>
    </div>
  </section>`;

  const diagnosisItemsDefault = [
    '気になっているが、誰に相談すべきか分からない',
    '過去に見積もりを取ったが、そのままになっている',
    'いつか対応しなければと思いつつ、後回しになっている',
  ] as const;
  const diagnosisCheckItems: readonly string[] =
    u?.diagnosis_check_items?.length === 3
      ? u.diagnosis_check_items
      : diagnosisItemsDefault;
  const diagnosisLeadRaw =
    u?.diagnosis_lead?.trim() ||
    '以下のチェック項目に3つ以上当てはまる場合は、早めのご相談をおすすめします。';
  const diagnosisLeadHtml = diagnosisLeadRaw.includes('3つ以上')
    ? diagnosisLeadRaw
        .split('3つ以上')
        .map((p) => esc(p))
        .join('<span class="lp-text--emphasis">3つ以上</span>')
    : esc(diagnosisLeadRaw);
  const diagnosisSection = `<section class="lp-section lp-section--muted"${LP_REVEAL_ATTR} id="diagnosis-consultation" data-mode="${esc(view.diagnosisMode)}">
    <div class="lp-container">
      <h2 class="lp-section__title">${esc(resolvedDiagnosisTitle)}</h2>
      <div class="lp-diagnosis" data-role="diagnosis">
        <p class="lp-section__lead">${diagnosisLeadHtml}</p>
        <ul class="lp-list lp-list--check lp-diagnosis__list">
          ${diagnosisCheckItems.map((t) => `<li class="lp-list__item">${esc(t)}</li>`).join('')}
        </ul>
        <div class="lp-diagnosis__cta">${diagnosisCta}</div>
      </div>
      <div class="lp-consultation" data-role="consultation">
        <p class="lp-section__lead">${esc(
          u?.consultation_lead?.trim() ||
            '具体的に決まっていなくても構いません。まずは無料でご相談ください。',
        )}</p>
        <div class="lp-consultation__options">
          <a href="${esc(view.ctaUrl)}" class="lp-btn lp-btn--primary lp-consultation__btn">${esc(
            u?.consultation_form_cta?.trim() || 'フォームで無料相談する',
          )}</a>
          ${consultationLine}
        </div>
        <p class="lp-consultation__note">${esc(
          u?.consultation_note?.trim() ||
            `※しつこい営業は一切行いません。${view.areaName}エリア限定で丁寧に対応いたします。`,
        )}</p>
      </div>
    </div>
  </section>`;

  const footerSection = `<footer class="lp-section lp-section--muted"${LP_REVEAL_ATTR} id="lp-footer">
    <div class="lp-container">
      <div class="lp-footer__inner">
        <h2 class="lp-section__title">${esc(company.name)}</h2>
        <p class="lp-section__lead">${esc(company.intro)}</p>
        <div class="lp-footer__grid">
          <div class="lp-footer__col">${footerAddress}${footerHours}${footerClosed}${footerArea}</div>
          <div class="lp-footer__col">${footerPhone}${footerEmail}${footerLine}</div>
        </div>
      </div>
    </div>
  </footer>`;

  const socialProofHtml = [blockTrustHtml, blockStoryHtml]
    .filter((s) => typeof s === 'string' && s.trim().length > 0)
    .join('\n');

  const sectionRegistry: Partial<Record<RecommendedSectionRole, string>> = {
    hero: heroSection,
    problems: problemsSection,
    solution: solutionSection,
    services: servicesSection,
    price: priceSection,
    trust: trustSection,
    social_proof: socialProofHtml,
    flow: flowSection,
    faq: faqSection,
    cta_mid: ctaSecondSection,
    diagnosis: diagnosisSection,
    consultation: diagnosisSection,
    related: relatedLinksHtml,
    footer: footerSection,
    custom: '',
  };

  const sectionsByTemplate: Record<typeof selectedTemplate, string[]> = {
    cv: [
      heroSection,
      problemsSection,
      solutionSection,
      servicesSection,
      priceSection,
      trustSection,
      allBlocksHtml,
      flowSection,
      faqSection,
      ctaSecondSection,
      diagnosisSection,
      relatedLinksHtml,
      footerSection,
    ],
    trust: [
      heroSection,
      trustSection,
      blockTrustHtml,
      blockLocalHtml,
      blockStrengthHtml,
      inlineCta(
        u?.trust_inline_title?.trim() || '信頼できる依頼先をお探しですか？',
        u?.trust_inline_lead?.trim() ||
          `${view.areaName}でのご相談は、まずは無料でOKです。状況に合わせてご案内します。`,
      ),
      priceSection,
      servicesSection,
      flowSection,
      faqSection,
      blockPainHtml,
      blockStoryHtml,
      ctaSecondSection,
      diagnosisSection,
      relatedLinksHtml,
      footerSection,
    ],
    benefit: [
      heroSection,
      solutionSection,
      blockPainHtml,
      blockStrengthHtml,
      blockStoryHtml,
      inlineCta(
        u?.benefit_inline_title?.trim() || sectionCopy.benefitInlineCta.title,
        u?.benefit_inline_lead?.trim() || sectionCopy.benefitInlineCta.lead,
      ),
      servicesSection,
      priceSection,
      flowSection,
      trustSection,
      faqSection,
      blockTrustHtml,
      blockLocalHtml,
      ctaSecondSection,
      diagnosisSection,
      relatedLinksHtml,
      footerSection,
    ],
  };

  const bodyInner =
    input.generationRule && input.generationRule.section_order.length > 0
      ? orderBodyByGenerationRule(
          input.generationRule.section_order,
          sectionRegistry,
          allBlocksHtml,
        )
      : sectionsByTemplate[selectedTemplate]
          .filter((s) => typeof s === 'string' && s.trim().length > 0)
          .join('\n');

  return { jsonLdScript, bodyInner };
}
