/**
 * 利用者リストの TMDb 由来列を取り直す設定（#433 の作業3）
 */

/**
 * 取り直すまでの日数
 *
 * `favorites` / `watchlist` / `dismissed_movies` は登録時点の TMDb の値を
 * 非正規化して保存したきりで、更新する仕組みが無かった。TMDb 利用規約
 * Section 1.C は「TMDb から取得した情報を6ヶ月を超えてキャッシュすること」を
 * 禁じているため、その手前で取り直す。
 *
 * ⚠️ **6ヶ月（約180日）より十分短くすること。** cron は週次なので、
 * ここが上限そのものだと取りこぼしがそのまま違反になる。
 *
 * ⚠️ 鮮度の判定に `updated_at` は使えない。`favorites` / `dismissed_movies` の
 * それは**利用者の評価変更でも更新される**（`update_updated_at_column`
 * トリガー）し、`watchlist` には列そのものが無い。専用の
 * `tmdb_refreshed_at` を見る。
 */
export const USER_LIST_REFRESH_STALE_DAYS = 60;

/**
 * 1回の実行でテーブルごとに取り直す上限件数
 *
 * ⚠️ 上限に当たったら**ログに残す**こと。黙って切り捨てると
 * 「全部取り直した」ように見える。
 *
 * 本番実測（2026-11-21）の対象はユニーク作品で favorites 160 / watchlist 121 /
 * dismissed_movies 8。`movie_cache` に無いぶん（それぞれ 135 / 58 / 8）だけが
 * TMDb への問い合わせになる。
 */
export const USER_LIST_REFRESH_LIMIT = 500;

/**
 * TMDb へ同時に投げる問い合わせ数
 *
 * TMDb のレート制限（50 req/s）に収めるため、`syncStreamingMovies` と
 * 同じ考え方で絞る。
 */
export const USER_LIST_REFRESH_CONCURRENCY = 10;
