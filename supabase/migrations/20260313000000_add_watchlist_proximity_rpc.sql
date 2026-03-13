-- ウォッチリストを公開日の近さ順で取得するRPC関数
-- ABS(release_date - NOW())の昇順、release_dateがNULLの映画は末尾
CREATE OR REPLACE FUNCTION get_watchlist_by_proximity(
  p_user_id UUID,
  p_limit INT,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  tmdb_movie_id INT,
  title TEXT,
  poster_path TEXT,
  release_date DATE,
  added_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    w.id,
    w.tmdb_movie_id,
    w.title,
    w.poster_path,
    w.release_date,
    w.added_at,
    COUNT(*) OVER() AS total_count
  FROM watchlist w
  WHERE w.user_id = p_user_id
    AND w.deleted_at IS NULL
  ORDER BY
    CASE WHEN w.release_date IS NULL THEN 1 ELSE 0 END,
    ABS(w.release_date - CURRENT_DATE),
    w.added_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;
