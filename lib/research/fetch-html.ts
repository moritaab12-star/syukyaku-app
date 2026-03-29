/**
 * 軽量 HTML 取得（CV/LP 判定用。本文は保存しない）。
 */

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_BYTES = 120_000;

export type FetchHtmlResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; status: number; detail: string };

export async function fetchHtmlLight(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<FetchHtmlResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en;q=0.5',
        'User-Agent':
          'Mozilla/5.0 (compatible; SyukyakuLpResearch/1.0)',
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        detail: `HTTP ${res.status}`,
      };
    }

    const ct = res.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml/i.test(ct) && !ct.includes('text/')) {
      return {
        ok: false,
        status: res.status,
        detail: `unexpected content-type: ${ct}`,
      };
    }

    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf;
    const html = new TextDecoder('utf-8', { fatal: false }).decode(slice);
    return { ok: true, html, finalUrl: res.url };
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : 'fetch failed';
    return { ok: false, status: 0, detail: msg };
  }
}
