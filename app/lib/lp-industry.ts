import { inferServiceFamily, type ServiceFamily } from '@/app/lib/raw-answer-suggest';

/**
 * LP 本文（lpToHtmlCore / lp-template）向けの業種トーン。
 * raw_answers の ServiceFamily に reform を足した拡張。
 */
export type LpIndustryTone = 'garden' | 'roof' | 'exterior' | 'reform' | 'general';

const KEY_ALIASES: Record<string, LpIndustryTone> = {
  garden: 'garden',
  roof: 'roof',
  exterior: 'exterior',
  reform: 'reform',
  general: 'general',
};

function matchesReformService(service: string): boolean {
  const s = service.toLowerCase();
  return /リフォーム|改装|リノベ|大規模修繕|水回り|キッチン|バス|内装|増改築/.test(s);
}

function serviceFamilyToLpTone(f: ServiceFamily): Exclude<LpIndustryTone, 'reform'> {
  return f;
}

/**
 * projects.industry_key を最優先し、なければ service 文字列から推定。
 * DB の industry_key は小文字想定（garden / reform 等）。
 */
export function resolveLpIndustryTone(
  industryKey: string | null | undefined,
  service: string,
): LpIndustryTone {
  const raw = typeof industryKey === 'string' ? industryKey.trim().toLowerCase() : '';
  if (raw && KEY_ALIASES[raw]) {
    return KEY_ALIASES[raw];
  }

  const svc = typeof service === 'string' ? service : '';
  if (matchesReformService(svc)) {
    return 'reform';
  }

  return serviceFamilyToLpTone(inferServiceFamily(svc));
}

/** lpToHtmlCore 用の業種別文言（DOM は同じ・中身のみ差し替え） */
export type LpHtmlSectionCopy = {
  solutionLead: string;
  solutionBullets: [string, string, string];
  /** 見出し: `${serviceName}の` + この suffix */
  servicesHeadingSuffix: string;
  serviceCards: { title: string; text: string }[];
  priceTitle: string;
  priceLead: string;
  priceHeadLabels: [string, string, string];
  flowTitle: string;
  flowSteps: [FlowStep, FlowStep, FlowStep];
  /** benefit テンプレの inlineCta */
  benefitInlineCta: { title: string; lead: string };
};

type FlowStep = { title: string; text: string };

const GENERAL_COPY: LpHtmlSectionCopy = {
  solutionLead:
    '{area}エリアに特化した対応で、お客様一人ひとりの状況に合わせたご提案をいたします。',
  solutionBullets: [
    '担当が現状を丁寧にヒアリング',
    '複数の選択肢から無理のないご提案',
    '完了後も必要に応じてフォロー',
  ],
  servicesHeadingSuffix: 'サービス内容',
  serviceCards: [
    {
      title: '標準のお取り組み',
      text: 'はじめての方でも安心してお任せいただける、標準的な内容です。',
    },
    {
      title: 'しっかりサポート',
      text: 'アフターやフォローを重視したい方向けの内容です。',
    },
    {
      title: '内容の調整',
      text: '課題や予算に合わせて、内容を柔軟に組み立てられます。',
    },
  ],
  priceTitle: '料金の目安',
  priceLead: '状況により変動しますが、まずは目安としてご確認ください。',
  priceHeadLabels: ['項目', '目安料金', '内容'],
  flowTitle: 'お問い合わせから完了までの流れ',
  flowSteps: [
    {
      title: 'お問い合わせ',
      text: 'フォームまたはLINEから、24時間いつでもご連絡いただけます。',
    },
    {
      title: 'ヒアリング・ご提案',
      text: '現状やご希望を伺い、内容とお見積もりをご提示します。',
    },
    {
      title: 'ご契約・作業',
      text: '内容にご納得いただいたうえで、ご契約・作業へと進みます。',
    },
  ],
  benefitInlineCta: {
    title: 'まずは状況を聞かせてください',
    lead: '最短の進め方と、無理のない内容を一緒に整理します。',
  },
};

const GARDEN_COPY: LpHtmlSectionCopy = {
  solutionLead:
    '{area}エリアの庭木・植え込みの特性を踏まえ、剪定やお手入れの優先順位を一緒に決めます。',
  solutionBullets: [
    '樹種と生育に合わせた剪定のご提案',
    '近隣・安全の配慮も含めて現地で確認',
    '季節に合わせたお手入れのご相談',
  ],
  servicesHeadingSuffix: 'お庭のメニュー（お手入れの内容）',
  serviceCards: [
    {
      title: '剪定・整枝',
      text: '樹形を整え、風通しと安全を確保する基本的な剪定です。',
    },
    {
      title: '高木・生垣のお手入れ',
      text: '届きにくい箇所や境界まわりも、現場に合わせて対応します。',
    },
    {
      title: 'お庭まわりのご相談',
      text: '抜根・植え替え・防草など、敷地に合わせてご提案します。',
    },
  ],
  priceTitle: '料金の目安',
  priceLead: '木の本数や作業範囲で変わります。現地確認のうえでお見積もりします。',
  priceHeadLabels: ['内容', '目安料金', '備考'],
  flowTitle: '剪定・お手入れの依頼から完了まで',
  flowSteps: [
    {
      title: 'お問い合わせ',
      text: 'お電話・フォーム・LINEから。お庭の様子や写真が分かるとスムーズです。',
    },
    {
      title: '現地確認・お見積り',
      text: '剪定の範囲や安全面を確認し、内容と金額をご提示します。',
    },
    {
      title: '作業・完了',
      text: 'ご了承いただいた内容で作業し、剪定屑の片付けまで整えます。',
    },
  ],
  benefitInlineCta: {
    title: 'まずは庭のお悩みを聞かせてください',
    lead: '時期と優先順位を一緒に決め、無理のないお手入れに整理します。',
  },
};

