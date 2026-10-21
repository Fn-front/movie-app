-- get_watchlist_by_proximity を復活させる（#789 の後片付け）
--
-- 20261021065114 で get_watchlist_sorted に置き換えるときに DROP したが、
-- DBは1つしかなく、ブランチはスキーマ変更をリモートへ先行適用するしかない
-- （.claude/rules/supabase-db.md）。そのため DROP した瞬間に、まだ
-- get_watchlist_by_proximity を呼んでいる main と他ブランチの
-- GET /api/watchlist が 500 になってしまった。
--
-- 互換のために置き直す。中身は get_watchlist_sorted に委譲するので
-- 並び順の定義は一箇所のまま。返す列は旧シグネチャのまま（watched_at を含めない）。
--
-- #789 がマージされ、全ブランチが get_watchlist_sorted に移ったら削除してよい。

CREATE OR REPLACE FUNCTION public.get_watchlist_by_proximity(
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
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    s.id,
    s.tmdb_movie_id,
    s.title,
    s.poster_path,
    s.release_date,
    s.added_at,
    s.total_count
  FROM public.get_watchlist_sorted(
    p_user_id,
    'release_date_proximity',
    p_limit,
    p_offset,
    FALSE
  ) s;
$$;

REVOKE EXECUTE ON FUNCTION public.get_watchlist_by_proximity(UUID, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_watchlist_by_proximity(UUID, INT, INT) TO service_role;

COMMENT ON FUNCTION public.get_watchlist_by_proximity(UUID, INT, INT) IS
  '非推奨。get_watchlist_sorted への委譲。#789 マージ前のコードとの互換のためだけに残している。';
