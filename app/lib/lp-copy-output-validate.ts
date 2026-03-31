/**
 * LP コピー（Gemini 出力）の事後検証: サービス原文に無い業種語の混入を検出し、原文語の欠如を検出する。
 */

/** 出力に現れた場合は「サービス原文にも同系統の語があること」を要求するグループ */
const INDUSTRY_TERM_GROUPS: readonly string[][] = [
  ['剪定', '造園', '植木', '庭木', '芝生', '伐採', '防草', '芝はり', '植木屋', '造園業', '草刈', '抜根'],
  ['屋根', '葺き', '雨漏り', 'カバー工法', 'スレート', '瓦', 'ガルバ'],
  ['外壁', '塗装', '防水', 'シーリング'],
  ['リフォーム', 'リノベ', '水回り', '内装', '改装', 'キッチン', 'ユニットバス'],
  [
    '賃貸',
    '売買',
    '仲介',
    '不動産',
    '物件',
    '内見',
    '宅建',
    '土地',
    'マンション',
    '戸建',
    'オーナー',
    '空室',
    '管理会社',
  ],
  ['水道', '排水', '給湯', '水漏れ', '詰まり', '蛇口', 'トイレ', '洗面'],
  ['電気', '配線', 'コンセント', 'ブレーカー', '照明'],
  ['カステラ', '和菓子', '洋菓子', 'ケーキ', '饅頭'],
  ['清掃', 'クリーニング', 'エアコン洗浄'],
  ['葬儀', '法要', 'お別れ会'],
  ['介護', '訪問介護', 'デイサービス'],
];

const GENERIC_BOILERPLATE = [
  '地域密着',
  'お困りごと',
  'お気軽に',
  'まずはお気軽',
  '安心してお任せ',
  '丁寧に対応',
  'おまかせください',
  'サポートいたします',
];

const UNSET = '（未設定）';

function norm(s: string): string {
  return s.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

/** 長いチャンクは先頭2〜8文字の部分一致も許容（「外壁補修」↔「外壁の〜」） */
function chunkAppearsInOutput(chunk: string, out: string): boolean {
  const c = norm(chunk);
  if (c.length < 2) return false;
  if (out.includes(c)) return true;
  for (let len = Math.min(c.length, 8); len >= 2; len--) {
    const sub = c.slice(0, len);
    if (out.includes(sub)) return true;
  }
  return false;
}

/**
 * サービス原文から比較用チャンク（2文字以上）を抽出
 */
export function extractServiceChunks(serviceRaw: string): string[] {
  const s = norm(serviceRaw);
  if (!s || s === UNSET) return [];
  const parts = s.split(/[,、，\/|｜\n]+/).flatMap((p) => p.split(/[\s　]+/g));
  const out: string[] = [];
  for (const p of parts) {
    const t = norm(p);
    if (t.length >= 2) out.push(t);
  }
  if (out.length === 0 && s.length >= 2) out.push(s);
  return [...new Set(out)];
}

function collectOutputStrings(v: unknown, sink: string[]): void {
  if (v == null) return;
  if (typeof v === 'string') {
    sink.push(v);
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) collectOutputStrings(x, sink);
  }
}

export type LpCopyValidationResult = {
  ok: boolean;
  reasons: string[];
};

/**
 * 結合テキストに対する検証（業種グループ・汎用句だらけ・原文チャンク欠如）
 */
export function validateCopyTextAgainstService(
  serviceRaw: string,
  combinedOutput: string,
): LpCopyValidationResult {
  const reasons: string[] = [];
  const serv = norm(serviceRaw);
  const out = norm(combinedOutput);

  if (!serv || serv === UNSET) {
    return { ok: true, reasons: [] };
  }

  for (const group of INDUSTRY_TERM_GROUPS) {
    const hitOut = group.find((t) => out.includes(t));
    const hitServ = group.some((t) => serv.includes(t));
    if (hitOut && !hitServ) {
      reasons.push(
        `サービス原文に無い業種系ワードが含まれています: 「${hitOut}」（別業種の語を削除し、原文の語だけで書き直してください）`,
      );
    }
  }

  const chunks = extractServiceChunks(serviceRaw);
  if (chunks.length > 0) {
    const anyChunkInOutput = chunks.some((c) => chunkAppearsInOutput(c, out));
    if (!anyChunkInOutput) {
      reasons.push(
        `サービス原文の語句（例: ${chunks.slice(0, 4).join(' / ')}）が本文にほとんど含まれていません。原文の漢字・かなを自然に織り込んでください。`,
      );
    }
  }

  let genericCount = 0;
  for (const g of GENERIC_BOILERPLATE) {
    if (out.includes(g)) genericCount++;
  }
  if (genericCount >= 4 && chunks.length > 0) {
    const anyChunk = chunks.some((c) => chunkAppearsInOutput(c, out));
    if (!anyChunk) {
      reasons.push(
        '汎用フレーズが多く、サービス原文の具体語がありません。抽象口上を減らし原文の業務語を入れてください。',
      );
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export function validateLpUiCopyPack(
  serviceRaw: string,
  pack: Record<string, unknown>,
): LpCopyValidationResult {
  const sink: string[] = [];
  collectOutputStrings(pack, sink);
  return validateCopyTextAgainstService(serviceRaw, sink.join('\n'));
}

export function validateFvCatch(
  serviceRaw: string,
  headline: string,
  subheadline: string,
): LpCopyValidationResult {
  return validateCopyTextAgainstService(
    serviceRaw,
    `${headline}\n${subheadline}`,
  );
}

export function formatValidationRepairHint(reasons: string[]): string {
  if (reasons.length === 0) return '';
  return [
    '【自動検証で不合格】以下をすべて解消したうえで、同じキー構成の有効な JSON のみを再出力すること。',
    ...reasons.map((r) => `- ${r}`),
  ].join('\n');
}
