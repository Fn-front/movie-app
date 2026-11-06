/**
 * GA4 カスタムイベントの定数
 *
 * ⚠️ 本構成は Consent Mode v2 の **advanced**。ここで定義したイベントは
 * `page_view` と同じく **未同意の利用者の分も Google へ送信される**
 * （識別用 Cookie は付かないが、IP・ブラウザの種類・URL は届く）。
 * したがってパラメータには個人を特定しうる値を入れてはならない。
 * 具体的には検索キーワード本文・作品タイトル・評価値・表示名・
 * メールアドレスを送らない（#938）。
 *
 * 作品の識別子（`movie_id`）だけは送る。TMDb の公開カタログIDであり、
 * それ単体では個人を特定しないため。
 *
 * ## GA4 の推奨イベント名について
 *
 * 採用しているのは `search` のみ。残りは独自名にした。
 *
 * - `add_to_wishlist` は推奨名に存在するが**使わない**。ecommerce
 *   イベントで `items` / `value` / `currency` を伴う前提のため、空で送ると
 *   ecommerce レポートに値0の行が並ぶ。加えて対になる
 *   `remove_from_wishlist` は推奨名に無く、追加だけ推奨名・削除は独自名と
 *   いう非対称になる
 * - `video_start` は実際の再生検知が前提。予告編は YouTube IFrame API を
 *   使わない素の iframe 埋め込み（`videoDialog.tsx`）なので再生は検知できず、
 *   取れるのは「ダイアログを開いた」までになる
 * - `select_content` は全イベントが一つのバケットに混ざり、レポートで
 *   予告編だけを切り出せない
 *
 * ## GA4 の制約
 *
 * イベント名は40文字以内、パラメータ名は40文字以内、値は100文字以内。
 */

/** 計測するカスタムイベント名 */
export const ANALYTICS_EVENTS = {
  /** ウォッチリストへ追加した */
  WATCHLIST_ADD: 'watchlist_add',
  /** ウォッチリストから削除した */
  WATCHLIST_REMOVE: 'watchlist_remove',
  /** お気に入りへ登録した */
  FAVORITE_ADD: 'favorite_add',
  /** お気に入りの評価を更新した */
  FAVORITE_UPDATE: 'favorite_update',
  /** お気に入りから削除した */
  FAVORITE_REMOVE: 'favorite_remove',
  /** 検索を実行した（GA4 推奨イベント。`search_term` は送らない） */
  SEARCH: 'search',
  /** 予告編ダイアログを開いた */
  TRAILER_OPEN: 'trailer_open',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * `search` の `filter_types` で「絞り込み無し」を表す値
 *
 * 空文字にすると GA4 側で「パラメータ未設定」と区別できないため、
 * 明示的な値を置く。
 */
export const ANALYTICS_NO_FILTER = 'none';
