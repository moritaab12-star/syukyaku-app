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
 * - 業種は `resolveLpIndustryTone`（`lp-industry.ts`）に集約。`inferServiceFamily` はそのラッパー。
 * - 未マッチは general。屋根・外壁系の語は garden では出さない。
 *
 * 他設問コンテキストの方針:
 * - `otherAnswers` に同一プロジェクトの他回答を渡すと、短い抜粋を末尾に織り込み、空振り感を減らす。
 * - 長さ・件数は上限付き。LLM は不要。
 *
 * 将来: `suggestRawAnswer` を API（Dify 等）に差し替え可能。
 */

import { getBlockForQuestionId, type LpBlockKey } from '@/app/config/block-map';
import {
  RAW_ANSWER_GROUNDING_QUESTION_IDS,
  RAW_ANSWER_VOICE_ONLY_QUESTION_IDS,
} from '@/app/config/question-roles';
import { Q50_LABELS } from '@/app/admin/projects/new/questions';
import { resolveLpIndustryTone, type LpIndustryTone } from '@/app/lib/lp-industry';

export type ServiceFamily =
  | 'garden'
  | 'roof'
  | 'exterior'
  | 'reform'
  | 'real_estate'
  | 'general';

function lpToneToServiceFamily(tone: LpIndustryTone): ServiceFamily {
  switch (tone) {
    case 'garden':
      return 'garden';
    case 'roof':
      return 'roof';
    case 'exterior':
      return 'exterior';
    case 'reform':
      return 'reform';
    case 'real_estate':
      return 'real_estate';
    default:
      return 'general';
  }
}

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

/** 事実アンカー（Grounding）コンテキストの上限 */
const GROUNDING_MAX_CHARS_PER_ANSWER = 420;
const GROUNDING_MAX_TOTAL = 6500;
/** 独自性（Voice）コンテキストの上限（Grounding の後に付与） */
const VOICE_MAX_CHARS_PER_ANSWER = 280;
const VOICE_MAX_TOTAL = 2800;

