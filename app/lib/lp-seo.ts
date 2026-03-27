export type RawAnswerItem = {
  id: string;
  question: string;
  answer: string;
};

export type NormalizedRawAnswers = {
  items: RawAnswerItem[];
};

export type ExtractedLpFacts = {
  businessName: string;
  projectType: 'local' | 'saas' | 'unknown';
  region: string;
  industry: string;
  painKeywords: string[];
  strengths: string[];
  solutions: string[];
  foundingYear: string | null;
  yearsInBusiness: string | null;
  achievementNumbers: string[];
};

export type SeoShell = {
  title: string;
  metaDescription: string;
  h1: string;
};

export type JsonLdPayload = {
  '@context': 'https://schema.org';
  '@type': 'LocalBusiness' | 'Product';
  name: string;
  description?: string;
  areaServed?: {
    '@type': 'AdministrativeArea';
    name: string;
  };
  serviceType?: string;
  url?: string;
  offers?: {
    '@type': 'Offer';
    description?: string;
    price?: string;
  };
  [key: string]: unknown;
};

export type CvrShell = {
  heroHeadline: string;
  subHeadline: string;
  trustBullets: string[];
  numbers: {
    label: string;
    value: string;
  }[];
};

export type RelatedLink = {
  href: string;
  label: string;
  relation: 'same_project' | 'same_region' | 'same_theme' | 'category';
};

export type ProjectSummaryForLinks = {
  id: string;
  slug: string | null;
  company_name: string | null;
  project_type: string | null;
  raw_region?: string | null;
  raw_industry?: string | null;
};

/**
 * raw_answers が配列形式 / オブジェクト形式 / JSON文字列 のいずれでも
 * 同じ { id, question, answer }[].items に正規化する。
 */
export function normalizeRawAnswers(
  raw: unknown,
): NormalizedRawAnswers {
  const items: RawAnswerItem[] = [];

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return normalizeRawAnswers(parsed);
    } catch {
      return { items };
    }
  }

  if (Array.isArray(raw)) {
    for (const x of raw) {
      if (!x || typeof x !== 'object') continue;
      const id = String((x as any).id ?? '').trim();
      const question =
        typeof (x as any).question === 'string'
          ? (x as any).question.trim()
          : '';
      const answer =
        typeof (x as any).answer === 'string'
          ? (x as any).answer.trim()
          : '';
      if (!id && !question && !answer) continue;
      items.push({ id: id || question || String(items.length + 1), question, answer });
    }
    return { items };
  }

  if (raw && typeof raw === 'object') {
    for (const [id, answer] of Object.entries(
      raw as Record<string, unknown>,
    )) {
      const value =
        typeof answer === 'string'
          ? answer.trim()
          : typeof answer === 'number'
          ? String(answer)
          : '';
      if (!value) continue;
      items.push({ id, question: id, answer: value });
    }
  }

  return { items };
}

/**
 * 50問のうち、地域・業種・悩み・強み・実績などをざっくり抽出する。
 * 質問ラベルやIDに含まれるキーワードを手がかりにする。
 */
