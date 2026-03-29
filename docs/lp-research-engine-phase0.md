# Phase 0 — 方針固定（接続・LP判定・置き場所）

前提チャーター: [`lp-research-engine-charter.md`](./lp-research-engine-charter.md)  
LP の単一系（レンダラ）: [`LP_DESIGN_CONTRACT.md`](./LP_DESIGN_CONTRACT.md)

---

## 1. 現状パイプライン（確定）

| 層 | 主なファイル / API | 役割（今やっていること） |
|----|---------------------|---------------------------|
| 業種トーン（本文テンプレ文言） | `app/lib/lp-industry.ts` | `resolveLpIndustryTone`（`industry_key` 優先）、`getLpHtmlSectionCopy`、`lpIndustryToneDescriptionForPrompt` — **DOM は共通・コピー塊の差し替え** |
| 表示モデル | `app/lib/lp-template.ts` | `raw_answers` + company 等 → `LpViewModel` |
| 公開 HTML | `app/lib/lpToHtmlCore.ts` | `buildLpHtmlMarkup` → JSON-LD + `.lp-body` 内断片。**cv / trust / benefit** の並びはここ |
| UI コピー（生成） | `app/lib/gemini-lp-ui-copy-pack.ts`, `fv-catch-generation.ts` | `lp_ui_copy` JSONB + `fv_catch_*` 同期 → `buildLpHtmlMarkup` が参照 |
| 50問補助生成 | `POST /api/generate` | Gemini 回答、Perplexity SEO キーワード（`perplexity-seo-research`）、任意でヒーロー前置 |
| 需要KW（管理） | `POST /api/admin/keyword-research`, `perplexity-keyword-research.ts` | 業種コンテキスト付きキーワード |
| ヒーローのみ | `POST /api/generate-lp` | Vertex 系ヒーロー画像パイプライン |
| FV / LP UI パック | `POST /api/generate-fv-catch` | 保存フック: `projects/save` → `runFvCatchForLpGroupMembersIfNeeded` |

**公開ページ**: `app/p/[slug]/page.tsx` → 上記モデル + `buildLpHtmlMarkup`（スタイルは `app/styles/lp-body.css`）。

---

## 2. 新レイヤーとの接点（1枚の対応表）

チャーター上の 5 層を、**いまのコードに「横に足す」**ときの責務境界は次で固定する。

```
                    ┌─────────────────────────────────────┐
                    │  IndustryMaster（拡張データ）        │
                    │  reference_queries, recommended_*   │
└──────────────┐    │  ※ tone 解決は lp-industry を再利用  │
               │    └──────────────┬──────────────────────┘
  industry_key │                   │
  + service    ▼                   ▼
┌──────────────────┐    ┌──────────────────────┐
│ app/lib/         │    │ app/lib/research/     │ クエリ生成・URL取得
│ lp-industry.ts   │◄───│  (新)                │ （Perplexity / Search は
│ （既存・唯一入口）│    └──────────┬───────────┘  既存 perplexity-api と統合方針）
└────────┬─────────┘               │
         │                          ▼
         │               ┌──────────────────────┐
         │               │ app/lib/extract/     │ 構造メタのみ（長文保存禁止方針）
         │               │  (新)                │
         │               └──────────┬───────────┘
         │                          ▼
         │               ┌──────────────────────┐
         │               │ lib/convert/          │ Extracted → LpGenerationRule
         │               │  (Phase 4)            │ （コピー禁止のルール化）
         │               └──────────┬───────────┘
         │                          │
         │                          ▼
         │               ┌──────────────────────┐
         ▼               │ lib/generate/         │ 50問 + Rule → `buildLpHtmlMarkup`（Phase 5）
┌──────────────────┐    │  (新・アダプタ)       │ **buildLpHtmlMarkup へ入力を足す**
│ lp-template      │◄───┤                      │ （別レンダラは作らない）
│ lpToHtmlCore     │    └──────────────────────┘
└──────────────────┘
```

**接点の原則**

1. **`lp-industry` を分岐させない** — 業種キー → トーンの解決は今の `resolveLpIndustryTone` のみ。IndustryMaster は **同じキーを参照するメタデータ**（検索クエリ・推奨セクション順・フォールバック）を持つ。
2. **`buildLpHtmlMarkup` のみが公開マークアップの正** — 調査結果は「セクション順テンプレ ID」「CTA 段数」「非表示ブール」など、**既存関数が解釈できる入力拡張**に落とす。React `/components/lp/*` は、チャーターの「別系統を増やさない」に従い **当面採用しない**（将来移行するなら Phase 専用タスクで契約変更）。
3. **生成 API** — 新処理は `POST /api/generate` や admin 専用ルートに **オプションフラグ / 別エンドポイント**で追加し、既存 JSON 契約を壊さない。

