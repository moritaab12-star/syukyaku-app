/**
 * raw_answers 各設問の「文章自動生成」（テンプレベース・ローカル完結）。
 *
 * 品質ルール:
 * - 設問ラベル（フォームの見出し）を本文にそのまま入れない（オウム返し禁止）
 * - 口調は「地域密着の親切な修理業の親方」。難しい言い回しを避け、具体的で温かい文にする
 * - 精神論だけで逃げない（「誠実に」「頑張ります」だけにしない）
 * - area / service が薄くても、業種らしい文脈で補完する
 * - q11〜q14 は項目の「目的」に合わせた専用文（下記 purposeDrivenAnswer）
 *
 * 業種拡張の方針:
 * - `inferServiceFamily` でキーワード一致したカテゴリ（garden / roof / exterior 等）ごとにテンプレを切替。
 * - 未マッチは general。屋根・外壁系の語は garden では出さない。
 *
 * 他設問コンテキストの方針:
 * - `otherAnswers` に同一プロジェクトの他回答を渡すと、短い抜粋を末尾に織り込み、空振り感を減らす。
 * - 長さ・件数は上限付き。LLM は不要。
 *
 * 将来: `suggestRawAnswer` を API（Dify 等）に差し替え可能。
 */

import { getBlockForQuestionId, type LpBlockKey } from '@/app/config/block-map';

export type ServiceFamily = 'garden' | 'roof' | 'exterior' | 'general';

export type RawAnswerSuggestInput = {
  questionId: string;
  questionLabel: string;
  area: string;
  service: string;
  regenerate?: boolean;
  variationNonce?: number;
  /** 同一プロジェクトの他設問の回答（現在の questionId は内部で除外） */
  otherAnswers?: Record<string, string>;
};

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickTemplate<T>(templates: readonly T[], seed: number): T {
  const rng = mulberry32(seed);
  return templates[Math.floor(rng() * templates.length)]!;
}

/** 出力に使う地名・業種（空なら自然なフォールバック） */
export function normalizeContext(area: string, service: string) {
  const a = area.replace(/\s+/g, '').trim() || 'この辺り';
  const sv = service.replace(/\s+/g, ' ').trim() || 'お直し';
  return { area: a, service: sv };
}

const MAX_OTHER_ANSWER_ENTRIES = 12;
const MAX_CHARS_PER_OTHER_ANSWER = 100;
const MAX_TOTAL_CONTEXT_SNIPPET = 400;

/**
 * 他設問の回答から短い抜粋を作る（空・現在設問は除外、長さガード）。
 * 公開しておき、テストや将来の API 層から再利用しやすくする。
 */
export function buildOtherAnswersContextSnippet(
  excludeQuestionId: string,
  otherAnswers?: Record<string, string>,
): string {
  if (!otherAnswers) return '';
  const parts: string[] = [];
  const entries = Object.entries(otherAnswers)
    .filter(([k, v]) => k !== excludeQuestionId && (v ?? '').trim().length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, MAX_OTHER_ANSWER_ENTRIES);

  for (const [, v] of entries) {
    const t = (v ?? '').trim().replace(/\s+/g, ' ');
    if (!t) continue;
    const cut =
      t.length > MAX_CHARS_PER_OTHER_ANSWER
        ? `${t.slice(0, MAX_CHARS_PER_OTHER_ANSWER)}…`
        : t;
    parts.push(cut);
  }

  if (parts.length === 0) return '';
  let joined = parts.join(' ');
  if (joined.length > MAX_TOTAL_CONTEXT_SNIPPET) {
    joined = `${joined.slice(0, MAX_TOTAL_CONTEXT_SNIPPET)}…`;
  }
  return joined;
}

export function inferServiceFamily(service: string): ServiceFamily {
  const s = service.toLowerCase();
  if (/屋根|雨漏り|葺き|葺|ガルバ|スレート|瓦|カバー工法|屋上/.test(s)) return 'roof';
  if (/外壁|塗装|防水|シーリング/.test(s)) return 'exterior';
  if (
    /植木|剪定|庭|緑地|造園|植木屋|芝生|草刈|ガーデン|ランドスケープ|樹木|庭師|エクステリア|竹林|抜根|防草|除草|芝はり|緑地管理/.test(
      s,
    )
  ) {
    return 'garden';
  }
  return 'general';
}

