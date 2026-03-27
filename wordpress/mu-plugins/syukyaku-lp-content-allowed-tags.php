<?php
/**
 * Plugin Name: Syukyaku LP — Allow LP HTML (style / JSON-LD / optional link)
 * Description: REST API 経由で保存する固定ページ本文に、syukyaku-app が送る <style data-lp-inline>・<script type="application/ld+json"> を残すための KSES 許可。Next 側の .lp-body マークアップ契約用。
 * Version: 1.0.0
 * Author: syukyaku-app
 *
 * 設置: wp-content/mu-plugins/ にこのファイルを置く（サブディレクトリ不可。単体ファイル必須）。
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * 投稿本文コンテキストで style / script / link を許可する。
 * 固定ページも post_content 保存時は post コンテキストで KSES が走る。
 */
add_filter('wp_kses_allowed_html', function ($tags, $context) {
    if (!is_array($tags)) {
        $tags = array();
    }

    $allow = array('post', 'page', 'content');
    if (!in_array($context, $allow, true)) {
        return $tags;
    }

    $tags['style'] = isset($tags['style']) && is_array($tags['style'])
        ? $tags['style']
        : array();
    $tags['style']['data-lp-inline'] = true;
    $tags['style']['type'] = true;

    $tags['script'] = isset($tags['script']) && is_array($tags['script'])
        ? $tags['script']
        : array();
    $tags['script']['type'] = true;

    // LP_BODY_CSS_DELIVERY=external 時、Next が本文先頭に付ける <link rel="stylesheet" …>
    $tags['link'] = isset($tags['link']) && is_array($tags['link'])
        ? $tags['link']
        : array();
    $tags['link']['rel'] = true;
    $tags['link']['href'] = true;
    $tags['link']['data-lp-external'] = true;

    return $tags;
}, 10, 2);