function trimAnswerLine(s: string, maxChars: number): string {
  const t = (s ?? '').trim().replace(/\s+/g, ' ');
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}…`;
}

function buildTierContextLines(
  orderedIds: readonly string[],
  excludeQuestionId: string,
  otherAnswers: Record<string, string>,
  maxPerAnswer: number,
  maxTotal: number,
): string {
  const ex = excludeQuestionId.trim().toLowerCase();
  const lines: string[] = [];
  for (const id of orderedIds) {
    const key = id.trim().toLowerCase();
    if (!key || key === ex) continue;
    const raw = otherAnswers[id] ?? otherAnswers[key];
    const trimmed = trimAnswerLine(String(raw ?? ''), maxPerAnswer);
    if (!trimmed) continue;
    const label = Q50_LABELS[id] ?? Q50_LABELS[key] ?? id;
    lines.push(`・${label}: ${trimmed}`);
  }
  let out = lines.join('\n');
  if (out.length > maxTotal) {
    out = `${out.slice(0, maxTotal)}…`;
  }
  return out;
}

/**
 * 他設問の回答から LLM 向けコンテキストを作る。
 * - 先に「事実アンカー（Grounding）」を厚く載せ、続けて「ストーリー・差別化（Voice only）」を載せる。
 * - 設問→役割の対応は `app/config/question-roles.ts`。
 */
export function buildOtherAnswersContextSnippet(
  excludeQuestionId: string,
  otherAnswers?: Record<string, string>,
): string {
  if (!otherAnswers) return '';
  const grounding = buildTierContextLines(
    RAW_ANSWER_GROUNDING_QUESTION_IDS,
    excludeQuestionId,
    otherAnswers,
    GROUNDING_MAX_CHARS_PER_ANSWER,
    GROUNDING_MAX_TOTAL,
  );
  const voice = buildTierContextLines(
    RAW_ANSWER_VOICE_ONLY_QUESTION_IDS,
    excludeQuestionId,
    otherAnswers,
    VOICE_MAX_CHARS_PER_ANSWER,
    VOICE_MAX_TOTAL,
  );
  const parts: string[] = [];
  if (grounding) parts.push(`【事実アンカー（必須参照・他設問）】\n${grounding}`);
  if (voice) parts.push(`【ストーリー・差別化（他設問）】\n${voice}`);
  return parts.join('\n\n');
}

/** LP 全文パック用: q1〜q50 を番号順に（空回答は省略）。設問ラベル付き。 */
const LP_PACK_QA_MAX_PER_ANSWER = 380;
const LP_PACK_QA_MAX_TOTAL = 14_000;

export function buildLpPackSurveyContext(
  otherAnswers?: Record<string, string>,
): string {
  if (!otherAnswers) return '';
  const lines: string[] = [];
  let total = 0;
  for (let i = 1; i <= 50; i++) {
    const id = `q${i}`;
    const raw = otherAnswers[id] ?? '';
    const trimmed = trimAnswerLine(String(raw ?? ''), LP_PACK_QA_MAX_PER_ANSWER);
    if (!trimmed) continue;
    const label = Q50_LABELS[id] ?? id;
    const line = `・${label}: ${trimmed}`;
    if (total + line.length + 1 > LP_PACK_QA_MAX_TOTAL) break;
    lines.push(line);
    total += line.length + 1;
  }
  if (lines.length === 0) return '';
  return `【アンケート50問（q1〜q50・入力済みのみ）】\n${lines.join('\n')}`;
}

/** @deprecated 推定ロジックは `resolveLpIndustryTone` に集約済み */
export function inferServiceFamily(service: string): ServiceFamily {
  return lpToneToServiceFamily(resolveLpIndustryTone(null, service));
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

/** q12 用：不動産のエリア文脈 */
function pickRealEstateLocaleHint(seed: number): string {
  return pickTemplate(
    [
      '駅前は商業・タワマン需要があり、少し外れると戸建て中心の落ち着いた住宅エリアに変わる区画',
      '文教地区に近く、単身・子育て・シニアの入れ替わりがはっきり分かれる町',
      '再開発や大型商業施設の開業で、賃料・売却相場が動きやすいエリア',
      '海方面や産業道路へのアクセスが生活圏にあり、二世帯・投資の相談も多い地域',
      '築年数の幅が広く、中古再生・建て替えの事例がまとまって出るエリア',
    ],
    seed ^ 0x7ea5,
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

  if (family === 'real_estate') {
    if (id === 'q11') {
      const pool = [
        '{areaNamed}とその周辺エリアの売買・賃貸を中心にご案内しています。内見や現地確認の範囲、オンライン相談の可否など、まずはご希望をお聞きしたうえで「当日・翌日以降の枠」をお返しします。',
        '「この辺りの物件も扱える？」が分かりやすいよう、{areaNamed}を基点によく扱うエリアを地図の感覚でお伝えします。学区や生活利便性の前提がずれないよう、条件から先に整理させてください。',
        '{areaNamed}のお客様には、お電話やフォームのあと、ご希望に近い事例や近隣の相場感をざっくり共有できることが多いです。まずは探している立地・予算の幅だけでも構いません。',
      ] as const;
      return applyTemplateVars(pickTemplate(pool, seed), baseVars);
    }
    if (id === 'q12') {
      const pool = [
        '{area}では{terrain}など、ポータルだけでは拾いきれないニュアンスがあります。駅距離より「実生活で使う動線」や、再開発・大型案件の影響など、数字に出にくい要素も踏まえてご説明します。',
        '同じ町内でも区画によって、人気の間取りや住み替えの理由が違います。{terrain}は内見のポイントが変わるので、写真だけでなく現地の空気感も一緒に確認したいです。',
        '{area}の取引実績から、築年数・管理形態・周辺環境で後悔しやすい点も先に洗い出します。{terrain}の事例は特に注意点を具体でお話しします。',
      ] as const;
      return applyTemplateVars(pickTemplate(pool, seed), baseVars);
    }
    if (id === 'q13') {
      const pool = [
        'お急ぎの査定・内見のご希望には、できる限り当日〜翌営業日で枠をご案内します。状況によってはオンラインで先に条件整理から始めることも可能です。まずはご希望日時をお知らせください。',
        '複数物件の内見を続ける日程調整もお手伝いします。午前に枠が空く日は先に抑えやすいので、お早めのご連絡があると助かります。',
        '売却のタイムラインが決まっている場合は、逆向きにスケジュールを組み立てます。ご契約までの目安はケースによりますが、最初の打ち合わせで段取りをはっきりお伝えします。',
      ] as const;
      return applyTemplateVars(pickTemplate(pool, seed), baseVars);
    }
    if (id === 'q14') {
      const pool = [
        '地域の清掃イベントや防災訓練、商店街の活性化などに、事業として関わる機会があります。{area}で暮らす方と同じ生活圏のことを知っておきたいので、できる範囲で顔を出しています。',
        '学区や子育て世代の住み替え相談が多いので、学校・保育の動向にも目を通すようにしています。営業色は薄く、地域の話題を共有する機会を大事にしています。',
        '宅地以外にも、空き家や相続物件の相談が増えている地域です。{area}の街づくりの文脈を踏まえ、長く付き合える関係を心がけています。',
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
  reform: [
    '「どこから手をつけるか分からない」というリフォームの相談、{area}ではよくいただきます。うちは現地を見たうえで、優先順位を一緒に決めます。見積だけでも構いません。',
    '{area}の住宅事情は築年数も幅があって、同じ内容でも打ち方が変わります。{service}のことは、専門用語を減らして段取りからご説明します。',
    '追加費用が怖い方が多いので、最初に「ここまで込み／別途になり得る条件」をはっきり書きます。{area}でも同じやり方で、驚かせないようにしています。',
    '派手な営業はしません。{area}でリフォームを考えているなら、まず写真や図面を見せてください。話を聞いてから、やる範囲は一緒に決めましょう。',
  ],
  real_estate: [
    '不動産は一度決めると変えにくいからこそ、{area}では数字の根拠とリスクの両方をお話しします。売却も購入も、まずはご状況を聞かせてください。',
    '「この物件で大丈夫？」という不安は普通です。{area}の{service}は、立地・価格・管理の観点を整理しながら、無理な進め方はしません。',
    '仲介手数料や諸費用は取引によって違います。{area}でも内訳を先にご説明し、比較しやすいようにまとめます。押し売りはしません。',
    'ポータルの情報だけでは分からない近隣の事情もあります。{area}で物件をお探し・ご売却の方は、内見や査定の前に一度声をかけてください。',
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

const TONE_CREDIBILITY_REAL_ESTATE: readonly string[] = [
  '{area}では売却・購入の両面で相談をいただくことが多く、根拠のある説明を心がけています。過去事例や近隣相場は、可能な範囲で根拠とセットでお示します。',
  'うちは派手な宣伝より、契約後も説明が追いつく関係を重視します。{service}の条件・手続きは専門用語を減らし、{area}のお客様に複数回お話しします。',
  '宅地建物取引士の知識と、現場でよく聞く不安のパターンの両方を大事にしています。{area}の不動産は一つひとつ丁寧に整理してからご提案します。',
  '「売れなかった時は？」「買い遅れた時は？」など、出口の話も先にします。{area}で長くやっているからこそ、楽観だけの説明はしません。',
];

const TONE_LOCAL_REAL_ESTATE: readonly string[] = [
  '{area}の住環境・生活利便・学区の傾向は案件ごとに変わります。地図上の距離だけでなく、日常の動線感でエリアをご案内します。',
  '駅前と住宅街の境目、再開発の影響など、数字に出にくい要素も{area}では意識しています。{service}は地域の文脈に合わせて条件を一緒に整えます。',
  '他社様の物件も含め、比較しやすいよう資料の見方からお手伝いします。{area}に根ざした情報を、偏りなくお伝えします。',
  'オンライン相談・内見同行の調整も、遠方のお客様には特に丁寧に行います。{area}周辺の打ち合わせ場所も相談に応じます。',
];

const TONE_EMPATHY_REAL_ESTATE: readonly string[] = [
  '「この価格で大丈夫？」「後から追加費用が出ない？」という不安、よく聞きます。{area}のうちでは諸費用の内訳から先に説明し、無理な進行はしません。',
  '売却では思い出の家、購入では人生の一大事。{service}の話は急がず、ペースはお客様に合わせます。',
  '初めての取引でも、重要事項は噛み砕いて繰り返し説明します。{area}では「分からない」を放置しないよう心がけています。',
  '条件が合わなければ止めてもらって構いません。{area}で納得いくまで伴走するのが当たり前だと思っています。',
];

const TONE_DIFFERENTIATION_REAL_ESTATE: readonly string[] = [
  '価格だけで勝負するより、リスクと選択肢を並べて選べるようにします。{area}の{service}は、説明の厚みで差をつけています。',
  '広告費を過剰にかけず、担当が最後まで同じ顔で見るスタイルです。引き継ぎで情報が抜けないよう工夫しています。',
  '契約書・付帯設備表の読み方も、初めての方向けにお伝えします。{area}のお客様に「読んでから決めた」と言ってもらえるよう努めます。',
  '他社の査定や提案とも比較しやすいよう、根拠を箇条書きで残します。{service}後のフォロー項目も最初に確認します。',
];

const TONE_STORY_REAL_ESTATE: readonly string[] = [
  '売却が決まったあと「よかった」と言ってもらえるのが励みです。{area}で安心して次の一歩を踏み出してもらいたいです。',
  'うまくいかなかった事例から学び、今は最初のヒアリングの項目を増やしています。{service}も同じです。',
  '「うちも相談しよう」と知人に紹介してもらえると何よりです。{area}での長いお付き合いを大切にしています。',
  '十年後も住み替えや資産整理で頼ってもらえたら最高です。{area}の{service}は、その関係を目指します。',
];

function toneCredibility(family: ServiceFamily): readonly string[] {
  if (family === 'garden') return TONE_CREDIBILITY_GARDEN;
  if (family === 'real_estate') return TONE_CREDIBILITY_REAL_ESTATE;
  return TONE_CREDIBILITY_BASE;
}
function toneLocal(family: ServiceFamily): readonly string[] {
  if (family === 'garden') return TONE_LOCAL_GARDEN;
  if (family === 'real_estate') return TONE_LOCAL_REAL_ESTATE;
  return TONE_LOCAL_BASE;
}
function toneEmpathy(family: ServiceFamily): readonly string[] {
  if (family === 'garden') return TONE_EMPATHY_GARDEN;
  if (family === 'real_estate') return TONE_EMPATHY_REAL_ESTATE;
  return TONE_EMPATHY_BASE;
}
function toneDifferentiation(family: ServiceFamily): readonly string[] {
  if (family === 'garden') return TONE_DIFFERENTIATION_GARDEN;
  if (family === 'real_estate') return TONE_DIFFERENTIATION_REAL_ESTATE;
  return TONE_DIFFERENTIATION_BASE;
}
function toneStory(family: ServiceFamily): readonly string[] {
  if (family === 'garden') return TONE_STORY_GARDEN;
  if (family === 'real_estate') return TONE_STORY_REAL_ESTATE;
  return TONE_STORY_BASE;
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
