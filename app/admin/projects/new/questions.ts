/**
 * LP アンケート設問（q1〜q50）。
 * 必須15（現場系ローカル）は `app/config/local-required-questions.ts` と同期すること。
 * 生成時の「事実アンカー」は `app/config/question-roles.ts` とも整合させること。
 * LP パック用の整形は `buildLpPackSurveyContext`（`raw-answer-suggest.ts`）で Grounding→Voice 順に最適化される。
 */
import { isLocalFieldworkRequiredQ } from '@/app/config/local-required-questions';

export { isLocalFieldworkRequiredQ };
export {
  LOCAL_REQUIRED_FIELDWORK_Q_IDS,
  REQUIRED_LOCAL_Q_ERROR_MESSAGES,
} from '@/app/config/local-required-questions';

/** ターゲットエリア・対応サービス（分割用・任意） */
export const SPLIT_QUESTIONS = [
  {
    id: 'target_areas',
    label:
      'LP用のターゲットエリア（複数ある場合はカンマ区切り・例：名古屋市, 春日井市）',
    placeholder: '例：名古屋市, 春日井市, 小牧市',
  },
  {
    id: 'target_services',
    label:
      'LP用のサービス名・メニュー（複数ある場合はカンマ区切り・例：剪定, 伐採）',
    placeholder: '例：剪定, 伐採, 草刈り, 防草シート',
  },
] as const;

export type LocalQuestionDef = {
  id: string;
  label: string;
  placeholder?: string;
};

