# LP リサーチ・量産エンジン チャーター

業種ベースの参照LP調査から構造ルール化までを行うシステムの**非交渉要件**と**優先順位**を定義する。実装フェーズ（Phase 0〜6）は別途タスク化する。

**5 レイヤーと実装の対応（短文）**: [`lp-pipeline-layers.md`](./lp-pipeline-layers.md)

- **Phase 0（接続・LP判定・置き場所）**: [`lp-research-engine-phase0.md`](./lp-research-engine-phase0.md)
- **Phase 1（型・Industry Master 読込）**: `types/industry.ts`, `types/lp.ts`, `lib/industry/`（JSON 同梱 + `expandReferenceQueries`）
- **Phase 2（参照 URL 調査）**: `lib/research/`（Perplexity で URL 列挙・ローカルで除外/HTML スコア）、`POST /api/admin/reference-research`
- **Phase 3（構造抽出）**: `lib/extract/`・`docs/lp-pattern-extraction-policy.md`・`POST /api/admin/pattern-extract`
- **Phase 4（ルール変換）**: `lib/convert/`・`POST /api/admin/lp-generation-rule`（`LpGenerationRule` に具体文は含めない）
- **Phase 5（生成→既存 HTML）**: `lib/generate/`・`buildLpHtmlMarkup` の `generationRule` / `generatedLp`・`GET /api/admin/phase5-e2e`
- **Phase 6（計測・ガード）**: `lib/guard/`・`runLpHtmlGuards`・`POST /api/admin/lp-html-guard`・`npm run guard:lp`（`types/lp-guard.ts`）

---

## 目的

業種を入力すると、他社LPを自動調査し、文言・レイアウト・資産はコピーせず「複数LPに共通する構造・UX・CV導線の型」だけを抽出してルール化し、50問回答・エリア・強みと統合して量産可能なCV寄りLPを生成する。

## 絶対制約

- **禁止**: 文言転載、レイアウトの高一致コピ、図解・アイコン・写真の流用、ブランド模倣。
- **許可**: セクション順・ブロック役割・CTA段数と配置・信頼要素の型・余白感・トーンの抽象ラベル化（具体色・具体文は使わない）。
- **採用条件**: 参照LP **2件以上**で共通するパターンに限る（1件だけのいいとこ取りは捨てる）。

## 優先順位

調査で得た確からしい共通ルール **＞** `IndustryMaster.recommended_structure`（矛盾時は master は補完のみ）。

## UIガードレール

- コンテナ `max-w-6xl` 相当
- セクション縦余白は大きめ（目安 `py-20` 級）
- フォント2種以内、カラーはアクセント2＋グレー
- CTAはページ内3回以上、スマホ1カラム優先
- カードは高さ可変、行間広め、ボタンは大きめ・角丸
- **既存LPレンダラと二重化しない**（HTML一系 **または** Tailwindコンポーネントのどちらかに一本化）

本リポジトリでは公開LPの正は `docs/LP_DESIGN_CONTRACT.md` に従い、現時点では `buildLpHtmlMarkup` + `lp-body.css` がその系統。

## 依頼時に毎回足す一文（エージェント・実装者向け）

参照LPからは構造・UX・CV導線の型のみ抽出すること。文言・レイアウト高一致・画像・アイコン・ブランド要素は禁止。採用は2件以上の共通パターンに限定。`IndustryMaster.recommended_structure` は調査結果が無い・弱いときの補完のみ。実装は既存LPレンダラと二重化しない。

---

*改訂時は本ファイルと `LP_DESIGN_CONTRACT.md`・量産パイプライン（生成・`lpToHtmlCore`）のレビューをセットで行う。*
