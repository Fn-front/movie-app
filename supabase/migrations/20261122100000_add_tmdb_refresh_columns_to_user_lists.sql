-- ============================================
-- 利用者リストに TMDb の鮮度・削除検知の列を足す（#433 の作業3）
-- ============================================
-- 背景: favorites / watchlist / dismissed_movies は登録時点の TMDb の値を
-- 非正規化して保存したきり、更新する仕組みが無い。TMDb 利用規約 Section 1.C
-- の「6ヶ月を超えてキャッシュしない」に抵触する。
--
-- 取り直す cron を足すにあたり、「最後に TMDb から取った時刻」を表す列が要る。
-- 既存の列では代用できない:
--
--   favorites / dismissed_movies … `updated_at` はあるが、**利用者の評価変更でも
--     更新される**（update_updated_at_column トリガー）ので鮮度にならない
--   watchlist … `updated_at` 列そのものが無い（added_at / watched_at / deleted_at のみ）
--
-- ⛔ **`DEFAULT now()` を付けないこと。** 既存行（＝6ヶ月以上未更新かもしれない行）が
--    全部「今さっき更新済み」になり、cron は1件も拾わないのに完了条件だけが
--    満たされたように見える。NULL のまま入れて「未取得＝要リフレッシュ」とする。

ALTER TABLE favorites
  ADD COLUMN IF NOT EXISTS tmdb_refreshed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tmdb_deleted_at TIMESTAMPTZ;

ALTER TABLE watchlist
  ADD COLUMN IF NOT EXISTS tmdb_refreshed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tmdb_deleted_at TIMESTAMPTZ;

ALTER TABLE dismissed_movies
  ADD COLUMN IF NOT EXISTS tmdb_refreshed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tmdb_deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN favorites.tmdb_refreshed_at IS
  '最後に TMDb から表示列を取り直した時刻。NULL は未取得（要リフレッシュ）';
COMMENT ON COLUMN favorites.tmdb_deleted_at IS
  'TMDb で 404 になったことを検知した時刻。猶予後に物理削除する（#433 案D）';
COMMENT ON COLUMN watchlist.tmdb_refreshed_at IS
  '最後に TMDb から表示列を取り直した時刻。NULL は未取得（要リフレッシュ）';
COMMENT ON COLUMN watchlist.tmdb_deleted_at IS
  'TMDb で 404 になったことを検知した時刻。猶予後に物理削除する（#433 案D）';
COMMENT ON COLUMN dismissed_movies.tmdb_refreshed_at IS
  '最後に TMDb から表示列を取り直した時刻。NULL は未取得（要リフレッシュ）';
COMMENT ON COLUMN dismissed_movies.tmdb_deleted_at IS
  'TMDb で 404 になったことを検知した時刻。猶予後に物理削除する（#433 案D）';

-- 取り直しの対象を引く索引。
--
-- cron は「生きている行のうち、まだ取り直していない or 古いもの」を
-- `tmdb_refreshed_at` の昇順で拾う。NULL（未取得）を先に消化したいので
-- `NULLS FIRST` を明示する。
--
-- ⚠️ 部分索引の条件は cron の WHERE と**完全に一致させる**こと。ずれると
--    索引が使われず全件走査になる。
CREATE INDEX IF NOT EXISTS idx_favorites_tmdb_refreshed_at
  ON favorites (tmdb_refreshed_at NULLS FIRST)
  WHERE deleted_at IS NULL AND tmdb_deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_watchlist_tmdb_refreshed_at
  ON watchlist (tmdb_refreshed_at NULLS FIRST)
  WHERE deleted_at IS NULL AND tmdb_deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dismissed_movies_tmdb_refreshed_at
  ON dismissed_movies (tmdb_refreshed_at NULLS FIRST)
  WHERE deleted_at IS NULL AND tmdb_deleted_at IS NULL;

-- ---------------------------------------------
-- watchlist.backdrop_path を落とす
-- ---------------------------------------------
-- 20260202000000（初期スキーマ）から存在するが、**書き手も読み手もいない**。
--
--   POST の insert … user_id / tmdb_movie_id / title / poster_path / release_date
--                    しか入れない（src/app/api/watchlist/route.ts）
--   WATCHLIST_SELECT … id / tmdb_movie_id / title / poster_path / release_date /
--                    added_at / watched_at（src/constants/watchlist.ts）
--   get_watchlist_sorted … RETURNS TABLE に無い
--
-- 本番でも値を持つ行は0件だった（2026-11-21 実測）。TMDb 由来の列なので
-- 取り直しの対象に加える案もあるが、**誰も使っていないものを取り直すのは
-- TMDb へのリクエストを無駄に増やすだけ**。落とす。
ALTER TABLE watchlist DROP COLUMN IF EXISTS backdrop_path;
