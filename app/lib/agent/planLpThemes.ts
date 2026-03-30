import type { KeywordResearchCandidate } from '@/app/lib/perplexity-keyword-research';
import type { LpTheme, ParsedInstruction } from '@/app/lib/agent/types';
import { geminiGenerateJson, stripJsonFence } from '@/app/lib/agent/gemini-json';

export type PlanLpThemesOptions = {
  /** 未指定時は parsed.count */
  targetCount?: number;
  avoidKeywords?: string[];
  /** 同一LPグループ向け Perplexity 候補（参考。コピペ固定しない） */
  keywordCandidates?: KeywordResearchCandidate[];
};

function normalizeThemeComparable(s: string): string {
  return s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildAvoidNormSet(avoidKeywords: string[]): Set<string> {
  const set = new Set<string>();
  for (const a of avoidKeywords) {
    const n = normalizeThemeComparable(a);
    if (n.length >= 2) set.add(n);
  }
  return set;
}

/** 丸被り、または十分長いフレーズ同士の包含 */
function clashesAvoid(title: string, avoidNorm: Set<string>): boolean {
  const t = normalizeThemeComparable(title);
  if (!t) return false;
  if (avoidNorm.has(t)) return true;
  for (const a of avoidNorm) {
    if (a.length >= 8 && t.length >= 8 && (t.includes(a) || a.includes(t))) {
      return true;
    }
  }
  return false;
}

function capAvoidForPrompt(avoid: string[], maxLines: number, maxChars: number): string[] {
  const out: string[] = [];
  let n = 0;
  for (const line of avoid) {
    if (out.length >= maxLines) break;
    const slice = line.slice(0, 200);
    if (n + slice.length + 1 > maxChars) break;
    out.push(slice);
    n += slice.length + 1;
  }
  return out;
}

function formatAvoidPromptSection(avoid: string[]): string {
  const capped = capAvoidForPrompt(avoid, 36, 3200);
  if (capped.length === 0) return '';
  const lines = capped.map((x, i) => `${i + 1}. ${x}`);
  return `

【既存LPですでに使っているテーマ・キーワード（新規テーマと被らせない）】
${lines.join('\n')}
- 上記と同一の見出しにしないこと。言い換えのみの言い回しや、同じ検索意図の焼き直しも避けること。
- 既存と別の切り口・検索意図になるようにすること。`;
}

function formatKeywordCandidatesSection(candidates: KeywordResearchCandidate[]): string {
  const cap = candidates.slice(0, 18);
  if (cap.length === 0) return '';
  const lines = cap.map((c, i) => {
    const bits = [c.intent, c.note].filter(Boolean).join(' — ');
    return bits
      ? `${i + 1}. ${c.keyword}（${bits}）`
      : `${i + 1}. ${c.keyword}`;
  });
  return `

【需要リサーチのキーワード候補（参考・Perplexity）】
${lines.join('\n')}
- 上記を優先的に活かしつつ、すべてをそのままコピーする必要はない。不足する切り口は追加してよい。
- 既存LP回避リストと矛盾しないこと。`;
}

function dedupeThemes(themes: LpTheme[]): LpTheme[] {
  const seen = new Set<string>();
  const out: LpTheme[] = [];
  for (const t of themes) {
    const k = t.title.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ title: t.title.trim() });
  }
  return out;
}

function fallbackThemes(
  parsed: ParsedInstruction,
  n: number,
  avoidNorm: Set<string>,
): LpTheme[] {
  const base = `${parsed.area}${parsed.service}`.trim() || '地域サービス';
  const seen = new Set<string>();
  const out: LpTheme[] = [];
  let i = 0;
  while (out.length < n && i < n * 24) {
    i += 1;
    const suffix =
      parsed.target || parsed.appeal
        ? ` ${i} ${(parsed.target || parsed.appeal).slice(0, 40)}`
        : ` 訴求バリエーション${i}`;
    const title = `${base}${suffix}`.trim().slice(0, 120);
    const k = normalizeThemeComparable(title);
    if (!k || seen.has(k)) continue;
    if (clashesAvoid(title, avoidNorm)) continue;
    seen.add(k);
    out.push({ title });
  }
  let salt = 0;
  while (out.length < n) {
    salt += 1;
    const title =
      `${base} 追加案${salt}-${Date.now().toString(36).slice(-5)}`.slice(0, 120);
    const k = normalizeThemeComparable(title);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ title });
  }
  return dedupeThemes(out);
}

/**
 * count 件の重複なしテーマ。Gemini 失敗時は簡易フォールバック。
 * avoidKeywords: 同一LPグループ履歴など（過去の keyword / title）。
 */
export async function planLpThemes(
  parsed: ParsedInstruction,
  options?: PlanLpThemesOptions,
): Promise<LpTheme[]> {
  const n = options?.targetCount ?? parsed.count;
  const avoidKeywords = options?.avoidKeywords ?? [];
  const avoidNorm = buildAvoidNormSet(avoidKeywords);
  const avoidBlock = formatAvoidPromptSection(avoidKeywords);
  const candidatesBlock = formatKeywordCandidatesSection(
    options?.keywordCandidates ?? [],
  );

  const prompt = `あなたはSEO担当です。同じ事業者のランディングページを${n}本作るため、キーワード見出し（検索クエリ想定）を${n}個、日本語で列挙してください。

【地域】${parsed.area}
【サービス】${parsed.service}
【ターゲット補足】${parsed.target || '（なし）'}
【訴求補足】${parsed.appeal || '（なし）'}
${avoidBlock}${candidatesBlock}

厳守:
- ちょうど ${n} 個（多めも少なめも禁止）
- 各テーマは互いに異なり、検索意図を分散（単に語順を入れ替えない）
- 地域名とサービス名を毎行で無意味に繰り返さない（必要最小限）
- 出力は JSON のみ: { "themes": [ "...", ... ] } 配列の文字列は各60文字以内推奨`;

  const raw = await geminiGenerateJson(prompt);
  if (raw) {
    try {
      const j = JSON.parse(stripJsonFence(raw)) as { themes?: unknown };
      const arr = Array.isArray(j.themes) ? j.themes : [];
      const themes: LpTheme[] = [];
      for (const x of arr) {
        if (typeof x === 'string' && x.trim()) {
          themes.push({ title: x.trim().slice(0, 120) });
        }
      }
      let deduped = dedupeThemes(themes).filter((t) => !clashesAvoid(t.title, avoidNorm));
      if (deduped.length >= n) {
        return deduped.slice(0, n);
      }
      if (deduped.length > 0) {
        const need = n - deduped.length;
        const fb = fallbackThemes(parsed, need, avoidNorm);
        deduped = dedupeThemes([...deduped, ...fb])
          .filter((t) => !clashesAvoid(t.title, avoidNorm))
          .slice(0, n);
        if (deduped.length >= n) {
          return deduped;
        }
        const fb2 = fallbackThemes(parsed, n - deduped.length, avoidNorm);
        return dedupeThemes([...deduped, ...fb2])
          .filter((t) => !clashesAvoid(t.title, avoidNorm))
          .slice(0, n);
      }
    } catch (e) {
      console.error('[agent] planLpThemes parse', e);
    }
  }

  console.error('[agent] planLpThemes: fallback themes');
  return dedupeThemes(fallbackThemes(parsed, n, avoidNorm)).slice(0, n);
}