/** 設問ラベルから「何を書くか」のトーンだけ推定（ラベル文字列は出力に使わない） */
type AnswerTone =
  | 'one_liner_advice'
  | 'credibility_fact'
  | 'local_presence'
  | 'empathy_pain'
  | 'differentiation'
  | 'story_future';

function inferToneFromLabel(label: string, block: LpBlockKey): AnswerTone {
  const l = label.toLowerCase();

  if (
    /今.*悩|悩む人|一言|相談だけ|まずは.*相談|手遅れ|不安.*解消/.test(l) ||
    (/悩み/.test(l) && /今|方へ|人へ/.test(l))
  ) {
    return 'one_liner_advice';
  }
  if (
    /感動|エピソード|10年後|未来|家族|地域への想い|最高の仕事|いい表情|褒め言葉|改善経験/.test(l)
  ) {
    return 'story_future';
  }
  if (
    /創業|実績|件数|資格|表彰|保証|自社施工|スタッフ|業界歴|メディア/.test(l)
  ) {
    return 'credibility_fact';
  }
  if (
    /対応エリア|詳しい場所|駆けつけ|無料範囲|トラブル対応|近隣|事務所|地元人|地域活動|気候|スピード/.test(
      l,
    )
  ) {
    return 'local_presence';
  }
  if (
    /不安|失敗|断ら|追加料金|諦め|迷う|悪いイメージ|女性|高齢|時間|相談のみ/.test(l)
  ) {
    return 'empathy_pain';
  }
  if (
    /強み|こだわり|説明|見積|アフター|道具|安さ|大手|小回り|おまけ|技術/.test(l)
  ) {
    return 'differentiation';
  }

  const blockDefault: Record<LpBlockKey, AnswerTone> = {
    trust: 'credibility_fact',
    local: 'local_presence',
    pain: 'empathy_pain',
    strength: 'differentiation',
    story: 'story_future',
  };
  return blockDefault[block];
}

function applyAS(template: string, area: string, service: string): string {
  return template.replace(/\{area\}/g, area).replace(/\{service\}/g, service);
}

/** {area}{service} に加え、{min}{minRange} など任意プレースホルダ */
function applyTemplateVars(
  template: string,
  vars: Record<string, string>,
): string {
  let s = template;
  for (const [key, val] of Object.entries(vars)) {
    s = s.split(`{${key}}`).join(val);
  }
  return s;
}

/** 駆けつけ系で使う具体的な時間表現（seedでばらつき） */
function pickDepartureMinutes(seed: number): string {
  return pickTemplate(['25', '30', '35', '40', '45', '50'], seed ^ 0x51ed);
}

function pickMinuteRange(seed: number): string {
  return pickTemplate(
    ['30～45', '35～50', '40～60', '25～40', '30～50'],
    seed ^ 0xbeef,
  );
}

/** 対応エリア文用：市名の重複を避けつつ「市・周辺」感を出す */
function areaForCoverageCopy(raw: string): string {
  const a = raw.replace(/\s+/g, '').trim() || 'この地域';
  if (a === 'この辺り' || a === 'この地域') return a;
  if (/[市区町村]$/.test(a)) return a;
  return `${a}市`;
}

/** q12 用：地元の「土地勘」補助（建築・搬入前提） */
function pickLocalTerrainHint(seed: number): string {
  return pickTemplate(
    [
      '坂のきつい住宅街や一方通行の細い道',
      '海から近く潮風が当たりやすい沿道',
      '台地の上と低地で風の抜け方が違う区画',
      '古い木造が密集している路地と、新しい分譲地の境目',
      '旧道沿いで搬入の停め場所が限られるエリア',
    ],
    seed ^ 0xcafe,
  );
}

/** q12 用：造園・植木屋向けの土地勘 */
function pickGardenLocaleHint(seed: number): string {
  return pickTemplate(
    [
      '建物に近い高木と境界の生垣が重なり、剪定の持ち方が難しい戸建て',
      '日当たりの良い南側の庭と、夏だけ湿気が残る北側の植え込み',
      '狭い路地と隣家の塀に挟まれた樹木の剪定',
      '台風で枝が折れやすい沿道の木々',
      '古い庭木が境界に寄りすぎて、近隣の方にご相談が出やすい区画',
    ],
    seed ^ 0x600d,
  );
}

