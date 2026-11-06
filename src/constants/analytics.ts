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
  /** ウォッチリストから削除した（1件ずつの削除） */
  WATCHLIST_REMOVE: 'watchlist_remove',
  /**
   * ウォッチリストを一括削除した（設定画面のクリーンアップ）
   *
   * 1件ずつの削除と名前を分ける。同じ `watchlist_remove` にまとめると、
   * 年指定の一括削除1回で数十件が計上され「1件ずつ消している」ように
   * 見えてしまう。作品IDは送らない（まとめて消す操作なので件数で足りる）
   */
  WATCHLIST_BULK_REMOVE: 'watchlist_bulk_remove',
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
 * イベントごとに許すパラメータ
 *
 * `Record<string, …>` にしないことに意味がある。冒頭の警告は読まれない
 * 前提で設計すべき箇所なので、`sendEvent(SEARCH, { search_term: query })`
 * のような追加を**型で**弾く（余剰プロパティ検査が効く）。
 * 新しい値を送りたくなったらここへ足すことになり、その diff が
 * 「Google へ何を渡すか」のレビュー箇所になる。
 */
export interface AnalyticsEventParamMap {
  [ANALYTICS_EVENTS.WATCHLIST_ADD]: { movie_id: number };
  [ANALYTICS_EVENTS.WATCHLIST_REMOVE]: { movie_id: number };
  [ANALYTICS_EVENTS.WATCHLIST_BULK_REMOVE]: { item_count: number };
  [ANALYTICS_EVENTS.FAVORITE_ADD]: { movie_id: number };
  [ANALYTICS_EVENTS.FAVORITE_UPDATE]: { movie_id: number };
  [ANALYTICS_EVENTS.FAVORITE_REMOVE]: { movie_id: number };
  [ANALYTICS_EVENTS.SEARCH]: {
    /** キーワードの有無だけ。本文は送らない */
    has_query: boolean;
    /** 適用中の絞り込み種別（カンマ区切り）。無ければ ANALYTICS_NO_FILTER */
    filter_types: string;
    results_count: number;
    result_page: number;
  };
  [ANALYTICS_EVENTS.TRAILER_OPEN]: { movie_id: number };
}

/**
 * `search` の `filter_types` で「絞り込み無し」を表す値
 *
 * 空文字にすると GA4 側で「パラメータ未設定」と区別できないため、
 * 明示的な値を置く。
 */
export const ANALYTICS_NO_FILTER = 'none';
