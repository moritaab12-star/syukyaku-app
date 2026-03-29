import type { LpTheme, ParsedInstruction } from '@/app/lib/agent/types';
import { geminiGenerateJson, stripJsonFence } from '@/app/lib/agent/gemini-json';

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

function fallbackThemes(parsed: ParsedInstruction): LpTheme[] {
  const n = parsed.count;
  const base = `${parsed.area}${parsed.service}`.trim() || '地域サービス';
  const out: LpTheme[] = [];
  for (let i = 0; i < n; i++) {
    const suffix =
      parsed.target || parsed.appeal
        ? ` ${i + 1} ${(parsed.target || parsed.appeal).slice(0, 40)}`
        : ` 訴求バリエーション${i + 1}`;
    out.push({ title: `${base}${suffix}`.trim().slice(0, 120) });
  }
  return dedupeThemes(out);
}

/**
 * count 件の重複なしテーマ。Gemini 失敗時は簡易フォールバック。
 */
export async function planLpThemes(parsed: ParsedInstruction): Promise<LpTheme[]> {
  const n = parsed.count;
  const prompt = `あなたはSEO担当です。同じ事業者のランディングページを${n}本作るため、キーワード見出し（検索クエリ想定）を${n}個、日本語で列挙してください。

【地域】${parsed.area}
【サービス】${parsed.service}
【ターゲット補足】${parsed.target || '（なし）'}
【訴求補足】${parsed.appeal || '（なし）'}

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
      const deduped = dedupeThemes(themes);
      if (deduped.length >= n) {
        return deduped.slice(0, n);
      }
      if (deduped.length > 0) {
        const fb = fallbackThemes({ ...parsed, count: n - deduped.length });
        return dedupeThemes([...deduped, ...fb]).slice(0, n);
      }
    } catch (e) {
      console.error('[agent] planLpThemes parse', e);
    }
  }

  console.error('[agent] planLpThemes: fallback themes');
  return fallbackThemes(parsed).slice(0, n);
}
