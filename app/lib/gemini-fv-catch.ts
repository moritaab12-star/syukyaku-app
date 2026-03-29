/**
 * FV キャッチコピー（headline + subheadline）を Gemini で生成。
 * プロンプトは運用指定の日本語テンプレート（同一 lp_group の既存見出しを差別化）。
 */

const MODEL =
  process.env.GEMINI_FV_CATCH_MODEL?.trim() ||
  process.env.GEMINI_LP_MODEL?.trim() ||
  'gemini-1.5-flash';

const ANGLE_FROM_SEED = ['A', 'B', 'C', 'D', 'E'] as const;

export type GeminiFvCatchInput = {
  area: string;
  service: string;
  industryKey: string;
  industryDescription: string;
  companyName: string;
  qaContext: string;
  existingHeadlinesBlock: string;
  variationSeed: number;
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
  const angle =
    ANGLE_FROM_SEED[((seed % 5) + 5) % 5] ?? 'A';

  const area = input.area.trim() || '（未設定）';
  const service = input.service.trim() || '（未設定）';
  const ik = input.industryKey.trim() || '（未設定）';
  const idesc = input.industryDescription.trim() || '（未設定）';
  const cn = input.companyName.trim();
  const qa = input.qaContext.trim() || '（未入力）';
  const existing = input.existingHeadlinesBlock.trim() || '（なし）';

  return `あなたは日本の地域密着ランディングページのコピーライターです。
【このプロジェクト専用のファーストビュー】用に、メイン見出し（headline）とリード文（subheadline）を1組だけ生成してください。

【メタ情報】
- 地域（必要なら1回だけ触れる程度。多用しない）: ${area}
- サービス・業種の要約: ${service}
- 業種キー: ${ik}
- 業種の文脈・トーン説明: ${idesc}
- 会社・屋号（短く使う。未入力なら無理に入れない）: ${cn || '（なし）'}

【差別化用の内部パラメータ（同条件でも文面が揺れるように従うこと）】
- variation_seed（整数）: ${seed}
- **この seed で割り当てた訴求角度コードは「${angle}」のみ**（他の角度は本文で主張しない）。
- 角度の意味:
  (A) 手順・段取りのわかりやすさ
  (B) 不安・よくある失敗の先回り
  (C) 人柄・寄り添い・対話
  (D) 地域・現場経験（ただし地名の連発は禁止ルールに従う）
  (E) 誠実さ・説明・見積／追加費用の扱い
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
