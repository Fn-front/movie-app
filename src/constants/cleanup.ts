/**
 * 掃除まわりの保持期間（#433）
 */

/**
 * 論理削除された利用者リストを物理削除するまでの時間（30日）
 *
 * 対象は `favorites` / `watchlist` / `dismissed_movies`。`deleted_at` が入っても
 * 行は残り、TMDb 由来の `title` / `poster_path` / `release_date` / `genre_ids` を
 * そのまま保持していた。TMDb 利用規約 Section 1.C は「TMDb から取得した情報を
 * 6ヶ月を超えてキャッシュすること」を禁じているため、その手前で物理削除する。
 *
 * ⚠️ **3テーブルで1つの定数を共有する。** テーブルごとに分けていないのは、
 * これが「論理削除から何日で消すか」という**1つの方針**だから。既存の
 * `RATE_LIMIT_RETENTION_HOURS` などがテーブルごとに分かれているのは、
 * それぞれ別の根拠（レート制限ウィンドウ長・再送間隔）から決まっているため。
 *
 * 30日の根拠:
 *
 * - UI にゴミ箱・取り消しの導線は無く、再追加は古い行を復活させず素の INSERT
 *   （`src/app/api/favorites/route.ts`）。猶予を長く取っても取り戻せるものが無い
 * - 読み出しは全経路が `deleted_at IS NULL` で絞っているので、物理削除で
 *   壊れる集計が無い
 * - 6ヶ月（4,320時間）を大きく下回る
 *
 * ⚠️ この値を変えるときは **RPC 側の下限ガードも一緒に変える**こと。
 * `delete_expired_favorites` などは `retention_hours < 720` を弾く
 * （`20261122000000_add_soft_deleted_list_cleanup_rpcs.sql`）。
 * ズレは `expiredRecords.test.ts` が検出する。
 */
export const SOFT_DELETED_LIST_RETENTION_HOURS = 24 * 30;