/**
 * q11〜q14: 各項目の「意図」に沿った専用生成（ラベル文字列は出さない）
 *
 * q11 対応エリア → 自宅にも来る安心・具体エリア名・フットワーク（精神論で逃げない）
 * q12 特に詳しい場所 → 土地勘・地形・環境のクセ・地元ならではの共感
 * q13 駆けつけスピード → 最短○分・即日など物理表現（保険の話はしない）
 * q14 地域活動 → ボランティア・祭り・清掃など、街の一員の具体エピソード
 */
function purposeDrivenAnswer(
  questionId: string,
  area: string,
  service: string,
  seed: number,
  family: ServiceFamily,
): string | null {
  const id = questionId.trim().toLowerCase();
  const min = pickDepartureMinutes(seed);
  const minRange = pickMinuteRange(seed);
  const areaNamed = areaForCoverageCopy(area);
  const terrain =
    family === 'garden' ? pickGardenLocaleHint(seed) : pickLocalTerrainHint(seed);
  const baseVars = {
    area,
    areaNamed,
    service,
    min,
    minRange,
    terrain,
  };

  if (family === 'garden') {
    if (id === 'q11') {
      const pool = [
        '{areaNamed}とその周辺の住宅地まで、ご自宅へ伺い{service}の現地確認・お見積りに対応します。剪定や庭木の優先順位も、敷地を見ながら一緒に決めます。住所や駅名・大字を教えてもらえれば、当日の空きに合わせて「伺える枠」をはっきりお返しします。',
        '「うちの庭にも来てくれる？」が知りたいポイントだと思います。{areaNamed}を基点に、よく回る範囲を地図の感覚で説明します。近隣の剪定や抜根の現場をつなげて動くので、車の回し方でムダを減らし、伺いの段取りを早めに出すようにしています。',
        '{areaNamed}のお客様には、お電話のあと約{minRange}分ほどで「出発の目安」をお伝えできることが多いです。庭木の急ぎ（折れた枝・倒木の危険など）の相談も、まずは場所だけ教えてください。',
      ] as const;
      return applyTemplateVars(pickTemplate(pool, seed), baseVars);
    }
    if (id === 'q12') {
      const pool = [
        '{area}では{terrain}など、図面だけでは分からないクセがあります。剪定の届き方や剪定屑の搬出でつまずきやすい庭も何件も見てきたので、現場に入る前から「ここはこう動くとスムーズ」と先回りしてお話しします。季節で伸び方が違う樹種の傾向も、地元で回っていると肌感で共有しやすいです。',
        '同じ{area}でも区画によって、日陰の苔の付き方や風の通り方が違います。{terrain}は特に経験値が効くので、「うちの庭もそうかも」と感じる点があれば、写真で一緒に確認します。',
        '{area}の庭木は、植え込みの深さや根の張り方で手の入れ方が変わります。{terrain}のお庭では、近隣への配慮（剪定屑・音の出方）も先に整理してお話しします。',
      ] as const;
      return applyTemplateVars(pickTemplate(pool, seed), baseVars);
    }
    if (id === 'q13') {
      const pool = [
        '台風後の枝の危険・急ぎの剪定などは、即日で現地を見に行ける日もあります。目安として、お電話から最短で約{min}分ほどで車を出せることが多いです。到着までの目安はその都度お伝えし、夜間は別途ご相談になります。',
        '急ぎをご希望の場合は、午前中のご連絡があると枠を組み替えやすいです。お電話後、おおよそ{minRange}分ほどで現場向かいの段取りに入れることが多く、移動中も遅れが出そうならこちらから連絡します。',
        '危険が高いときは、近くの剪定を早めに切り上げて向かうこともあります。最短でお電話から約{min}分以内に動き出せる日もあります。スピードは言葉ではなく、人と車の配置で作っています。',
      ] as const;
      return applyTemplateVars(pickTemplate(pool, seed), baseVars);
    }
    if (id === 'q14') {
      const pool = [
        '年に数回、自治会の道路清掃や公園の草刈りボランティア、校区の緑地手入れの手伝いに参加しています。営業ではなく、{area}の街の一員として顔を出しておきたいだけです。',
        '地元の神社の境内の草刈りや、夏祭りの片付け手伝い、子ども会の防災訓練の手伝いなど、小さな声がけでもできる範囲で出ます。緑の仕事以外の顔を見てもらえれば、ご近所の方も話しかけやすいと思っています。',
        '運動会のテント立てや、校区の清掃デーにも顔を出すことがあります。{area}で暮らす方と同じ目線で街の木や公園を使うつもりで、祭りや行事の日は特に足を運ぶようにしています。',
      ] as const;
      return applyTemplateVars(pickTemplate(pool, seed), baseVars);
    }
    return null;
  }

  // q11 対応エリア（「うちにも来るか」が分かること・フットワーク）
  if (id === 'q11') {
    const pool = [
      '{areaNamed}とその周辺の住宅地まで、ご自宅へ出張して{service}の調査・お見積りに伺います。住所や駅名・大字を教えてもらえれば、その場で「今日行ける／次の枠になる」とはっきりお返しします。近所の現場をつなげて動くので、車の回し方でムダを減らし、足は早めに出すようにしています。',
      '「ここまで来てくれるの？」がいちばん知りたいポイントだと思います。{areaNamed}を基点に、よく行く範囲を地図の感覚で説明します。郵便番号や区画名でも構いません。行ける距離なら当日の空きに合わせて枠を押さえ、遠方や混み合いの日は次の確実な日時を提案します。',
      '{areaNamed}のお客様には、電話のあと約{minRange}分ほどで「出発の目安」をお伝えできることが多いです。現場が近い日はそのまま直行することもあります。来てほしい場所が自宅エリアに含まれるか、まずは場所だけ教えてください。',
    ] as const;
    return applyTemplateVars(pickTemplate(pool, seed), baseVars);
  }

  // q12 特に詳しい場所（土地勘・環境のクセ・地元だから分かる悩み）
  if (id === 'q12') {
    const pool = [
      '{area}では{terrain}など、地図だけでは分からないクセがあります。材料の搬入や足場の置き場でつまずきやすい家を何件も見てきたので、現場に入る前から「ここはこう動くとスムーズ」と先回りしてお話しします。潮風や風向きで痛みが早い外壁や屋根のパターンも、地元で回っていると肌感で共有しやすいです。',
      '同じ{area}でも区画によって、雨どいの詰まり方や台風後の枝の乗り方が違います。{terrain}は特に経験値が効くので、「うちの家もそうかも」と感じる点があれば、写真や図で一緒に確認します。',
      '{area}の住宅は築年数や建て方で弱点の出方が違います。{terrain}の家では、見た目は軽くても内部に水が回りやすいケースがあるので、地元の事例を踏まえてチェック順を変えています。',
    ] as const;
    return applyTemplateVars(pickTemplate(pool, seed), baseVars);
  }

  // q13 駆けつけスピード（緊急の安心・最短分・即日。保険の話はしない）
  if (id === 'q13') {
    const pool = [
      '雨漏りがひどい・外から水が染みるなどのお急ぎは、即日で現地を見に行ける日もあります。目安として、お電話から最短で約{min}分ほどで車を出せることが多いです。到着までの目安はその都度お伝えし、深夜帯は別途ご相談になります。',
      '即日対応をご希望の場合は、午前中のご連絡があると枠を組み替えやすいです。お電話後、おおよそ{minRange}分ほどで現場向かいの段取りに入れることが多く、移動中も遅れが出そうならこちらから連絡します。',
      '緊急度が高いときは、近くの現場を早めに切り上げて向かうこともあります。最短でお電話から約{min}分以内に動き出せる日もあります。スピードは言葉ではなく、人と車の配置で作っています。',
    ] as const;
    return applyTemplateVars(pickTemplate(pool, seed), baseVars);
  }

  // q14 地域活動（素顔・怪しさ軽減：ボランティア・祭り・清掃の具体）
  if (id === 'q14') {
    const pool = [
      '年に数回、自治会の道路清掃や公園の草刈りボランティア、夏祭りの片付け手伝いに参加しています。営業ではなく、{area}の街の一員として顔を出しておきたいだけです。',
      '地元の神社の掃き掃除や、商店街イベントのゴミ回収ボランティア、子ども会の防災訓練の手伝いなど、小さな声がけでもできる範囲で出ます。仕事以外の顔を見てもらえれば、ご近所の方も話しかけやすいと思っています。',
      '運動会のテント立てや、校区の清掃デーにも顔を出すことがあります。{area}で暮らす方と同じ目線で街を使うつもりで、祭りや行事の日は特に足を運ぶようにしています。',
    ] as const;
    return applyTemplateVars(pickTemplate(pool, seed), baseVars);
  }

  return null;
}