export function extractLpFacts(
  normalized: NormalizedRawAnswers,
  opts?: { fallbackName?: string; projectTypeHint?: 'local' | 'saas' },
): ExtractedLpFacts {
  const { items } = normalized;

  const findFirst = (pred: (item: RawAnswerItem) => boolean) =>
    items.find(pred);

  const contains = (text: string, keywords: string[]) =>
    keywords.some((k) => text.includes(k));

  const nameItem =
    findFirst((x) => /屋号|店名|サービス名|会社名/.test(x.question)) ||
    findFirst((x) => x.id === 'q1') ||
    undefined;

  const regionItem = findFirst((x) =>
    contains(x.question, ['地域', '対応エリア', 'エリア', '場所']),
  );

  const industryItem = findFirst((x) =>
    contains(x.question, ['業種', '業界', 'サービス種別']),
  );

  const pains = items.filter((x) =>
    contains(x.question, ['悩み', '課題', '問題', '困りごと']),
  );

  const strengthsItems = items.filter((x) =>
    contains(x.question, ['強み', 'こだわり', '選ばれる理由', '差別化']),
  );

  const solutionItems = items.filter((x) =>
    contains(x.question, ['解決', '提案', 'サービス内容', '提供']),
  );

  const foundingItem = findFirst((x) =>
    contains(x.question, ['創業', '年数', '歴']),
  );

  const achievementItems = items.filter((x) =>
    contains(x.question, ['実績', '件数', '施工件数', '導入件数', '利用者数']),
  );

  const numberRegex = /\d[\d,]*/g;
  const achievementNumbers: string[] = [];
  for (const it of achievementItems) {
    const matches = it.answer.match(numberRegex);
    if (matches) achievementNumbers.push(...matches.map((m) => m.replace(/,/g, '')));
  }

  const projectType: 'local' | 'saas' | 'unknown' =
    opts?.projectTypeHint ??
    (industryItem && /SaaS|SaaS・Web|クラウド|オンライン/.test(industryItem.answer)
      ? 'saas'
      : 'local');

  return {
    businessName:
      (nameItem?.answer || opts?.fallbackName || '').trim() || 'このエリアの専門店',
    projectType,
    region: (regionItem?.answer || '').trim(),
    industry: (industryItem?.answer || '').trim(),
    painKeywords: pains.map((x) => x.answer).filter(Boolean),
    strengths: strengthsItems.map((x) => x.answer).filter(Boolean),
    solutions: solutionItems.map((x) => x.answer).filter(Boolean),
    foundingYear: foundingItem?.answer ?? null,
    yearsInBusiness: null,
    achievementNumbers,
  };
}

export type SeoShellOverrides = {
  region?: string;
  industry?: string;
};

export function buildSeoShell(
  facts: ExtractedLpFacts,
  overrides?: SeoShellOverrides,
): SeoShell {
  const region = overrides?.region ?? facts.region;
  const industry = overrides?.industry ?? facts.industry;
  const parts: string[] = [];
  if (region) parts.push(region);
  if (industry) parts.push(industry);

  const mainPain = facts.painKeywords[0] || '';
  const mainStrength = facts.strengths[0] || '';

  const titleCore =
    mainPain && mainStrength
      ? `${mainPain}を${mainStrength}で解決`
      : mainPain
      ? `${mainPain}のお悩みに対応`
      : mainStrength || 'サービス案内';

  const title = `${parts.join('・') || facts.businessName}｜${titleCore}`;

  const descriptionPieces: string[] = [];
  if (facts.businessName) descriptionPieces.push(facts.businessName);
  if (region) descriptionPieces.push(`対応エリア：${region}`);
  if (industry) descriptionPieces.push(`業種：${industry}`);
  if (mainPain) descriptionPieces.push(`お悩み：「${mainPain}」`);
  if (mainStrength) descriptionPieces.push(`強み：「${mainStrength}」`);

  const metaDescription = descriptionPieces.join('／').slice(0, 150);

  const h1 =
    facts.projectType === 'saas'
      ? `${region || ''}${industry || 'SaaS'}で${mainPain || '業務効率化'}を実現する${facts.businessName}`
      : `${region || ''}の${industry || '専門店'}｜${facts.businessName}`;

  return { title, metaDescription, h1 };
}

export function buildJsonLd(
  facts: ExtractedLpFacts,
  options?: { url?: string },
): JsonLdPayload {
  const isLocal = facts.projectType !== 'saas';
  const type: 'LocalBusiness' | 'Product' = isLocal ? 'LocalBusiness' : 'Product';

  const payload: JsonLdPayload = {
    '@context': 'https://schema.org',
    '@type': type,
    name: facts.businessName,
  };

  const descBase =
    facts.strengths[0] ||
    facts.solutions[0] ||
    facts.painKeywords[0] ||
    '';
  if (descBase) {
    payload.description = descBase.slice(0, 200);
  }

  if (facts.region) {
    payload.areaServed = {
      '@type': 'AdministrativeArea',
      name: facts.region,
    };
  }

  if (facts.industry) {
    payload.serviceType = facts.industry;
  }

  if (options?.url) {
    payload.url = options.url;
  }

  if (facts.solutions[0] || facts.painKeywords[0]) {
    payload.offers = {
      '@type': 'Offer',
      description:
        facts.solutions[0] ||
        `「${facts.painKeywords[0]}」にお応えするプランをご用意しています。`,
    };
  }

  return payload;
}

