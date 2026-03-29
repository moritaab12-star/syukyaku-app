import type { ParsedInstruction } from '@/app/lib/agent/types';
import { geminiGenerateJson, stripJsonFence } from '@/app/lib/agent/gemini-json';

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(30, Math.max(1, Math.trunc(n)));
}

/** 軽量フォールバック（API 障害時） */
export function parseInstructionFallback(text: string): ParsedInstruction {
  const t = text.trim();
  const countMatch = t.match(/(\d{1,2})\s*(件|本|ページ|LP|lp)/i);
  let count = countMatch ? parseInt(countMatch[1], 10) : 1;
  count = clampCount(count);

  const prefectureMatch = t.match(
    /(北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県|[\u4e00-\u9faf]{2,4}[市区町村])/,
  );
  const area = prefectureMatch ? prefectureMatch[1] : '地域';

  let service = '地域密着サービス';
  const との = t.match(/([^、,。\s]{2,20})\s*(の|を|に)[\u3040-\u30ff\u4e00-\u9faf]*(?:LP|ランディング|集客)/);
  if (との) {
    service = との[1].trim();
  } else {
    const svc = t.match(
      /(?:業種|サービス)[はが:：]\s*([^\n。、,]{2,24})/,
    );
    if (svc) service = svc[1].trim();
  }

  return {
    area,
    service,
    count,
    target: '',
    appeal: t.slice(0, 200),
  };
}

export async function parseInstruction(text: string): Promise<ParsedInstruction> {
  const trimmed = text.trim();
  if (!trimmed) {
    return parseInstructionFallback('1件 LP');
  }

  const prompt = `次の日本語の指示から、ランディングページ量産用のパラメータを抽出し、次のJSONだけを返してください。キーは厳密にこの5つ: area, service, count, target, appeal（いずれも文字列だが count は数値として解釈できる文字列、例 "5"）。

ルール:
- area: 対象地域（市区町県。不明なら空文字）
- service: 業種・サービス名（不明なら空文字）
- count: 作成本数 1–30（指示に数がなければ "1"）
- target: ターゲット顧客や検索意図の補足
- appeal: 訴求・差別化の補足

指示:
${trimmed}`;

  const raw = await geminiGenerateJson(prompt);
  if (raw) {
    try {
      const j = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>;
      const area = typeof j.area === 'string' ? j.area.trim() : '';
      const service = typeof j.service === 'string' ? j.service.trim() : '';
      let count = 1;
      if (typeof j.count === 'number' && Number.isFinite(j.count)) {
        count = clampCount(j.count);
      } else if (typeof j.count === 'string' && /^\d+$/.test(j.count.trim())) {
        count = clampCount(parseInt(j.count.trim(), 10));
      }
      const target = typeof j.target === 'string' ? j.target.trim() : '';
      const appeal = typeof j.appeal === 'string' ? j.appeal.trim() : '';
      const merged = parseInstructionFallback(trimmed);
      return {
        area: area || merged.area,
        service: service || merged.service,
        count,
        target: target || merged.appeal.slice(0, 120),
        appeal: appeal || merged.appeal,
      };
    } catch (e) {
      console.error('[agent] parseInstruction JSON parse', e);
    }
  }

  console.error('[agent] parseInstruction: using regex fallback');
  return parseInstructionFallback(trimmed);
}