/** 他設問の抜粋を文末に一段足す（空ならそのまま） */
function appendContextualTail(
  text: string,
  contextSnippet: string,
  area: string,
  service: string,
  seed: number,
): string {
  const snippet = contextSnippet.trim();
  if (!snippet) return text;
  const short = snippet.length > 90 ? `${snippet.slice(0, 90)}…` : snippet;
  const tails = [
    `ご記入いただいた他の項目の内容（「${short}」の点など）も踏まえ、${area}の${service}を丁寧にご提案します。`,
    `お話しの内容（${short}）に沿うよう、${area}の${service}で無理のないご提案を心がけます。`,
    `先に共有いただいた内容（${short}）のニュアンスも大切にしながら、${area}の${service}をご一緒に整えていきます。`,
  ] as const;
  return `${text}\n\n${pickTemplate(tails, seed ^ 0x8badf00d)}`;
}

/* ---------- トーン別テンプレ（{area}{service} のみ。ラベルは入れない） ---------- */

const TONE_ONE_LINER: Record<ServiceFamily, readonly string[]> = {
  garden: [
    '庭木はほっといたら、近隣や安全の面で気持ちが重くなることがあります。{area}でお困りなら、うちに一度見せてください。剪定の優先順位から一緒に決めます。手遅れになる前に、声をかけてもらえたら本当にうれしいです。',
    '{area}では境界の高木や伸びすぎた植え込みで悩む方も多いです。「まだ大丈夫かな」と思っているうちがいちばん危ないので、気になったら遠慮なく相談ください。見に行くだけでも構いません。',
    '剪定や抜根のことで一人で抱え込まないでください。{area}のうちは、{service}の現場を何度も見てきました。どんな小さな違和感でも、まずは話だけ聞かせてください。',
    '「業者に頼むほどでもない」と思われがちですが、庭木は早めのほうがお家周りも気持ちもやさしいです。{area}ならすぐ伺えます。怖がらずに一度、電話ください。',
  ],
  roof: [
    '雨漏りはほっといたら、家全体に響くことがあります。{area}でお困りなら、うちに一度見せてください。調査だけでも大丈夫です。手遅れになる前に、声をかけてもらえたら本当にうれしいです。',
    '{area}では屋根のちょっとしたひびから水が入ることもあります。「まだ大丈夫かな」と思っているうちがいちばん危ないので、気になったら遠慮なく相談ください。見に行くだけでも構いません。',
    '屋根のことで一人で抱え込まないでください。{area}のうちは、{service}の現場を何度も見てきました。どんな小さな違和感でも、まずは話だけ聞かせてください。',
    '「業者に頼むほどでもない」と思われがちですが、雨漏りは早めのほうがお家にもお財布にもやさしいです。{area}ならすぐ駆けつけます。怖がらずに一度、電話ください。',
  ],
  exterior: [
    '外壁や塗装は、見た目だけじゃなく雨風から家を守る大事な仕事です。{area}の気候にも合わせて、うちが一緒に考えます。まずは現状を見させてください。',
    '「いつやればいいか分からない」という方がほとんどです。{area}では{service}の相談、調査から丁寧にやっています。押し売りはしませんので安心してください。',
    'ちょっとした色あせやひびも、ほっておくと後で大きくなることがあります。{area}で{service}のことなら、うちに一度相談に来てください。話を聞くだけでも大丈夫です。',
    '家は長く住むものですから、焦って決めなくて大丈夫です。{area}のうちは、分かりやすい説明と、無理のないプランを心がけています。まずは現地を見せてください。',
  ],
  general: [
    '「どこに頼んでいいか分からない」という方がほとんどです。{area}ではうちが顔の見える対応を大事にしています。調査や見積もりの話から、遠慮なくどうぞ。',
    '小さなことでも、気になった時点で相談してもらえると助かります。{area}の{service}なら、現場を見てから正直にお話しします。無理に進めたりはしません。',
    '一人で悩まず、まずは声をかけてください。{area}で長くやってきた分、よくあるパターンも分かっています。話を聞いてから、やる・やらないは一緒に決めましょう。',
    'うちは{area}を地元に、{service}を地味に真面目にやってきました。派手なことは言えませんが、安心して頼める仕事だけはさせてください。一度お話しください。',
  ],
};

