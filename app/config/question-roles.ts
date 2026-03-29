/**
 * raw_answers 設問の役割（LP 生成時のコンテキスト優先度）。
 *
 * - **Grounding（A / A主B副 / B主A副の事実側）** … テキスト生成のたびに厚めで渡す。
 * - **Voice only（主にB）** … 独自性用。Grounding のあと残り予算で渡す。
 *
 * 分類は「LP制作ツール設計アドバイザ」基準（q1〜q50・questions.ts 同期）。
 * 設問の追加・変更時は `app/admin/projects/new/questions.ts` と整合を取ること。
 */

/** 事実アンカーとして優先的にコンテキストへ含める設問ID（q番号昇順で走査する） */
export const RAW_ANSWER_GROUNDING_QUESTION_IDS: readonly string[] = [
  'q1',
  'q2',
  'q3',
  'q4',
  'q5',
  'q6',
  'q8',
  'q9',
  'q10',
  'q11',
  'q12',
  'q13',
  'q15',
  'q16',
  'q17',
  'q18',
  'q19',
  'q20',
  'q21',
  'q26',
  'q27',
  'q29',
  'q30',
  'q32',
  'q33',
  'q35',
  'q36',
  'q37',
  'q39',
  'q40',
  'q42',
];

/** 独自性中心。Grounding と重複させない（ハイブリッド設問は Grounding 側のみ） */
export const RAW_ANSWER_VOICE_ONLY_QUESTION_IDS: readonly string[] = [
  'q7',
  'q14',
  'q22',
  'q23',
  'q24',
  'q25',
  'q28',
  'q31',
  'q34',
  'q38',
  'q41',
  'q43',
  'q44',
  'q45',
  'q46',
  'q47',
  'q48',
  'q49',
  'q50',
];

const GROUNDING_SET = new Set(RAW_ANSWER_GROUNDING_QUESTION_IDS);
const VOICE_SET = new Set(RAW_ANSWER_VOICE_ONLY_QUESTION_IDS);

export function isGroundingQuestionId(id: string): boolean {
  return GROUNDING_SET.has(id.trim().toLowerCase());
}

export function isVoiceOnlyQuestionId(id: string): boolean {
  return VOICE_SET.has(id.trim().toLowerCase());
}
