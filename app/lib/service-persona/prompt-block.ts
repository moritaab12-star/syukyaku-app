import type { ServicePersonaParsed } from '@/app/lib/service-persona/parse-db-row';
import { flatColumnsFromMasterJson } from '@/app/lib/service-persona/master-json-mapper';
import { mergeUniqueStringLists } from '@/app/lib/service-persona/persona-json-mapper';

/** マスターJSONをプロンプトにそのまま載せる上限（トークン超過回避） */
const MASTER_JSON_PROMPT_MAX = 28000;

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

function asStructuredMaster(
  persona: ServicePersonaParsed,
): Record<string, unknown> | null {
  const mj = persona.master_json;
  if (mj && Object.keys(mj).length > 0) return mj;
  const pj = persona.persona_json;
  if (pj && Object.keys(pj).length > 0) return pj;
  return null;
}

/**
 * DB 列と master_json / persona_json をマージし、ctp_patterns 等のレガシーキーも解釈する。
 */
export function resolveEffectivePersonaForPrompt(
  persona: ServicePersonaParsed,
): {
  service_name: string;
  tone: string | null;
  cta_labels: string[];
  pain_points: string[];
  faq_topics: string[];
  forbidden_words: string[];
  section_structure: string[];
  structured: Record<string, unknown> | null;
} {
  const structured = asStructuredMaster(persona);
  const flatFromJson = structured
    ? flatColumnsFromMasterJson(structured)
    : null;

  const tone =
    (persona.tone?.trim() ? persona.tone.trim() : null) ??
    (flatFromJson?.tone?.trim() ? flatFromJson.tone.trim() : null);

  return {
    service_name: persona.service_name || flatFromJson?.service_name || '',
    tone,
    cta_labels: mergeUniqueStringLists(
      flatFromJson?.cta_labels ?? [],
      persona.cta_labels,
    ),
    pain_points: mergeUniqueStringLists(
      flatFromJson?.pain_points ?? [],
      persona.pain_points,
    ),
    faq_topics: mergeUniqueStringLists(
      flatFromJson?.faq_topics ?? [],
      persona.faq_topics,
    ),
    forbidden_words: mergeUniqueStringLists(
      flatFromJson?.forbidden_words ?? [],
      persona.forbidden_words,
    ),
    section_structure: mergeUniqueStringLists(
      flatFromJson?.section_structure ?? [],
      persona.section_structure,
    ),
    structured,
  };
}

function bulletBlock(title: string, items: string[], maxItems: number): string {
  const slice = items.slice(0, maxItems);
  if (slice.length === 0) return '';
  return `${title}\n${slice.map((s) => `- ${s}`).join('\n')}`;
}

/**
 * Gemini 用: 事実を上書きしないよう明示しつつ、トーン・CTA・悩み・FAQ・構成を渡す。
 * master_json / persona_json から flatColumns 投影＋全文 JSON（拡張ルール含む）を添付する。
 */
export function buildServicePersonaPromptBlock(
  persona: ServicePersonaParsed | null | undefined,
): string {
  if (!persona) return '';

  const eff = resolveEffectivePersonaForPrompt(persona);

  const lines: string[] = [
    '【業種ルールマスター（参照・言い回し・CTA ニュアンス・禁止語・構成の最優先。事実の代替・上書きには使わないこと）】',
    '- **次に続く「業種ルールマスター JSON 全文」に含まれる language_rules / cta_rules / content_rules / design_rules 等は、このプロジェクトの業種として最優先で従うこと。** サービス原文・アンケ事実と矛盾する語だけ避ける。',
    `- 登録業種名（表示用ラベル・本文の業種名にそのまま置き換えしない）: ${eff.service_name}`,
    '- **対応サービス原文・地域・アンケ回答に書かれた事実より優先してはいけない。** 矛盾する表現は出力禁止。',
    '- 人格に別業種が示唆されていても、サービス原文と違う業務の語は使わない。',
  ];

  if (eff.tone?.trim()) {
    lines.push(`- 推奨トーン・文体の目安: ${eff.tone.trim()}`);
  }

  const b1 = bulletBlock(
    'CTA・ボタン文言のニュアンス（参考。電話/Web の役割分担はルールに従う）',
    eff.cta_labels,
    12,
  );
  if (b1) lines.push('', b1);
  const b2 = bulletBlock(
    '想定するお悩み・共感ポイント（原文に無い事実は書かない）',
    eff.pain_points,
    20,
  );
  if (b2) lines.push('', b2);
  const b3 = bulletBlock(
    'FAQで触れたい論点（断定や数値の捏造はしない）',
    eff.faq_topics,
    20,
  );
  if (b3) lines.push('', b3);
  const b4 = bulletBlock(
    'セクション構成の優先度（参考。キー欠落やJSON形式の変更は禁止）',
    eff.section_structure,
    30,
  );
  if (b4) lines.push('', b4);

  if (eff.structured && typeof eff.structured === 'object') {
    const hero = heroAnglesFromStructured(eff.structured);
    const hb = bulletBlock('ヒーロー角度・訴求の軸（ルールマスター）', hero, 10);
    if (hb) lines.push('', hb);

    let raw = '';
    try {
      raw = JSON.stringify(eff.structured, null, 2);
    } catch {
      raw = '';
    }
    if (raw.length > 0) {
      const clipped =
        raw.length > MASTER_JSON_PROMPT_MAX
          ? `${raw.slice(0, MASTER_JSON_PROMPT_MAX)}\n…（以下省略・先頭 ${MASTER_JSON_PROMPT_MAX} 文字まで）`
          : raw;
      lines.push(
        '',
        '━━━━━━━━━━━━━━━━━━',
        '【業種ルールマスター JSON 全文（拡張キー含む・上記と矛盾したらこちら優先）】',
        '━━━━━━━━━━━━━━━━━━',
        clipped,
      );
    }
  }

  const forbidden = eff.forbidden_words.filter((w) => w.length >= 2);
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
  if (!persona) return [];
  const eff = resolveEffectivePersonaForPrompt(persona);
  if (!eff.forbidden_words?.length) return [];
  return eff.forbidden_words
    .map((w) => w.normalize('NFKC').trim())
    .filter((w) => w.length >= 2);
}