---

## 3. 新コードの置き場所（命名）

リポジトリは `app/lib/` 集約が既存と一致するため、次を正とする（`lib/` 直下の `/lib/industry` は **作らず** `app/lib/` に置く）。

| チャーター上の層 | パス案 | 備考 |
|------------------|--------|------|
| industry master（データ+読込） | `types/industry.ts`, `lib/industry/` | Phase 1 実装済み: 同梱 `defaults.json`・`expandReferenceQueries`。**トーン判定は引き続き `lp-industry.ts`**（マスター解決時は `lpIndustryTone` 渡し推奨）。 |
| reference research | `lib/research/` | Phase 2 実装済: `runReferenceResearch`・Perplexity URL 列挙（`perplexity-seo-research` は KW 専用）、パス/ホスト除外・軽量 HTML で LP/業種スコア |
| pattern extraction | `lib/extract/` | Phase 3 実装済: `extractPatternFromHtml`・`buildPatternConsensus`（2 URL 以上合意のみ昇格）・政策は `lp-pattern-extraction-policy.md` |
| rule conversion | `lib/convert/` | Phase 4: `buildLpGenerationRule`・具体文なし・`/api/admin/lp-generation-rule` |
| LP generation（統合アダプタ） | `lib/generate/` | Phase 5: `buildPhase5LpHtmlMarkup` → `LpToHtmlInput`・`GET /api/admin/phase5-e2e` |
| ガード / 類似度 | `lib/guard/` | Phase 6: CTA・セクション数・モバイル列ヒント・参照 HTML 対のトライグラム / 長文一致（任意）・`npm run guard:lp` |

型の集約: 量が増えたら `app/types/` を切ってもよいが、Phase 1 で決める（Phase 0 では上記でよい）。

---

## 4. 「LP 判定」（CV 導線）— 判定基準（文章化）

参照 URL を **LP として採用する**ために、最低限次を満たすこと（自動判定はスコア化して閾値でも可）。

**必須（ハード）**

- **明示的 CV のいずれかが存在する**: 問い合わせフォーム（`form` + メール or 送信ボタン意図）、`tel:` リンク、主要 SNS/LINE の友だち追加リンク、または「無料相談」「お問い合わせ」等に紐づく **到達可能なアクション**（1 つ以上）。
- **単一ナビゲーションのランディング型** に近いこと: 同一ページ内に **複数のセクション見出し**（`h2` 相当）または明確なブロック区切りがあり、**記事本文のみのブログテンプレ**ではない。

**否定的シグナル（除外候補）**

- 法人概要・IR・ニュース一覧・採用のみで **CV ブロックが取れない**。
- ワンページ内に **CTA がゼロ**（プライバシー・利用規約のみ等）。
- PDF 直リンクのみ、ログインウォールの内側のみなど **構造取得不能**。

**任意（ソフト・スコア加算）**

- Above the fold に一次 CTA または電話。
- 料金・事例・FAQ・フロー のうち **2 つ以上** のブロックが見える。
- Schema.org に `LocalBusiness` / `Service` 等（**文言コピーは禁止**。有無だけメタに使う可）。

**注意（法・ポリシー）**

- ダウンロードした本文の**再掲載はしない**。抽出は **見出し階層・ブロック役割・CTA 種別の列挙**に留める（チャーター準拠）。

---

## 5. 既存フローを壊さない移行方針

1. **追加のみ（Additive）** — 新テーブル / 新カラム（例: `projects.lp_structure_rule jsonb`）や `IndustryMaster` JSON は、未設定時 **100% 現行挙動**。
2. **`buildLpHtmlMarkup` は後方互換** — 新入力はすべて optional。未指定なら今の `cv | trust | benefit` と `getLpHtmlSectionCopy` のみ。
3. **調査ジョブは非同期想定** — 管理画面またはバッチで実行。保存パスの同期呼び出しでタイムアウトしないよう分離。
4. **Perplexity** — 既存 `app/lib/perplexity-api.ts` を共有。リサーチ用モデル・プロンプトは SEO KW 用と URL 探索用で **名前空間分離**（設定キーは共通化可）。

---

## 6. 完了条件チェックリスト（Phase 0）

- [x] `lpToHtmlCore` / `lp-industry` / 主要生成 API の役割を本文で固定した。
- [x] 新レイヤー 5 区分の接点を図・表で示した。
- [x] LP 判定（CV 導線）を文章化した。
- [x] 新コードの置き場所と「レンダラ単一」「additive 移行」を文書化した。

次フェーズ（Phase 1）: 型と `IndustryMaster` の最小スキーマ + 読込。
