/**
 * 業種・サービスに合わせたヒーロー画像用プロンプトを英語で生成（Gemini API / AI Studio キー）。
 */

const HERO_PROMPT_MODEL =
  process.env.GEMINI_HERO_PROMPT_MODEL?.trim() || 'gemini-1.5-pro';

export type HeroImagePromptInput = {
  industryKey: string | null;
  industryDescription: string;
  service: string;
};

function buildUserPrompt(input: HeroImagePromptInput): string {
  const ik =
    typeof input.industryKey === 'string' && input.industryKey.trim().length > 0
      ? input.industryKey.trim()
      : 'general';
  return `You write image-generation prompts for commercial landing-page hero images.

Industry key: ${ik}
Industry context (Japanese market, local SMB): ${input.industryDescription}
Service: ${input.service}

Write exactly ONE English prompt (max 55 words) for a high-quality hero image that fits this industry and service.
Style: photorealistic or clean modern commercial photography; professional and trustworthy; appealing to Japanese small-business customers.
Hard rules: no text, letters, logos, watermarks, or UI mockups in the image; no recognizable celebrity faces; avoid cluttered compositions.
Output ONLY the raw prompt text, with no quotes or explanation.`;
}

export async function generateHeroImagePromptEnglish(
  input: HeroImagePromptInput,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    HERO_PROMPT_MODEL,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildUserPrompt(input) }] }],
      generationConfig: {
        temperature: 0.55,
        maxOutputTokens: 256,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error(
      '[gemini-hero-image-prompt] generateContent failed',
      res.status,
      errBody.slice(0, 500),
    );
    return null;
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  if (!text) return null;
  return text.replace(/^["'`]+|["'`]+$/g, '').trim();
}