const TONE_CREDIBILITY_BASE: readonly string[] = [
  '{area}では口コミや紹介で仕事をいただくことが多く、長く続けてこれたのも地域のおかげです。数字や実績は現場でそのままお見せしますので、嘘はつきません。',
  'うちは派手な宣伝より、終わったあと「また頼みたい」と言ってもらえることを一番にしています。{service}の現場は一つひとつ丁寧に、{area}のお客様に顔を合わせて説明します。',
  '資格や保証も大事ですが、現場でどう動くかが一番だと思っています。{area}の{service}は、経験を積んだ職人が責任を持って対応します。',
  '創業からずっと{area}周辺を見てきました。流行りより、家と家族が長く安心できることを優先しています。',
  '「うちに頼んでよかった」と言ってもらえるよう、説明と施工の両方で手を抜きません。{service}のことは分かりやすい言葉でお伝えします。',
];

const TONE_CREDIBILITY_GARDEN: readonly string[] = [
  '{area}では口コミや紹介で庭木の相談をいただくことが多く、長く続けてこれたのも地域のおかげです。剪定前後の写真や作業内容はそのままお見せしますので、嘘はつきません。',
  'うちは派手な宣伝より、終わったあと「また来年もお願いしたい」と言ってもらえることを一番にしています。{service}の現場は一つひとつ丁寧に、{area}のお客様に顔を合わせて説明します。',
  '樹形や生育の見立ても大事ですが、現場でどう手を入れるかが一番だと思っています。{area}の{service}は、経験を積んだ担当が責任を持って対応します。',
  '創業からずっと{area}周辺の庭木を見てきました。見た目だけでなく、安全や近隣への配慮も優先しています。',
  '「うちに頼んでよかった」と言ってもらえるよう、剪定の理由と手順を分かりやすくお伝えします。{service}のことは専門用語を避けて話します。',
];

