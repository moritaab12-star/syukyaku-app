/**
 * Perplexity 応答から URL 配列を抽出（JSON 優先、フォールバックで正規表現）。
 */

function stripFence(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1]!.trim();
  return t;
}

export function parseUrlsFromAssistantText(text: string, maxUrls = 24): string[] {
  const trimmed = stripFence(text);
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const slice = jsonMatch ? jsonMatch[0] : trimmed;

  try {
    const parsed = JSON.parse(slice) as {
      urls?: unknown;
      candidates?: unknown;
    };
    const rawList = parsed.urls ?? parsed.candidates;
    if (Array.isArray(rawList)) {
      const out: string[] = [];
      for (const item of rawList) {
        if (typeof item === 'string' && /^https?:\/\//i.test(item.trim())) {
          out.push(item.trim());
        } else if (item && typeof item === 'object' && 'url' in item) {
          const u = (item as { url?: unknown }).url;
          if (typeof u === 'string' && /^https?:\/\//i.test(u.trim())) {
            out.push(u.trim());
          }
        }
        if (out.length >= maxUrls) break;
      }
      return dedupeUrls(out);
    }
  } catch {
    /* fall through */
  }

  const loose = trimmed.match(/https?:\/\/[^\s"'<>)\]}]+/gi) ?? [];
  return dedupeUrls(loose.map((u) => u.replace(/[.,;]+$/, '')).slice(0, maxUrls));
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const normalized = normalizeUrlKey(u);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(u);
  }
  return out;
}

function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.href;
  } catch {
    return '';
  }
}
