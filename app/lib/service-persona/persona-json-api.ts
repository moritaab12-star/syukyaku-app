/** API 用: リクエストボディから persona_json 直接入力テキストを取り出す */

export function readPersonaJsonTextFromBody(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const b = body as Record<string, unknown>;
  if (typeof b.persona_json_text !== 'string') return '';
  return b.persona_json_text.trim();
}
