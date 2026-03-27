# WordPress で LP 用 CSS / JSON-LD が効かないとき（レガシー）

> **注意**: アプリは WordPress 連携を廃止しました。本ドキュメントは旧運用の記録です。

旧 `buildLpHtml`（削除済み）は本文に `<style>` と JSON-LD を含めていました。WordPress 既定の KSES は **`style` / `script` を本文から削除**することがあり、フロントでは素の HTML に見えることがありました。

対処の例: `wordpress/mu-plugins/syukyaku-lp-content-allowed-tags.php` を本番 WP の `wp-content/mu-plugins/` に置く（現在の Next 単体運用では不要）。
