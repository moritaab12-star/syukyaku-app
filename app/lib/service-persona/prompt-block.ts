import type { ServicePersonaParsed } from '@/app/lib/service-persona/parse-db-row';

function heroAnglesFromStructured(
  pj: Record<string, unknown> | null | undefined,
): string[] {
  if (!pj || typeof pj !== 'object') return [];
  const root = pj.hero_angles;
  const fromRoot = Array.isArray(root)
    ? root.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
  if (fromRoot.length > 0) {
    return fromRoot.map((x) => x.trim()).slice(0, 10);
  }
  const cr = pj.content_rules;
  if (cr && typeof cr === 'object' && !Array.isArray(cr)) {
    const h = (cr as Record<string, unknown>).hero_angles;
    if (Array.isArray(h)) {
      return h
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim())
        .slice(0, 10);
    }
  }
  return [];
}

function bulletBlock(title: string, items: string[], maxItems: number): string {
  const slice = items.slice(0, maxItems);
  if (slice.length === 0) return '';
  return `${title}\n${slice.map((s) => `- ${s}`).join('\n')}`;
}

/**
 * Gemini 用: 事実を上書きしないよう明示しつつ、トーン・CTA・悩み・FAQ・構成を渡す。
 * 禁止語はプロンプトにも列挙し、事後検証でも掛ける。
 */
export function buildServicePersonaPromptBlock(
  persona: ServicePersonaParsed | null | undefined,
): string {
  if (!persona) return '';

  const lines: string[] = [
    '【業種人格（参照・言い回しのみ。事実の代替にならないこと）】',
    `- 登録業種名（表示用ラベル・本文の業種名にそのまま置き換えしない）: ${persona.service_name}`,
    '- **対応サービス原文・地域・アンケ回答に書かれた事実より優先してはいけない。** 矛盾する表現は出力禁止。',
    '- 人格に別業種が示唆されていても、サービス原文と違う業務の語は使わない。',
  ];

  if (persona.tone?.trim()) {
    lines.push(`- 推奨トーン・文体の目安: ${persona.tone.trim()}`);
  }

  const b1 = bulletBlock('CTA・ボタン文言のニュアンス（参考。電話/Web の役割分担はルールに従う）', persona.cta_labels, 12);
  if (b1) lines.push('', b1);
  const b2 = bulletBlock('想定するお悩み・共感ポイント（原文に無い事実は書かない）', persona.pain_points, 20);
  if (b2) lines.push('', b2);
  const b3 = bulletBlock('FAQで触れたい論点（断定や数値の捏造はしない）', persona.faq_topics, 20);
  if (b3) lines.push('', b3);
  const b4 = bulletBlock('セクション構成の優先度（参考。キー欠落やJSON形式の変更は禁止）', persona.section_structure, 30);
  if (b4) lines.push('', b4);

  const structured =
    persona.master_json && Object.keys(persona.master_json).length > 0
      ? persona.master_json
      : persona.persona_json;
  if (structured && typeof structured === 'object' && !Array.isArray(structured)) {
    const hero = heroAnglesFromStructured(structured as Record<string, unknown>);
    const hb = bulletBlock('ヒーロー角度・訴求の軸（ルールマスター JSON）', hero, 10);
    if (hb) lines.push('', hb);
  }

  const forbidden = persona.forbidden_words.filter((w) => w.length >= 2);
  if (forbidden.length > 0) {
    lines.push(
      '',
      `【人格で定義した禁止表現（いずれも出力に含めないこと）】\n${forbidden
        .slice(0, 50)
        .map((w) => `- ${w}`)
        .join('\n')}`,
    );
  }

  return lines.join('\n');
}

/** 事後検証用: 部分一致（正規化後）。短すぎる語は誤検知のため除外。 */
export function forbiddenPhrasesForValidation(
  persona: ServicePersonaParsed | null | undefined,
): string[] {
  if (!persona?.forbidden_words?.length) return [];
  return persona.forbidden_words
    .map((w) => w.normalize('NFKC').trim())
    .filter((w) => w.length >= 2);
}
