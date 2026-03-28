/**
 * Perplexity Chat Completions の共通処理（JSON キーワード応答のパース含む）。
 */

const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions';

export function extractAssistantText(data: Record<string, unknown> | null): string {
  if (!data || typeof data !== 'object') return '';
  const choices = data.choices as unknown;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const msg = (choices[0] as { message?: { content?: string } })?.message;
  const c = msg?.content;
  return typeof c === 'string' ? c : '';
}

export function parseKeywordsFromJsonText(
  text: string,
  maxItems = 15,
): string[] {
  let trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) trimmed = fence[1]!.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const slice = jsonMatch ? jsonMatch[0] : trimmed;
  try {
    const parsed = JSON.parse(slice) as { keywords?: unknown };
    if (!Array.isArray(parsed.keywords)) return [];
    return parsed.keywords
      .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
      .map((k) => k.trim())
      .slice(0, maxItems);
  } catch {
    return [];
  }
}

export type PerplexityChatResult =
  | { ok: true; content: string; raw: Record<string, unknown> | null }
  | { ok: false; status: number; errorText: string };

export async function perplexityChatCompletion(opts: {
  system: string;
  user: string;
  temperature?: number;
  max_tokens?: number;
}): Promise<PerplexityChatResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 0, errorText: 'PERPLEXITY_API_KEY is not set' };
  }

  const model = process.env.PERPLEXITY_MODEL?.trim() || 'sonar';

  const res = await fetch(PERPLEXITY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.max_tokens ?? 1200,
    }),
  });

  const raw = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      errorText: JSON.stringify(raw ?? {}).slice(0, 500),
    };
  }
  const content = extractAssistantText(raw);
  return { ok: true, content, raw };
}
