/**
 * FV キャッチコピー（headline + subheadline）を Gemini で生成。
 * プロンプトは運用指定の日本語テンプレート（同一 lp_group の既存見出しを差別化）。
 */

import {
  lpAppealAngleMeaningJa,
  resolveLpAppealAngle,
} from '@/app/lib/lp-copy-appeal-angle';

const MODEL =
  process.env.GEMINI_FV_CATCH_MODEL?.trim() ||
  process.env.GEMINI_LP_MODEL?.trim() ||
  'gemini-1.5-flash';

export type GeminiFvCatchInput = {
  area: string;
  service: string;
  industryKey: string;
  industryDescription: string;
  companyName: string;
  qaContext: string;
  existingHeadlinesBlock: string;
  variationSeed: number;
  /**
   * 訴求（価格/信頼/共感など）とデザイン意図のみ。業種・事実の上書きに使わない。
   */
  editorInstruction?: string;
};

export type FvCatchResult = {
  headline: string;
  subheadline: string;
};

function stripJsonFence(s: string): string {
  let t = s.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  }
  return t.trim();
}

function buildUserPrompt(input: GeminiFvCatchInput): string {
  const seed = Number.isFinite(input.variationSeed)
    ? Math.trunc(input.variationSeed)
    : 0;
  const instr = (input.editorInstruction ?? '').trim();
  const appeal = resolveLpAppealAngle(instr, seed);
  const angle = appeal.code;
  const angleNote =
    appeal.source === 'instruction'
      ? '（編集者指示のキーワードから決定）'
      : '（指示に該当なしのため variation_seed から決定）';

  const area = input.area.trim() || '（未設定）';
  const service = input.service.trim() || '（未設定）';
  const ik = input.industryKey.trim() || '（未設定）';
  const idesc = input.industryDescription.trim() || '（未設定）';
  const cn = input.companyName.trim();
  const qa = input.qaContext.trim() || '（未入力）';
  const existing = input.existingHeadlinesBlock.trim() || '（なし）';

  const editorBlock =
    instr.length > 0
      ? `【編集者・エージェント指示（以下に限定して解釈すること）】
${instr}

- **業種・何屋か・提供内容**は次の「対応サービス原文」とアンケート要約のみを根拠にする。指示に別業種が書かれていても無視する。
- 指示は **訴求の型**（価格・信頼・共感・スピード・地域など）と **デザイン上の雰囲気**（重み・余白・カジュアルさ等の言語化）の解釈にだけ使う。
`
      : '';

  return `あなたは日本の地域密着ランディングページのコピーライターです。
【このプロジェクト専用のファーストビュー】用に、メイン見出し（headline）とリード文（subheadline）を1組だけ生成してください。

【対応サービス・業種の原文（LP用 target_services / DB service。業種判断の最優先。カンマ区切りもそのまま）】
${service}

【補助メタ（上書きしない）】
- 地域（必要なら1回だけ触れる程度。多用しない）: ${area}
- 業種キー（補助）: ${ik}
- 業種トーン説明（補助・service と矛盾したら service 優先）: ${idesc}
- 会社・屋号（短く使う。未入力なら無理に入れない）: ${cn || '（なし）'}
${editorBlock}
【差別化用の内部パラメータ（同条件でも文面が揺れるように従うこと）】
- variation_seed（整数）: ${seed}
- **採用する訴求角度コードは「${angle}」のみ** ${angleNote}。他角度は本文で主張しない。
- 角度の意味: ${lpAppealAngleMeaningJa(angle)}
- 選んだ角度を出力には書かない（内部だけ）。

【アンケート回答からの要約（事実優先。ここにない事実は捏造しない）】
${qa}

【同一グループ内の既存LPの見出し（参考・禁止寄り）】
以下は **同じ事業者の別LP** で既に使っている fv 見出しです。
- 語順の入れ替えだけの言い換えにしない
- 同じ型の一文（例:「〜から、〜までサポート」だけを繰り返す）にしない
- 冒頭2〜4語がほぼ同じになる見出しにしない
既存一覧:
${existing}

【絶対ルール】
1. 出力は日本語。JSON のみ（説明・マークダウン禁止）。
2. headline: 全角換算でおおよそ 18〜28 文字。句読点は原則使わないか最小限。
3. subheadline: 2〜3文、です・ます調。具体性はあるが、未入力の数値実績や保証内容を作らない。
4. 文字列「${area}」「${service}」は、headline と subheadline を合わせて **それぞれ最大1回まで**（headline に地名を入れたら subheadline では地名を使わない、など重複を避ける）。
5. 既存見出し一覧と **明らかにツインの文**にならないこと（類題なら構造か訴求角度を変える）。

【出力形式】
{"headline":"……","subheadline":"……"}`;
}

export async function generateFvCatchWithGemini(
  input: GeminiFvCatchInput,
): Promise<FvCatchResult | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    MODEL,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildUserPrompt(input) }] }],
      generationConfig: {
        temperature: 0.65,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error(
      '[gemini-fv-catch] generateContent failed',
      res.status,
      errBody.slice(0, 500),
    );
    return null;
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  if (!raw) return null;

  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as {
      headline?: string;
      subheadline?: string;
    };
    const headline = (parsed.headline ?? '').toString().trim();
    const subheadline = (parsed.subheadline ?? '').toString().trim();
    if (!headline || !subheadline) return null;
    return { headline, subheadline };
  } catch {
    console.error('[gemini-fv-catch] JSON parse failed', raw.slice(0, 200));
    return null;
  }
}