const TONE_LOCAL_BASE: readonly string[] = [
  '{area}から近い場所に拠点があり、急ぎのときもできるだけ早く駆けつけられるよう手配しています。遠方の大手より、顔の見える距離感を大事にしています。',
  'この地域の天気や建て方のクセも、長年見てきた分だけ分かっています。{area}の{service}は、土地の事情に合わせて無理のないやり方を提案します。',
  '近所への配慮や作業時間の相談も、遠慮なく言ってください。{area}で暮らす方と同じ目線で、気持ちよく終わるよう心がけています。',
  '無料でできる範囲と、有料になる作業は最初に書き分けてお伝えします。{area}のお客様に後からびっくりされないよう、見積の項目は口でもう一度補足します。',
  'うちの担当はなるべく地元の者が行きます。「また来てほしい」と思ってもらえる関係を、{area}で積み重ねています。',
];

const TONE_LOCAL_GARDEN: readonly string[] = [
  '{area}から近い場所に拠点があり、剪定の急ぎにもできるだけ早く伺えるよう手配しています。遠方の大手より、顔の見える距離感を大事にしています。',
  'この地域の風向きや季節の伸び方のクセも、長年見てきた分だけ分かっています。{area}の{service}は、樹種と敷地に合わせて無理のないやり方を提案します。',
  '近隣への配慮（剪定屑・音・通路）も、遠慮なく言ってください。{area}で暮らす方と同じ目線で、気持ちよく終わるよう心がけています。',
  '無料でできる範囲と、有料になる作業は最初に書き分けてお伝えします。{area}のお客様に後からびっくりされないよう、見積の項目は口でもう一度補足します。',
  'うちの担当はなるべく地元の者が伺います。「また来年もお願いしたい」と思ってもらえる関係を、{area}で積み重ねています。',
];

