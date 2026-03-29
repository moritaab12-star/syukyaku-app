# LP デザイン契約書（syukyaku-app）

## 1. 正とするソース（1行）

**公開 LP のマークアップは `app/lib/lpToHtmlCore.ts` の `buildLpHtmlMarkup` を唯一の正とし、`app/p/[slug]/page.tsx` は同一生成関数を使う。スタイルは `app/styles/lp-body.css`（`app/globals.css` から `@import`）に集約する。**

---

## 2. class 命名（推奨1つ）

**既存の `lp-` プレフィックスを継承する（BEM 風の `lp-block__element--modifier` を踏襲）。**

- **理由（量産）**: `buildLpHtmlMarkup`・ピラー `pillarToHtml`・テンプレ分岐（cv / trust / benefit）が1系統にまとまりやすい。
- **理由（テーマ干渉回避）**: `.lp-body` 配下にスコープしやすい。

---

## 3. CSS の単一の正

**`app/styles/lp-body.css`** を編集し、`app/globals.css` から `@import` する。オプションで `/api/lp-body-css` が同ファイルを返す（外部へ `<link>` だけ渡す用途）。

---

## 4. Framer風量産プロンプトに必ず入れる一文テンプレ（3つ以内）

1. **正の所在**: 「出力する HTML の `class` は既存の `lp-*` 命名に合わせ、`buildLpHtmlMarkup` が生成する構造と競合しない形で差分提案すること。」

2. **スコープ**: 「スタイルは `.lp-body` 内にのみ適用される前提で書く。」

3. **単一成果物**: 「1回の回答で最終案（HTML 断片または変更指示）と差し替え項目一覧のみを出す。」

---

## 5. 参照LPリサーチ・構造ルール化（チャーター）

業種別に他社LPを調査し**構造のみ**抽出して量産ルールに落とす要件は、`docs/lp-research-engine-charter.md` に定義する。コピー禁止・2件以上共通採用・既存レンダラ単一系はそちらを正とする。既存 API / `lp-industry` / `buildLpHtmlMarkup` との接続・LP 判定基準・置き場所は `docs/lp-research-engine-phase0.md` を参照する。

---

*改定時は本ファイルと `buildLpHtmlMarkup` / `lp-body.css` のレビューをセットで更新する。*