export const LOCAL_QUESTION_BLOCKS: ReadonlyArray<{
  title: string;
  questions: readonly LocalQuestionDef[];
}> = [
  {
    title: '信頼・実績',
    questions: [
      {
        id: 'q1',
        label:
          '屋号と創業からの年数（例：◯◯造園 創業から15年）',
        placeholder: '例：緑造園 創業1985年・地域で40年',
      },
      {
        id: 'q2',
        label:
          '代表のお名前と、この仕事を始めたきっかけ（任意・短くてOK）',
        placeholder: '例：代表 山田。祖父の造園業を継ぎました。',
      },
      {
        id: 'q3',
        label:
          'これまでの施工・対応件数や規模の目安（例：年間◯件、累計◯件）',
        placeholder: '例：年間おおよそ120件前後、累計2000件以上',
      },
      {
        id: 'q4',
        label:
          'お持ちの資格・登録・許可（例：造園士技能士、電気工事士など）',
        placeholder: '例：造園施設工事 主任技術者、第一種電気工事士',
      },
      {
        id: 'q5',
        label:
          '受賞歴やメディア掲載など、第三者からの評価があれば（任意）',
        placeholder: '例：地域新聞のリフォーム特集に掲載 など',
      },
      {
        id: 'q6',
        label: 'この仕事に携わって何年か（業界・現場経験の目安）',
        placeholder: '例：業界歴25年、現場監督歴12年',
      },
      {
        id: 'q7',
        label:
          'どうしてこの地域で続けてきたか（任意・一言でも可）',
        placeholder: '例：地元で育ち、地域の安心に繋がりたいから',
      },
      {
        id: 'q8',
        label:
          'スタッフの経験年数や体制（任意）',
        placeholder: '例：職人全員で現場歴10年以上が3名',
      },
      {
        id: 'q9',
        label:
          '保証・施工後フォローの内容（例：施工後◯年、自然災害は別 など具体に）',
        placeholder: '例：施工完了日から2年以内の不具合は無償対応（条件あり）',
      },
      {
        id: 'q10',
        label:
          '自社施工＝品質管理のこだわり（下請け任せにしない等、任意）',
        placeholder: '例：自分たちで責任を持って現場まで一貫して対応します',
      },
    ],
  },
  {
    title: '地域・訪問',
    questions: [
      {
        id: 'q11',
        label:
          '対応している地域・市町村（例：◯◯市全域、隣市は要相談 など）',
        placeholder: '例：名古屋市・春日井市・小牧市。それ以外は要相談',
      },
      {
        id: 'q12',
        label:
          '特に詳しいエリア・地形（任意・例：丘陵地の剪定に強い 等）',
        placeholder: '例：北勢の傾斜地での伐採経験が多い',
      },
      {
        id: 'q13',
        label:
          '現場・お客様の元へ伺うまでの目安（例：お問い合わせ後◯日、急ぎは◯時間など）',
        placeholder: '例：通常2営業日以内に現地確認。急ぎは当日中も相談可',
      },
      {
        id: 'q14',
        label:
          '地域との関わり（祭り協賛、清掃活動など、あれば任意）',
        placeholder: '例：町内会の道路草刈りボランティア年2回',
      },
      {
        id: 'q15',
        label:
          'この地域の気候・環境に合わせた提案の工夫（任意）',
        placeholder: '例：台風後の被害木は優先して駆けつけます',
      },
      {
        id: 'q16',
        label:
          '事務所・拠点の場所（任意・「訪問メインで事務所なし」も可）',
        placeholder: '例：◯◯市◯◯に事務所。主に現場直行です',
      },
      {
        id: 'q17',
        label:
          '無料にできる範囲（例：見積・現地調査・相談は無料 等）',
        placeholder: '例：現地調査とお見積りは無料。設計案のみ有料の場合は明記',
      },
      {
        id: 'q18',
        label:
          '担当は地元在住か（任意）',
        placeholder: '例：代表・主要スタッフは市内在住です',
      },
      {
        id: 'q19',
        label:
          '近隣への配慮（騒音・搬出経路・挨拶まわりなど、任意）',
        placeholder: '例：作業前に近隣へあいさつ。破砕日は事前連絡',
      },
      {
        id: 'q20',
        label:
          'トラブル・緊急時の連絡体制（任意）',
        placeholder: '例：平日は17時まで電話。土日はメールで24h以内に返信',
      },
    ],
  },
  {
    title: 'お客様の不安・迷い',
    questions: [
      {
        id: 'q21',
        label:
          '他店で断られがちな相談でも受け付けている事例（任意）',
        placeholder: '例：狭小地の大木撤去、電線ギャラギリなど',
      },
      {
        id: 'q22',
        label:
          '他社施工の失敗を見てきた経験・フォロー事例（任意）',
        placeholder: '例：安価工事後の手直しを何件かお受けしました',
      },
      {
        id: 'q23',
        label:
          'お客様がよく不安に思うこと（例：料金・手抜き・追加請求・対応の遅さなど）',
        placeholder: '例：見えない部分の料金、伐採後の片付け、再発の不安',
      },
      {
        id: 'q24',
        label:
          '「もう諦めていた」お客様が抱えがちな理由（任意）',
        placeholder: '例：高すぎて断念、相談しても断られた など',
      },
      {
        id: 'q25',
        label:
          '依頼するか迷うポイント（例：価格・他社比較・本当に必要か）',
        placeholder: '例：今すぐじゃなくてもいいか、見積だけで終わるか心配 など',
      },
      {
        id: 'q26',
        label:
          'お忙しい方向けのスケジュール工夫（任意）',
        placeholder: '例：夕方・土曜の現調に対応、書類は郵送でも可',
      },
      {
        id: 'q27',
        label:
          '女性・ご高齢の方への配慮（任意）',
        placeholder: '例：女性スタッフ同席可、説明はゆっくり平易に',
      },
      {
        id: 'q28',
        label:
          '業界の悪いイメージへの向き合い方（任意）',
        placeholder: '例：明朗会計と工程表で、見えない不安を減らします',
      },
      {
        id: 'q29',
        label:
          '追加料金は出るか、その条件や説明の仕方（ない場合も「なぜ」を一言）',
        placeholder: '例：見積範囲外の追加工のみ別途。発生前に必ず合意を取ります',
      },
      {
        id: 'q30',
        label:
          '相談だけでも大丈夫か／しつこい営業はしないか',
        placeholder: '例：見積のみOK。しつこい電話や押し売りはしません',
      },
    ],
  },
  {
    title: '強み・差別化',
    questions: [
      {
        id: 'q31',
        label:
          '大手にない「小回り・柔軟対応」の具体例（現場調整、スケジュールなど）',
        placeholder: '例：狭小地でも重機入替で対応、近所との調整まで代行',
      },
      {
        id: 'q32',
        label:
          '他店が敬遠しがちな仕事で受けていること（任意）',
        placeholder: '例：傾斜地の立木、電線ギャラギリの伐採',
      },
      {
        id: 'q33',
        label:
          '料金を抑えられる理由・適正価格の考え方（安かろう悪かろうではない説明）',
        placeholder: '例：自社職人中心で中間マージンを抑える。ただし安全は妥協しない',
      },
      {
        id: 'q34',
        label:
          'お客様が「ここが良かった」と言いそうなサービス（任意）',
        placeholder: '例：撤去後の敷地をきれいに整えてお渡し',
      },
      {
        id: 'q35',
        label:
          '道具・材料へのこだわり（任意）',
        placeholder: '例：静音チェーンソー、産廃は許可業者へ確実に委託',
      },
      {
        id: 'q36',
        label:
          '施工後のアフターフォロー（定期点検、质保後の相談など）',
        placeholder: '例：完成後1ヶ月の無料点検。以降もメール・電話で相談可',
      },
      {
        id: 'q37',
        label:
          '自信のある技術・職人技（任意・誇張は避ける）',
        placeholder: '例：高所作業・ロープ技術に慣れた班長が在籍',
      },
      {
        id: 'q38',
        label:
          'わかりやすい説明の工夫（図・写真・言葉遣いなど、任意）',
        placeholder: '例： Before/After写真、メンテ時期をカレンダーで提示',
      },
      {
        id: 'q39',
        label:
          'お見積りの分かりやすさ（内訳・条件・総額の示し方）',
        placeholder: '例：項目ごとに単価と数量。割増条件は文末にまとめて記載',
      },
      {
        id: 'q40',
        label:
          '工事後のひと工夫・おまけ（任意）',
        placeholder: '例：簡易な下草処理サービス、剪定枝の薪化 など',
      },
    ],
  },
  {
    title: 'エピソード・メッセージ',
    questions: [
      {
        id: 'q41',
        label:
          '印象に残ったご依頼のエピソード（任意）',
        placeholder: '例：お孫さんの木陰が復活して喜んでいただいた',
      },
      {
        id: 'q42',
        label:
          '失敗やクレームから学んだ改善（任意）',
        placeholder: '例：搬出経路の確認を必ず前日までに図面化した',
      },
      {
        id: 'q43',
        label:
          '現場で「良い表情」ときのエピソード（任意）',
        placeholder: '例：職人が剪定後の形を一緒に眺めて笑顔になった',
      },
      {
        id: 'q44',
        label:
          '意外だったお客様の言葉・感想（任意）',
        placeholder: '例：「若いのに礼儀正しい」と言われた',
      },
      {
        id: 'q45',
        label:
          '依頼後のお客様の生活・イメージの変化（任意）',
        placeholder: '例：庭で子どもが遊べるようになった',
      },
      {
        id: 'q46',
        label:
          'ご家族への説明で心がけていること（任意）',
        placeholder: '例：ご夫婦そろっての説明会、書面もお渡し',
      },
      {
        id: 'q47',
        label:
          'この地域への思い（任意）',
        placeholder: '例：ここで育ったので、長く安心して住める街づくりに貢献したい',
      },
      {
        id: 'q48',
        label:
          '10年後にどうなっていたいか（任意）',
        placeholder: '例：地域の樹木外来種対策の相談先になっていたい',
      },
      {
        id: 'q49',
        label:
          '今ひとりでも悩んでいる方への一言（キーワードLPでは別タグで上書きされる場合あり）',
        placeholder: '例：まずは写真だけでも送ってください。見ないとわからないこともあります',
      },
      {
        id: 'q50',
        label:
          'あなたにとって「最高の仕事」とは（任意）',
        placeholder: '例：お客様が「頼んでよかった」と言ってくれた瞬間',
      },
    ],
  },
];

export const Q50_LABELS: Record<string, string> = {};
LOCAL_QUESTION_BLOCKS.forEach((block) => {
  block.questions.forEach((q) => {
    Q50_LABELS[q.id] = q.label;
  });
});

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