export function buildCvrShell(
  facts: ExtractedLpFacts,
): CvrShell {
  const mainPain = facts.painKeywords[0] || '';
  const mainStrength = facts.strengths[0] || '';

  const heroHeadline =
    mainPain && mainStrength
      ? `${mainPain}なら、${facts.businessName}にお任せください`
      : `${facts.businessName}の${facts.industry || 'サービス'}`;

  const subHeadline =
    mainStrength && mainPain
      ? `${facts.region || ''}${facts.industry || ''}で、${mainStrength}を武器に「${mainPain}」を解決します。`
      : `${facts.region || ''}でお客様の課題に寄り添います。`;

  const trustBullets: string[] = [];
  if (facts.foundingYear) {
    trustBullets.push(`創業：${facts.foundingYear}`);
  }
  if (facts.achievementNumbers[0]) {
    trustBullets.push(`実績：${facts.achievementNumbers[0]}件以上`);
  }
  if (mainStrength) {
    trustBullets.push(mainStrength);
  }

  const numbers: { label: string; value: string }[] = [];
  if (facts.achievementNumbers[0]) {
    numbers.push({ label: '対応件数', value: facts.achievementNumbers[0] });
  }

  return { heroHeadline, subHeadline, trustBullets, numbers };
}

export function buildRelatedLinks(
  current: ProjectSummaryForLinks,
  all: ProjectSummaryForLinks[],
  basePath = '/p',
): RelatedLink[] {
  const links: RelatedLink[] = [];
  const curSlug = current.slug || current.id;

  for (const p of all) {
    const slug = p.slug || p.id;
    if (!slug || slug === curSlug) continue;

    const sameRegion =
      current.raw_region && p.raw_region && current.raw_region === p.raw_region;
    const sameTheme =
      current.raw_industry &&
      p.raw_industry &&
      current.raw_industry === p.raw_industry;

    if (sameRegion && sameTheme) {
      links.push({
        href: `${basePath}/${slug}`,
        label: `${p.company_name || '関連サービス'}（同地域・同テーマ）`,
        relation: 'same_project',
      });
    } else if (sameRegion) {
      links.push({
        href: `${basePath}/${slug}`,
        label: `${p.company_name || '関連サービス'}（同地域）`,
        relation: 'same_region',
      });
    } else if (sameTheme) {
      links.push({
        href: `${basePath}/${slug}`,
        label: `${p.company_name || '関連サービス'}（同テーマ）`,
        relation: 'same_theme',
      });
    }
  }

  // 上位カテゴリ的なリンク（一覧ページなど）は別途固定で足しやすいように relation: 'category' を定義
  return links;
}

/**
 * 将来 Gemini に渡すためのプロンプトテンプレート。
 * 実際の API 呼び出しはまだ行わない。
 */
export const GEMINI_LP_PROMPT_TEMPLATE = `
あなたはSEOとCVRに強いランディングページ設計者です。
以下の raw_answers 配列（50問への回答）を元に、LPのメタ情報と構造を設計してください。

raw_answers は次の形式です：
[{ "id": "q1", "question": "質問内容", "answer": "ユーザーの回答" }, ...]

出力では、次の項目を JSON 形式で返してください（本文テキストは短めの要約で構いません）：
{
  "seo": {
    "title": "...",
    "metaDescription": "...",
    "h1": "..."
  },
  "hero": {
    "headline": "...",
    "subHeadline": "...",
    "bullets": ["...", "..."]
  },
  "trustSection": {
    "numbers": [
      { "label": "施工実績", "value": "123" },
      { "label": "創業年数", "value": "20年" }
    ],
    "notes": "..."
  },
  "sections": [
    {
      "id": "pain",
      "title": "こんなお悩みはありませんか？",
      "summary": "...",
      "bulletPoints": ["...", "..."]
    },
    {
      "id": "solution",
      "title": "当社の解決策",
      "summary": "...",
      "bulletPoints": ["...", "..."]
    }
  ]
}

必ず有効なJSONのみを返してください。
`;

