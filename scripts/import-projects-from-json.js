// scripts/import-projects-from-json.js
//
// data/project_master_data.json に保存した下書きJSONから
// Supabase の projects テーブルへ INSERT / UPSERT するためのスクリプトです。
//
// 手順:
// 1. フロントエンドの「下書きJSONをエクスポート」ボタンでJSONファイルをダウンロード
// 2. ファイル名を data/project_master_data.json に変更して、このプロジェクト直下に配置
//    （例: c:/Users/User/syukyaku-app/data/project_master_data.json）
// 3. ターミナルで `npm run import-projects` を実行
//
// 前提:
// - .env.local に NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されている
// - projects.slug に unique 制約がある（create-projects-table.sql 参照）

/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が .env.local に設定されていません。');
    process.exit(1);
  }

  const supabase = createClient(url, anonKey);

  const dataPath = path.join(process.cwd(), 'data', 'project_master_data.json');
  if (!fs.existsSync(dataPath)) {
    console.error(`data/project_master_data.json が見つかりませんでした: ${dataPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(dataPath, 'utf8');
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    console.error('JSON のパースに失敗しました:', err);
    process.exit(1);
  }

  const items = Array.isArray(payload) ? payload : [payload];

  console.log(`インポート対象: ${items.length} 件`);

  for (const item of items) {
    const projectType = item.project_type || 'local';
    const status = item.status || 'draft';
    const companyName = item.company_name || '新規プロジェクト（インポート）';
    const resolvedArea = item.resolved_area || null;
    const areas = Array.isArray(item.areas) ? item.areas : [];
    const service = item.service || null;

    // slug が指定されていればそれを使い、なければ temp- 形式で生成
    const slug =
      item.slug ||
      `temp-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    const row = {
      company_name: companyName,
      project_type: projectType,
      status,
      slug,
      raw_answers: item.raw_answers ?? [],
      company_info: item.company_info ?? {},
      area: resolvedArea,
      target_area: resolvedArea,
      areas,
      service,
      wp_page_id: null,
      wp_url: null,
      publish_status: null,
      published_at: null,
    };

    console.log('Upserting project with slug:', slug);

    const { error } = await supabase
      .from('projects')
      .upsert(row, { onConflict: 'slug' });

    if (error) {
      console.error('Upsert に失敗しました:', error);
      process.exitCode = 1;
      return;
    }
  }

  console.log('インポートが完了しました。');
}

main().catch((err) => {
  console.error('スクリプト実行中にエラーが発生しました:', err);
  process.exit(1);
});