const TONE_EMPATHY_BASE: readonly string[] = [
  '「前に断られた」「金額が分からなくて怖い」という話、よく聞きます。{area}のうちでは、まず状況を聞いて、無理な提案はしません。相談だけでも歓迎です。',
  '不安なまま契約なんてさせません。{service}のことは、専門用語を使わずに、何度でも説明します。納得いくまで付き合います。',
  '追加料金が怖い方が多いので、うちはできる範囲と追加になりそうな条件を最初に書きます。{area}でも同じやり方で、驚かせないようにしています。',
  '女性の方やご年配の方だけのご家庭でも、安心して相談できるよう、分かりやすくゆっくり話します。{area}でお困りなら、遠慮なくどうぞ。',
  '時間が取れない方には、できるだけ日程を調整します。{service}のことで頭を悩ませているなら、まずは短い電話でも構いません。',
];

const TONE_EMPATHY_GARDEN: readonly string[] = [
  '「大きな木で断られた」「見積が分からなくて怖い」という話、よく聞きます。{area}のうちでは、まず庭の状況を聞いて、無理な提案はしません。相談だけでも歓迎です。',
  '不安なまま剪定だけ進めたりしません。{service}のことは、専門用語を使わずに、何度でも説明します。納得いくまで付き合います。',
  '追加料金が怖い方が多いので、うちはできる範囲と追加になりそうな条件を最初に書きます。{area}でも同じやり方で、驚かせないようにしています。',
  '女性の方やご年配の方だけのご家庭でも、安心して相談できるよう、分かりやすくゆっくり話します。{area}で庭木でお困りなら、遠慮なくどうぞ。',
  '時間が取れない方には、できるだけ日程を調整します。{service}のことで頭を悩ませているなら、まずは短い電話でも構いません。',
];

const TONE_DIFFERENTIATION_BASE: readonly string[] = [
  '大きな会社ほど手の届かないところを、うちは小回りでカバーします。{area}の{service}は、現場の細かいところまで見るのが得意です。',
  '安さの理由は、無駄な中間を減らして、必要な材料と手間だけにすることです。{service}の品質だけは落としません。',
  '道具や材料にもこだわりますが、それ以上に「なぜそうするか」を説明することを大事にしています。{area}のお客様に納得してもらってから進めます。',
  'アフターで困ったときに連絡しやすい関係を作りたいので、施工後も気軽に声をかけてください。{service}は終わってからが本番だと思っています。',
  '見積もりは細かく、でも読みやすく。{area}では「ここまで含む／含まない」をはっきり書くようにしています。',
];

const TONE_DIFFERENTIATION_GARDEN: readonly string[] = [
  '大きな会社ほど手の届かない庭先の細かいところを、うちは小回りでカバーします。{area}の{service}は、樹形と安全のバランスまで見るのが得意です。',
  '安さの理由は、無駄な中間を減らして、必要な手間と搬出費だけにすることです。{service}の仕上がりだけは落としません。',
  '剪定ばさみや脚立の選び方にもこだわりますが、それ以上に「なぜここを切るか」を説明することを大事にしています。{area}のお客様に納得してもらってから進めます。',
  '剪定後に不安が残らないよう、後からでも気軽に連絡しやすい関係を作りたいです。{service}は終わってからが本番だと思っています。',
  '見積もりは細かく、でも読みやすく。{area}では「搬出・処分まで含む／含まない」をはっきり書くようにしています。',
];

const TONE_STORY_BASE: readonly string[] = [
  '終わったあと「よかった」と笑ってもらえるのが、いちばんのやりがいです。{area}のお客様にも、安心して暮らせる日々が続くよう願っています。',
  'うまくいかなかった現場から学んだこともたくさんあります。だから今は、最初に聞くことと説明することを大切にしています。{service}も同じです。',
  '「うちも頼もうかな」と近所の方に言ってもらえると、親方としては何よりです。{area}で長くやっていけるのは、そういうつながりのおかげです。',
  '十年後も困ったときに「あの時の業者さんに」と思ってもらえたら最高です。{area}の{service}は、そういう関係を目指しています。',
  '家族に説明しやすいように、写真や図を使うこともあります。{area}のご家庭が安心して決められるよう、一緒に整理していきます。',
];

