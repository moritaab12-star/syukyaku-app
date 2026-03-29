import type { LpUiCopy } from '@/app/lib/lp-ui-copy';
import type {
  AgentAppealMode,
  CommonPatternSummary,
  ParsedInstruction,
} from '@/app/lib/agent/types';
import { geminiGenerateJson, stripJsonFence } from '@/app/lib/agent/gemini-json';

const LP_UI_COPY_KEYS = new Set<string>([
  'headline',
  'subheadline',
  'hero_badge_label',
  'hero_cta_primary_phone',
  'hero_cta_primary_web',
  'hero_cta_note',
  'line_cta_label',
  'cta_second_primary_phone',
  'cta_second_primary_web',
  'cta_second_title',
  'cta_second_lead',
  'cta_second_note',
  'problems_title',
  'problems_lead',
  'problems_bullets',
  'diagnosis_lead',
  'diagnosis_check_items',
  'diagnosis_cta_phone',
  'diagnosis_cta_web',
  'consultation_lead',
  'consultation_form_cta',
  'consultation_note',
  'trust_inline_title',
  'trust_inline_lead',
  'benefit_inline_title',
  'benefit_inline_lead',
]);

export type ApplyEnhancementInput = {
  mode: AgentAppealMode;
  themeTitle: string;
  parsed: ParsedInstruction;
  rawAnswers: unknown;
  patternSummary: CommonPatternSummary | null;
};

function rawAnswersSnippet(raw: unknown, maxChars: number): string {
  if (!Array.isArray(raw)) return '';
  const parts: string[] = [];
  let len = 0;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const o = entry as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : '';
    const ansRaw = o.answer;
    const ans =
      typeof ansRaw === 'string'
        ? ansRaw.trim().slice(0, 220)
        : ansRaw != null
          ? String(ansRaw).trim().slice(0, 220)
          : '';
    if (!id || !ans) continue;
    const line = `${id}: ${ans}`;
    if (len + line.length > maxChars) break;
    parts.push(line);
    len += line.length + 1;
  }
  return parts.join('\n');
}

function pickPatch(raw: Record<string, unknown>): Partial<LpUiCopy> {
  const out: Partial<LpUiCopy> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!LP_UI_COPY_KEYS.has(k)) continue;
    if (k === 'problems_bullets' || k === 'diagnosis_check_items') {
      if (!Array.isArray(v)) continue;
      const arr = v
        .filter((x) => typeof x === 'string' && x.trim().length > 0)
        .map((x) => String(x).trim())
        .slice(0, 3);
      if (arr.length) {
        if (k === 'problems_bullets') out.problems_bullets = arr;
        else out.diagnosis_check_items = arr;
      }
      continue;
    }
    if (typeof v !== 'string' || !v.trim()) continue;
    const t = v.trim().slice(0, 500);
    (out as Record<string, string>)[k] = t;
  }
  return out;
}

function staticFallback(input: ApplyEnhancementInput): Partial<LpUiCopy> {
  const { mode, themeTitle, parsed } = input;
  const area = parsed.area || '地域';
  const svc = parsed.service || 'サービス';
  switch (mode) {
    case 'price':
      return {
        problems_title: `${svc}の料金・費用でお悩みの方へ`,
        problems_lead: `${area}エリアの相場感と、お見積りの進め方をわかりやすく整理しました。`,
        hero_cta_primary_web: '無料見積りを依頼する',
        cta_second_title: '料金の不安をまず解消',
        cta_second_lead:
          '現地調査のうえ、内訳がわかるお見積りをご提示します（内容は会社方針に沿って調整してください）。',
      };
    case 'urgency':
      return {
        problems_title: '放っておくとリスクが広がる前に',
        problems_lead: `${themeTitle}について、早めの点検・相談のすすめです。`,
        hero_cta_primary_web: '急ぎで相談する',
        diagnosis_lead: '次に当てはまる方は、早めの確認をおすすめします。',
      };
    case 'empathy':
      return {
        problems_title: '不安やお悩みがある方へ',
        problems_lead: `${area}の${svc}について、よくあるお悩みに寄り添う内容です。`,
        consultation_lead: '無理な押し売りはせず、状況を伺ったうえでご提案します。',
      };
    case 'local':
      return {
        hero_badge_label: `${area}対応`,
        trust_inline_title: `${area}エリアに薄く入った対応`,
        trust_inline_lead:
          '地域の特性を踏まえ、無理のないご提案を心がけています。',
      };
    case 'trust':
    default:
      return {
        trust_inline_title: '選ばれる理由・安心の取り組み',
        trust_inline_lead: `${svc}において、実績と姿勢を大切にしています。`,
        cta_second_title: 'まずは話を聞いてみる',
      };
  }
}

/**
 * mode + 調査サマリから lp_ui_copy パッチを生成（競合文言の直コピー禁止）。
 */
export async function applyEnhancement(
  input: ApplyEnhancementInput,
): Promise<Partial<LpUiCopy>> {
  const snippet = rawAnswersSnippet(input.rawAnswers, 4000);
  const pat = input.patternSummary;
  const patLine = pat
    ? [
        `sections:${pat.commonSections.slice(0, 8).join(',')}`,
        `ctas:${pat.commonCtas.slice(0, 6).join(',')}`,
        `headline_slots:${pat.commonHeadlines.slice(0, 6).join(',')}`,
        `notes:${pat.notes.slice(0, 4).join(' | ')}`,
      ].join('\n')
    : '（調査なし）';

  const prompt = `あなたはランディングページの編集者です。次の条件で lp_ui_copy の差分だけを JSON で返してください。

【訴求モード】${input.mode}
【テーマ】${input.themeTitle}
【地域】${input.parsed.area}
【サービス】${input.parsed.service}
【ターゲット補足】${input.parsed.target || 'なし'}
【訴求補足】${input.parsed.appeal || 'なし'}

【アンケート要約（事実のみ・これを最優先）】
${snippet || '（要約なし）'}

【参照ページの抽象パターン（ラベル。文言のコピー禁止）】
${patLine}

厳守:
- 出力は JSON オブジェクトのみ（追加キー禁止）。
- 使えるキーは次のいずれかだけ: hero_badge_label, hero_cta_primary_phone, hero_cta_primary_web, hero_cta_note, line_cta_label, cta_second_primary_phone, cta_second_primary_web, cta_second_title, cta_second_lead, cta_second_note, problems_title, problems_lead, problems_bullets, diagnosis_lead, diagnosis_check_items, diagnosis_cta_phone, diagnosis_cta_web, consultation_lead, consultation_form_cta, consultation_note, trust_inline_title, trust_inline_lead, benefit_inline_title, benefit_inline_lead, headline, subheadline
- problems_bullets / diagnosis_check_items は文字列配列（最大3件）。
- 競合サイトの文をそのまま使わない。抽象パターンは「強弱」の参考だけ。
- アンケートに無い数字・保証・料金の断定は書かない。
- 日本語。値は短く具体的に。`;

  const raw = await geminiGenerateJson(prompt);
  if (raw) {
    try {
      const j = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>;
      const patch = pickPatch(j);
      if (Object.keys(patch).length > 0) {
        return patch;
      }
    } catch (e) {
      console.error('[agent] applyEnhancement parse', e);
    }
  }

  console.error('[agent] applyEnhancement: static fallback');
  return staticFallback(input);
}
