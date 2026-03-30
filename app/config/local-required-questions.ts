/**
 * ローカル・現場系 LP の raw_answers 必須 q id（CV 直結の最低限）。
 * 不動産等は validate 側で industry トーンによりスキップ（別セットは後続タスク）。
 */

export const LOCAL_REQUIRED_FIELDWORK_Q_IDS = [
  'q1',
  'q3',
  'q4',
  'q9',
  'q11',
  'q13',
  'q17',
  'q23',
  'q25',
  'q29',
  'q30',
  'q31',
  'q33',
  'q36',
  'q39',
] as const;

export type LocalRequiredFieldworkQId =
  (typeof LOCAL_REQUIRED_FIELDWORK_Q_IDS)[number];

export const REQUIRED_LOCAL_Q_ERROR_MESSAGES: Record<
  LocalRequiredFieldworkQId,
  string
> = {
  q1: '屋号・創業年などの基本情報が未入力です',
  q3: '実績・件数に関する情報が未入力です',
  q4: '資格・許可の情報が未入力です',
  q9: '保証内容が未入力です',
  q11: '対応エリアが未入力です',
  q13: 'お伺いまでの目安・スピードが未入力です',
  q17: '無料範囲（無料見積など）が未入力です',
  q23: 'お客様の不安に応える内容が未入力です',
  q25: '依頼の迷いに答える内容が未入力です',
  q29: '追加料金の説明が未入力です',
  q30: '相談のみ可否・営業スタンスが未入力です',
  q31: '小回り・柔軟対応の説明が未入力です',
  q33: '料金・価格の考え方が未入力です',
  q36: 'アフターフォローが未入力です',
  q39: '見積もりの分かりやすさが未入力です',
};

export function isLocalFieldworkRequiredQ(id: string): boolean {
  return (LOCAL_REQUIRED_FIELDWORK_Q_IDS as readonly string[]).includes(id);
}