const TONE_STORY_GARDEN: readonly string[] = [
  '剪定が終わったあと「すっきりした」と笑ってもらえるのが、いちばんのやりがいです。{area}のお客様にも、庭が安心できる空間になるよう願っています。',
  'うまくいかなかった庭木の現場から学んだこともたくさんあります。だから今は、最初に聞くことと説明することを大切にしています。{service}も同じです。',
  '「うちの庭も見てほしい」と近所の方に言ってもらえると、何よりです。{area}で長くやっていけるのは、そういうつながりのおかげです。',
  '何年後も困ったときに「あの時の植木屋さんに」と思ってもらえたら最高です。{area}の{service}は、そういう関係を目指しています。',
  '家族に説明しやすいように、剪定前後の写真を使うこともあります。{area}のご家庭が安心して決められるよう、一緒に整理していきます。',
];

function toneCredibility(family: ServiceFamily): readonly string[] {
  return family === 'garden' ? TONE_CREDIBILITY_GARDEN : TONE_CREDIBILITY_BASE;
}
function toneLocal(family: ServiceFamily): readonly string[] {
  return family === 'garden' ? TONE_LOCAL_GARDEN : TONE_LOCAL_BASE;
}
function toneEmpathy(family: ServiceFamily): readonly string[] {
  return family === 'garden' ? TONE_EMPATHY_GARDEN : TONE_EMPATHY_BASE;
}
function toneDifferentiation(family: ServiceFamily): readonly string[] {
  return family === 'garden'
    ? TONE_DIFFERENTIATION_GARDEN
    : TONE_DIFFERENTIATION_BASE;
}
function toneStory(family: ServiceFamily): readonly string[] {
  return family === 'garden' ? TONE_STORY_GARDEN : TONE_STORY_BASE;
}

function templatesForTone(
  tone: AnswerTone,
  family: ServiceFamily,
): readonly string[] {
  switch (tone) {
    case 'one_liner_advice':
      return TONE_ONE_LINER[family];
    case 'credibility_fact':
      return toneCredibility(family);
    case 'local_presence':
      return toneLocal(family);
    case 'empathy_pain':
      return toneEmpathy(family);
    case 'differentiation':
      return toneDifferentiation(family);
    case 'story_future':
      return toneStory(family);
    default:
      return toneEmpathy(family);
  }
}

/**
 * ローカルテンプレ生成（同期）。
 * questionLabel はトーン推定にのみ使用し、生成文には含めない。
 */
export function suggestRawAnswerLocal(input: RawAnswerSuggestInput): string {
  const { area, service } = normalizeContext(input.area, input.service);

  const baseSeed = hash32(input.questionId);
  const extra =
    input.regenerate && input.variationNonce != null
      ? input.variationNonce * 2654435761
      : 0;
  const seed = baseSeed ^ extra;

  const contextSnippet = buildOtherAnswersContextSnippet(
    input.questionId,
    input.otherAnswers,
  );
  const family = inferServiceFamily(input.service);

  const purpose = purposeDrivenAnswer(
    input.questionId,
    area,
    service,
    seed,
    family,
  );
  if (purpose) {
    return appendContextualTail(purpose, contextSnippet, area, service, seed);
  }

  const block = getBlockForQuestionId(input.questionId) ?? 'trust';
  const tone = inferToneFromLabel(input.questionLabel, block);
  const toneSeed = seed ^ hash32(tone) * 0x9e3779b9;

  const pool = templatesForTone(tone, family);
  const t = pickTemplate(pool, toneSeed);
  const text = applyAS(t, area, service);
  return appendContextualTail(text, contextSnippet, area, service, seed);
}

/**
 * 自動生成の公開API。現状はローカルテンプレ。
 */
export async function suggestRawAnswer(
  input: RawAnswerSuggestInput,
): Promise<string> {
  return suggestRawAnswerLocal(input);
}
