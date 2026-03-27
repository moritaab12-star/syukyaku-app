export type SearchIntent =
  | 'price'
  | 'trouble'
  | 'insurance'
  | 'comparison'
  | 'emergency'
  | 'general';

export function detectSearchIntent(keyword: string | null | undefined): SearchIntent {
  const k = (keyword ?? '').trim().toLowerCase();
  if (!k) return 'general';

  const includesAny = (words: string[]) => words.some((w) => k.includes(w));

  // 緊急対応
  if (
    includesAny([
      '緊急',
      '今すぐ',
      '即日',
      '至急',
      '当日',
      '24時間',
      '夜間',
      'すぐ来て',
      'すぐに',
    ])
  ) {
    return 'emergency';
  }

  // 火災保険
  if (includesAny(['火災保険', '保険', '申請', '保険金', '補償'])) {
    return 'insurance';
  }

  // 費用・相場
  if (
    includesAny([
      '費用',
      '料金',
      '値段',
      '相場',
      '価格',
      '見積',
      '見積もり',
      'いくら',
      '安い',
      '安く',
      '無料',
    ])
  ) {
    return 'price';
  }

  // 業者比較
  if (
    includesAny([
      '比較',
      'おすすめ',
      'ランキング',
      '評判',
      '口コミ',
      'レビュー',
      'どこがいい',
      '選び方',
      '優良',
    ])
  ) {
    return 'comparison';
  }

  // トラブル
  if (
    includesAny([
      '雨漏り',
      '漏水',
      'ひび割れ',
      '破損',
      '故障',
      '詰まり',
      '水漏れ',
      '異音',
      '不具合',
      'トラブル',
      '修理',
      '直し',
      '直す',
    ])
  ) {
    return 'trouble';
  }

  return 'general';
}

