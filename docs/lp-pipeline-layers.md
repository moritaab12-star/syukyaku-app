# LP 量産パイプライン — レイヤー定義（正）

チャーター: [`lp-research-engine-charter.md`](./lp-research-engine-charter.md)

---

## industry master

**内容**: `name`, `reference_queries`, `important_elements`, `tone`（抽象）, `cta_type`, `recommended_structure`（フォールバック）

**実装**: `types/industry.ts` の `IndustryMaster`・同梱 `lib/industry/defaults.json`・`lib/industry/load-masters.ts`（`resolveLpIndustryTone` は `app/lib/lp-industry.ts` で別系統）

---

## reference research

**内容**: クエリ → URL候補 → 業種適合 → LP/CV導線フィルタ → 除外

**実装**: `lib/research/`（`runReferenceResearch`・Perplexity 列挙・`exclusion.ts`・`score-html.ts`）・`POST /api/admin/reference-research`

---

## pattern extraction

**内容**: セクション構造、CTA配置、信頼ブロック、ベネフィット型、見出し階層、余白・リズムのラベル

**実装**: `lib/extract/extract-from-html.ts` → `ExtractedPattern`・`consensus.ts`（2 URL 以上 → `PatternConsensus`）・政策 [`lp-pattern-extraction-policy.md`](./lp-pattern-extraction-policy.md)・`POST /api/admin/pattern-extract`

---

## rule conversion

**内容**: 汎用UIルール・セクションテンプレ・CTAルール・文体ルール（**コピー禁止**の変換層）

**実装**: `types/lp.ts` の `LpGenerationRule` / `LpSectionBlueprint` / `LpCtaPolicy`・`lib/convert/build-rule.ts`・`POST /api/admin/lp-generation-rule`

---

## LP generation

**内容**: `title`, `subtitle`, `sections`, `faq`, `trust`, `cta`（**自社データとルールのみ**）

**実装**: `types/lp.ts` の `GeneratedLp`・`lib/generate/build-generated-lp.ts`・`buildPhase5LpHtmlMarkup` / `buildLpHtmlMarkup`（`generationRule`・`generatedLp`）・ガード `lib/guard/`・`Phase 5/6` API

---

*詳細フローは `docs/lp-research-engine-phase0.md` を参照。*