const REFORM_COPY: LpHtmlSectionCopy = {
  solutionLead:
    '{area}エリアの住宅事情を踏まえ、現地の状況に合わせた施工内容とスケジュールをご提案します。',
  solutionBullets: [
    '現地調査・ヒアリングを丁寧に実施',
    '工事範囲とお見積りを分かりやすくご提示',
    '近隣配慮や工程も含めてご相談',
  ],
  servicesHeadingSuffix: '施工内容の例',
  serviceCards: [
    {
      title: '標準工事',
      text: '一般的な範囲のリフォーム・修繕に対応する標準的な工事です。',
    },
    {
      title: 'しっかりサポート',
      text: '保証やアフターまで含めたい方向けのご提案です。',
    },
    {
      title: '部分・カスタム',
      text: '水回り・内装など、範囲を絞ったご依頼にも対応します。',
    },
  ],
  priceTitle: '費用の目安',
  priceLead: '工事内容・材質・範囲で変動します。現地調査のうえでお見積もりします。',
  priceHeadLabels: ['項目', '目安料金', '内容'],
  flowTitle: 'お問い合わせから完了までの流れ',
  flowSteps: [
    {
      title: 'お問い合わせ',
      text: 'フォーム・LINE・お電話から。現場の写真や図面があると分かりやすいです。',
    },
    {
      title: '現地調査・お見積り',
      text: '現状を確認し、工事内容とお見積もりをご提示します。',
    },
    {
      title: 'ご契約・施工',
      text: '内容にご納得いただいてから、工程に沿って施工します。',
    },
  ],
  benefitInlineCta: {
    title: 'まずは現状を聞かせてください',
    lead: '工事の範囲と進め方を、無理のない形にまとめます。',
  },
};

const ROOF_COPY: LpHtmlSectionCopy = {
  ...REFORM_COPY,
  solutionLead:
    '{area}エリアの雨風・台風の傾向も踏まえ、屋根の状態に合わせた調査とご提案をします。',
  solutionBullets: [
    '屋根の状態を丁寧に確認',
    '修繕・葺き替えなど複数の選択肢をご提示',
    '雨漏りの早めの対応をご提案',
  ],
  servicesHeadingSuffix: '屋根工事の内容',
  serviceCards: [
    {
      title: '点検・調査',
      text: '傷みの範囲を確認し、必要な対応をご説明します。',
    },
    {
      title: '部分修繕',
      text: '範囲の小さな損傷から、優先して対応する工事です。',
    },
    {
      title: '葺き替え・大規模',
      text: '屋根全体の状態に合わせたご提案が可能です。',
    },
  ],
  flowTitle: 'お問い合わせから完了までの流れ',
  flowSteps: [
    {
      title: 'お問い合わせ',
      text: '雨漏り・雨染みなど、お早めにご連絡ください。',
    },
    {
      title: '現地調査・お見積り',
      text: '屋根の状態を確認し、修繕内容とお見積もりをご提示します。',
    },
    {
      title: 'ご契約・施工',
      text: 'ご了承後、天候や工程に合わせて施工します。',
    },
  ],
};

const EXTERIOR_COPY: LpHtmlSectionCopy = {
  ...REFORM_COPY,
  solutionLead:
    '{area}エリアの気候・建物の傾向を踏まえ、外壁・塗装の状態に合わせたご提案をします。',
  solutionBullets: [
    '劣化・ひび割れなどを確認しながらご説明',
    '塗装・補修など複数の選択肢をご提示',
    '工程や近隣への配慮もご相談します',
  ],
  servicesHeadingSuffix: '施工・メンテナンスの内容',
  serviceCards: [
    {
      title: '点検・診断',
      text: '外壁の状態を確認し、必要な対応をご説明します。',
    },
    {
      title: '塗装・補修',
      text: '範囲に合わせた塗装・部分補修をご提案します。',
    },
    {
      title: 'ご相談・調整',
      text: '予算や時期に合わせて、内容を柔軟に組み立てます。',
    },
  ],
};

/** Perplexity / Gemini 用の業種説明（短い日本語） */
export function lpIndustryToneDescriptionForPrompt(tone: LpIndustryTone): string {
  const m: Record<LpIndustryTone, string> = {
    garden: '植木・造園・庭の剪定・芝生・お手入れ（植木屋・造園業）',
    roof: '屋根工事・葺き替え・雨漏り・カバー工法',
    exterior: '外壁・塗装・防水・シーリング',
    reform: 'リフォーム・内装・水回り・リノベーション',
    general: '地域密着サービス（その他・未分類を含む）',
  };
  return m[tone];
}

export function getLpHtmlSectionCopy(tone: LpIndustryTone): LpHtmlSectionCopy {
  switch (tone) {
    case 'garden':
      return GARDEN_COPY;
    case 'reform':
      return REFORM_COPY;
    case 'roof':
      return ROOF_COPY;
    case 'exterior':
      return EXTERIOR_COPY;
    default:
      return GENERAL_COPY;
  }
}
