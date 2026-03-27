/** ターゲットエリア・対応サービス（分割用） */
export const SPLIT_QUESTIONS = [
  {
    id: 'target_areas',
    label: 'ターゲットエリア（複数入力可 / カンマ区切り）',
    placeholder: '例：名古屋, 春日井, 小牧',
  },
  {
    id: 'target_services',
    label: '対応サービス（複数入力可 / カンマ区切り）',
    placeholder: '例：剪定, 伐採, 草刈り',
  },
] as const;

export const LOCAL_QUESTION_BLOCKS = [
  {
    title: '信頼・実績',
    questions: [
      { id: 'q1', label: '屋号と創業年数' },
      { id: 'q2', label: '代表者名と開始のきっかけ' },
      { id: 'q3', label: '総施工件数' },
      { id: 'q4', label: '保有資格' },
      { id: 'q5', label: '表彰/メディア実績' },
      { id: 'q6', label: '業界歴' },
      { id: 'q7', label: '地元で続ける理由' },
      { id: 'q8', label: 'スタッフ経験年数' },
      { id: 'q9', label: '保証内容' },
      { id: 'q10', label: '自社施工へのこだわり' },
    ],
  },
  {
    title: '地域・親近感',
    questions: [
      { id: 'q11', label: '対応エリア' },
      { id: 'q12', label: '特に詳しい場所' },
      { id: 'q13', label: '駆けつけスピード' },
      { id: 'q14', label: '地域活動' },
      { id: 'q15', label: '地元の気候に合わせた工夫' },
      { id: 'q16', label: '事務所の場所' },
      { id: 'q17', label: '無料範囲' },
      { id: 'q18', label: '担当者は地元人か' },
      { id: 'q19', label: '近隣配慮' },
      { id: 'q20', label: 'トラブル対応時間' },
    ],
  },
  {
    title: 'ターゲットの痛み',
    questions: [
      { id: 'q21', label: '他店で断られた相談' },
      { id: 'q22', label: '他社での失敗談' },
      { id: 'q23', label: '顧客の不安' },
      { id: 'q24', label: '諦めている理由' },
      { id: 'q25', label: '迷う理由' },
      { id: 'q26', label: '時間対策' },
      { id: 'q27', label: '女性/高齢者への配慮' },
      { id: 'q28', label: '業界の悪いイメージの払拭' },
      { id: 'q29', label: '追加料金への回答' },
      { id: 'q30', label: '相談のみへのスタンス' },
    ],
  },
  {
    title: '差別化・強み',
    questions: [
      { id: 'q31', label: '大手に負けない小回り' },
      { id: 'q32', label: '他店がやらない仕事' },
      { id: 'q33', label: '安さの理由' },
      { id: 'q34', label: '驚かれるサービス' },
      { id: 'q35', label: '道具/材料のこだわり' },
      { id: 'q36', label: 'アフターフォロー' },
      { id: 'q37', label: '日本一の自負技術' },
      { id: 'q38', label: '説明の工夫' },
      { id: 'q39', label: '見積りの誠実さ' },
      { id: 'q40', label: '完了後のおまけ' },
    ],
  },
  {
    title: 'エピソード・未来',
    questions: [
      { id: 'q41', label: '感動エピソード' },
      { id: 'q42', label: '改善経験' },
      { id: 'q43', label: '職人のいい表情' },
      { id: 'q44', label: '意外な褒め言葉' },
      { id: 'q45', label: '顧客の未来' },
      { id: 'q46', label: '家族への説明' },
      { id: 'q47', label: '地域への想い' },
      { id: 'q48', label: '10年後の姿' },
      { id: 'q49', label: '今悩む人への一言' },
      { id: 'q50', label: '最高の仕事の定義' },
    ],
  },
] as const;

export type RawAnswerKey = `q${number}`;

export function getInitialRawAnswers(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 1; i <= 50; i++) out[`q${i}`] = '';
  return out;
}

/** DB の raw_answers（配列 / オブジェクト / null）を 50 問フォーム用レコードへ */
export function rawAnswersJsonToRecord(raw: unknown): Record<string, string> {
  const base = getInitialRawAnswers();
  if (raw == null) return base;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const qid = typeof o.id === 'string' ? o.id : '';
      if (!qid) continue;
      const answer =
        typeof o.answer === 'string'
          ? o.answer
          : o.answer != null
            ? String(o.answer)
            : '';
      base[qid] = answer;
    }
    return base;
  }
  if (typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string') base[k] = v;
    }
    return base;
  }
  return base;
}

export const Q50_LABELS: Record<string, string> = {};
LOCAL_QUESTION_BLOCKS.forEach((block) => {
  block.questions.forEach((q) => {
    Q50_LABELS[q.id] = q.label;
  });
});
