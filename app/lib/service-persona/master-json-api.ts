/** API: リクエストボディから master_json 直接入力テキストを取り出す */

export function readMasterJsonTextFromBody(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const b = body as Record<string, unknown>;
  const m = b.master_json_text;
  if (typeof m === 'string') {
    const t = m.trim();
    if (t.length > 0) return t;
  }
  const legacy = b.persona_json_text;
  if (typeof legacy === 'string') {
    const t = legacy.trim();
    if (t.length > 0) return t;
  }
  return '';
}
