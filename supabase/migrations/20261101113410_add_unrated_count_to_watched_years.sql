-- 追加年ごとの「お気に入り未登録」件数を返り値に足す
--
-- 背景:
--   視聴済みにしたとき評価モーダルは開くが、お気に入り登録は任意で、
--   閉じるだけでも視聴済みは残る（watchlistPage の handleWatchedToggle）。
--   そのためお気に入り未登録のまま視聴済み、という状態が普通に発生する。
--   その作品をウォッチリストから消すと、観たという記録がアプリ上に残らない。
--
--   一括削除のモーダルで「この年の N 件は記録が残りません」と知らせるために、
--   年ごとの未登録件数が要る。
--
-- 読み込み済みの行から数えない理由:
--   モーダルは無限スクロールで、未スクロール分も削除対象に含まれる。
--   画面に出ている行だけ数えると実際より少ない件数を見せることになる。
--   「すべて選択」が年全件を指すのと同じ粒度でサーバーが数える。
--
-- LEFT JOIN で重複しない根拠:
--   favorites の idx_favorites_user_movie は (user_id, tmdb_movie_id) の
--   UNIQUE かつ deleted_at IS NULL 条件付きのため、有効な行は高々1件。
--
-- 戻り値の列を増やすため CREATE OR REPLACE では置き換えられない。
-- DROP してから作り直すので、権限は既定付与が復活しないよう明示的に書き直す
-- （.claude/rules/supabase-db.md の注意点）。

DROP FUNCTION IF EXISTS public.get_watchlist_watched_years(UUID);

CREATE FUNCTION public.get_watchlist_watched_years(
  p_user_id UUID
)
RETURNS TABLE (
  added_year INT,
  watched_count BIGINT,
  unrated_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    EXTRACT(YEAR FROM (w.added_at AT TIME ZONE 'Asia/Tokyo'))::INT AS added_year,
    COUNT(*) AS watched_count,
    COUNT(*) FILTER (WHERE f.id IS NULL) AS unrated_count
  FROM watchlist w
  LEFT JOIN favorites f
    ON f.user_id = w.user_id
   AND f.tmdb_movie_id = w.tmdb_movie_id
   AND f.deleted_at IS NULL
  WHERE w.user_id = p_user_id
    AND w.deleted_at IS NULL
    AND w.watched_at IS NOT NULL
  GROUP BY 1
  ORDER BY 1 DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_watchlist_watched_years(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_watchlist_watched_years(UUID) TO service_role;

COMMENT ON FUNCTION public.get_watchlist_watched_years(UUID) IS
  '追加年（JST）ごとの視聴済み件数と、そのうちお気に入り未登録の件数を降順で返す。0件の年は返さない。EXECUTE は service_role のみ。';
