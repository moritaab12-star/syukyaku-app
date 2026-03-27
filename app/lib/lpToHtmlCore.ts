import type { CompanyInfoDisplay } from './companyInfoFormatter';
import type { LpViewModel } from './lp-template';
import { buildLocalBusinessJsonLd } from './buildLocalBusinessJsonLd';
import { LP_REVEAL_ATTR } from './lpRevealAttr';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  const { view, company, projectType, diagnosisModeTitle, pageUrl } = input;
  const resolvedDiagnosisTitle =
    typeof view.diagnosisSectionTitleOverride === 'string' &&
    view.diagnosisSectionTitleOverride.trim().length > 0
      ? view.diagnosisSectionTitleOverride.trim()
      : diagnosisModeTitle;

  const ld = buildLocalBusinessJsonLd({ company, view, pageUrl });
  const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;

  const badgeLabel = `${esc(view.areaName)}の${projectType === 'saas' ? 'SaaS・Webサービス' : '専門サービス'}`;

  const heroCta = company.hasPhone
    ? `<a href="${esc(company.phoneHref || '#')}" class="lp-btn lp-btn--primary lp-hero__cta">電話で今すぐ相談する</a>`
    : `<a href="${esc(view.ctaUrl)}" class="lp-btn lp-btn--primary lp-hero__cta">無料で相談してみる</a>`;

  const heroLine = company.hasLine
    ? `<div class="lp-hero__line-wrap"><a href="${esc(company.lineUrl || '#')}" class="lp-btn lp-btn--line lp-hero__cta">LINEで相談する</a></div>`
    : '';

  const ctaSecondBtn = company.hasPhone
    ? `<a href="${esc(company.phoneHref || '#')}" class="lp-btn lp-btn--primary lp-cta-second__btn">電話で無料相談する</a>`
    : `<a href="${esc(view.ctaUrl)}" class="lp-btn lp-btn--primary lp-cta-second__btn">無料相談の空き枠を確認する</a>`;

  const diagnosisCta = company.hasPhone
    ? `<a href="${esc(company.phoneHref || '#')}" class="lp-btn lp-btn--primary">電話で無料診断を依頼する</a>`
    : `<a href="${esc(view.ctaUrl)}" class="lp-btn lp-btn--primary">まずは無料で診断を依頼する</a>`;

  const consultationLine = company.hasLine
    ? `<a href="${esc(company.lineUrl || '#')}" class="lp-btn lp-btn--line lp-consultation__btn">LINEで相談する</a>`
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

  const toInternalHref = (slug: string): string => {
    const s = (slug || '').trim();
    if (!s) return '#';
    if (wpOrigin) return `${wpOrigin}/${encodeURIComponent(s)}/`;
    return `/p/${encodeURIComponent(s)}`;
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
      <p class="lp-section__lead">同じ地域・同じサービスの関連情報をまとめました。</p>
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

  const heroSection = `<header class="lp-hero" id="hero"${LP_REVEAL_ATTR} data-template="${esc(selectedTemplate)}">
    <div class="lp-container lp-hero__inner">
      <div class="lp-hero__badge"><span class="lp-hero__badge-label">${badgeLabel}</span></div>
      <div>
        <h1 class="lp-hero__title">${esc(view.headline)}</h1>
        <p class="lp-hero__subtitle">${esc(view.subheadline)}</p>
        <div class="lp-hero__meta">
          <span class="lp-hero__meta-item">対応エリア：${esc(view.areaName)}</span>
          <span class="lp-hero__meta-item">運営：${esc(view.serviceName)}</span>
        </div>
        <div class="lp-hero__cta-wrap">${heroCta}${heroLine}
          <p class="lp-hero__cta-note">「まだ検討中…」という段階でもお気軽にご相談ください。</p>
        </div>
      </div>
      <div class="lp-hero__image"><div class="lp-hero__image-placeholder">ここにメインイメージが入ります</div></div>
    </div>
  </header>`;

  const problemsSection = `<section class="lp-section lp-section--muted"${LP_REVEAL_ATTR} id="problems">
    <div class="lp-container">
      <h2 class="lp-section__title">こんなお悩みはありませんか？</h2>
      <p class="lp-section__lead">${esc(view.areaName)}でサービスをご検討中の方から、よくいただくお悩みです。</p>
      <ul class="lp-list lp-list--problems">
        <li class="lp-list__item">どこに依頼すべきか分からない</li>
        <li class="lp-list__item">費用の相場が見えず不安</li>
        <li class="lp-list__item">信頼できる業者を探している</li>
      </ul>
    </div>
  </section>`;

  const solutionSection = `<section class="lp-section"${LP_REVEAL_ATTR} id="solution">
    <div class="lp-container">
      <h2 class="lp-section__title">そのお悩み、${esc(view.serviceName)}が解決します</h2>
      <div class="lp-solution">
        <p class="lp-solution__text">${esc(view.areaName)}エリアに特化したサポートで、お客様一人ひとりの状況に合わせた最適なプランをご提案します。</p>
        <ul class="lp-list lp-list--check">
          <li class="lp-list__item">専門スタッフが現状を丁寧にヒアリング</li>
          <li class="lp-list__item">複数の選択肢から最適なプランをご提示</li>
          <li class="lp-list__item">導入後も継続的なフォローで安心</li>
        </ul>
      </div>
    </div>
  </section>`;

  const servicesSection = `<section class="lp-section lp-section--muted"${LP_REVEAL_ATTR} id="services">
    <div class="lp-container">
      <h2 class="lp-section__title">${esc(view.serviceName)}のサービス内容</h2>
      <div class="lp-cards lp-cards--services">
        <article class="lp-card"><h3 class="lp-card__title">基本プラン</h3><p class="lp-card__text">はじめての方でも安心してお任せいただける、標準的なプランです。</p></article>
        <article class="lp-card"><h3 class="lp-card__title">充実サポートプラン</h3><p class="lp-card__text">アフターフォローやサポートを重視した方向けのプランです。</p></article>
        <article class="lp-card"><h3 class="lp-card__title">カスタムプラン</h3><p class="lp-card__text">課題や予算に合わせて、内容を柔軟にカスタマイズできます。</p></article>
      </div>
    </div>
  </section>`;

  const priceSection = `<section class="lp-section"${LP_REVEAL_ATTR} id="price">
    <div class="lp-container">
      <h2 class="lp-section__title">料金の目安</h2>
      <p class="lp-section__lead">状況により変動しますが、まずは目安としてご確認ください。</p>
      <div class="lp-price-table">
        <div class="lp-price-table__head"><span>プラン名</span><span>目安料金</span><span>内容</span></div>
        <div class="lp-price-table__body">${priceRows}</div>
      </div>
      <p class="lp-price-table__note">※上記はあくまで目安です。現状を確認したうえで正式にお見積もりいたします。</p>
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
        <div class="lp-trust-metric"><div class="lp-trust-metric__value">${esc(view.areaName)}</div><div class="lp-trust-metric__label">対応エリア</div></div>
      </div>
      <div class="lp-reviews">
        <div class="lp-review"><div class="lp-review__rating">★★★★★</div><p class="lp-review__text">「問い合わせから完了まで、とても丁寧に対応してもらえました。」</p><p class="lp-review__meta">${esc(view.areaName)} / 個人のお客様</p></div>
        <div class="lp-review"><div class="lp-review__rating">★★★★☆</div><p class="lp-review__text">「料金やスケジュールも分かりやすく、安心して依頼できました。」</p><p class="lp-review__meta">${esc(view.areaName)} / 事業者様</p></div>
      </div>
    </div>
  </section>`;

  const flowSection = `<section class="lp-section"${LP_REVEAL_ATTR} id="flow">
    <div class="lp-container">
      <h2 class="lp-section__title">お問い合わせから完了までの流れ</h2>
      <ol class="lp-flow">
        <li class="lp-flow__step"><div class="lp-flow__step-number">1</div><div class="lp-flow__step-body"><h3 class="lp-flow__step-title">お問い合わせ</h3><p class="lp-flow__step-text">フォームまたはLINEから、24時間いつでもお問い合わせいただけます。</p></div></li>
        <li class="lp-flow__step"><div class="lp-flow__step-number">2</div><div class="lp-flow__step-body"><h3 class="lp-flow__step-title">ヒアリング・ご提案</h3><p class="lp-flow__step-text">現状やご希望を伺い、最適なプランとお見積もりをご提示します。</p></div></li>
        <li class="lp-flow__step"><div class="lp-flow__step-number">3</div><div class="lp-flow__step-body"><h3 class="lp-flow__step-title">ご契約・実施</h3><p class="lp-flow__step-text">内容にご納得いただいたうえで、ご契約・作業へと進みます。</p></div></li>
      </ol>
    </div>
  </section>`;

  const faqSection = `<section class="lp-section lp-section--muted"${LP_REVEAL_ATTR} id="faq">
    <div class="lp-container">
      <h2 class="lp-section__title">よくあるご質問</h2>
      <div class="lp-faq">${faqItems}</div>
    </div>
  </section>`;

  const ctaSecondSection = `<section class="lp-section lp-cta-second"${LP_REVEAL_ATTR} id="cta-second">
    <div class="lp-container lp-cta-second__inner">
      <h2 class="lp-cta-second__title">まずはお気軽にご相談ください</h2>
      <p class="lp-cta-second__text">「まだ検討段階だけど話だけ聞きたい」という方も歓迎です。専門スタッフが丁寧にお答えします。</p>
      ${ctaSecondBtn}
      <p class="lp-cta-second__note">※強引な営業やしつこい勧誘は一切行いません。</p>
    </div>
  </section>`;

  const diagnosisSection = `<section class="lp-section lp-section--muted"${LP_REVEAL_ATTR} id="diagnosis-consultation" data-mode="${esc(view.diagnosisMode)}">
    <div class="lp-container">
      <h2 class="lp-section__title">${esc(resolvedDiagnosisTitle)}</h2>
      <div class="lp-diagnosis" data-role="diagnosis">
        <p class="lp-section__lead">以下のチェック項目に<span class="lp-text--emphasis">3つ以上</span>当てはまる場合は、早めのご相談をおすすめします。</p>
        <ul class="lp-list lp-list--check lp-diagnosis__list">
          <li class="lp-list__item">気になっているが、誰に相談すべきか分からない</li>
          <li class="lp-list__item">過去に見積もりを取ったが、そのままになっている</li>
          <li class="lp-list__item">いつか対応しなければと思いつつ、後回しになっている</li>
        </ul>
        <div class="lp-diagnosis__cta">${diagnosisCta}</div>
      </div>
      <div class="lp-consultation" data-role="consultation">
        <p class="lp-section__lead">具体的に決まっていなくても構いません。まずは無料でご相談ください。</p>
        <div class="lp-consultation__options">
          <a href="${esc(view.ctaUrl)}" class="lp-btn lp-btn--primary lp-consultation__btn">フォームで無料相談する</a>
          ${consultationLine}
        </div>
        <p class="lp-consultation__note">※しつこい営業は一切行いません。${esc(view.areaName)}エリア限定で丁寧に対応いたします。</p>
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
        '信頼できる依頼先をお探しですか？',
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
      inlineCta('まずは状況を聞かせてください', '最短の進め方と、無理のないプランを一緒に整理します。'),
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

  const bodyInner = sectionsByTemplate[selectedTemplate]
    .filter((s) => typeof s === 'string' && s.trim().length > 0)
    .join('\n');

  return { jsonLdScript, bodyInner };
}
