const MODEL =
  process.env.GEMINI_AGENT_MODEL?.trim() ||
  process.env.GEMINI_LP_MODEL?.trim() ||
  'gemini-1.5-flash';

export function stripJsonFence(s: string): string {
  let t = s.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  }
  return t.trim();
}

/**
 * Gemini で JSON 応答を取得。失敗時は null。
 */
export async function geminiGenerateJson(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error('[agent] GEMINI_API_KEY is not set');
    return null;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    MODEL,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('[agent] gemini request failed', res.status, errBody.slice(0, 500));
    return null;
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  return raw || null;
}
