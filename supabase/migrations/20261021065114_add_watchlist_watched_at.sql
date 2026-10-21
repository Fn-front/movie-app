-- ウォッチリストに「視聴済み」を追加する（#789）
--
-- 真偽値ではなく日時を持たせる。「いつ見たか」で並べ替える拡張ができるし、
-- 真偽値から日時へは後から移行できない。NULL = 未視聴。

ALTER TABLE public.watchlist
  ADD COLUMN watched_at TIMESTAMPTZ;

COMMENT ON COLUMN public.watchlist.watched_at IS
  '視聴済みにした日時。NULL は未視聴。削除（deleted_at）とは別概念で、視聴済みにしてもウォッチリストには残る。';

-- 一覧は「未視聴を先、視聴済みを後」で並べるため、user_id と組で引く
CREATE INDEX IF NOT EXISTS idx_watchlist_user_watched
  ON public.watchlist (user_id, watched_at)
  WHERE deleted_at IS NULL;

-- --------------------------------------------
-- 一覧取得RPCの置き換え
-- --------------------------------------------
--
-- これまで「追加日順」はアプリ側のキーセットページング（added_at カーソル）、
-- 「公開日が近い順」は get_watchlist_by_proximity のオフセットページング、と
-- 実装が分かれていた。
--
-- 視聴済みを最下部に送ると並び順の主キーが watched_at になり、added_at だけの
-- カーソルでは次ページの境界を表せなくなる。両ソートを1つの関数に寄せて
-- オフセットページングに統一する。
--
-- サイドバー（公開日が近い映画）は視聴済みを表示しないため、除外を引数で切り替える。
-- クライアント側で弾くと上位N件の枠が視聴済みで埋まって表示件数が減る。

DROP FUNCTION IF EXISTS public.get_watchlist_by_proximity(UUID, INT, INT);

CREATE OR REPLACE FUNCTION public.get_watchlist_sorted(
  p_user_id UUID,
  p_sort TEXT,
  p_limit INT,
  p_offset INT DEFAULT 0,
  p_exclude_watched BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  tmdb_movie_id INT,
  title TEXT,
  poster_path TEXT,
  release_date DATE,
  added_at TIMESTAMPTZ,
  watched_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    w.id,
    w.tmdb_movie_id,
    w.title,
    w.poster_path,
    w.release_date,
    w.added_at,
    w.watched_at,
    COUNT(*) OVER() AS total_count
  FROM watchlist w
  WHERE w.user_id = p_user_id
    AND w.deleted_at IS NULL
    AND (NOT p_exclude_watched OR w.watched_at IS NULL)
  ORDER BY
    -- 視聴済みは常に最後
    CASE WHEN w.watched_at IS NULL THEN 0 ELSE 1 END,
    -- 公開日が近い順。公開日なしは同グループ内の末尾
    CASE
      WHEN p_sort <> 'release_date_proximity' THEN NULL
      WHEN w.release_date IS NULL THEN 1
      ELSE 0
    END NULLS FIRST,
    CASE
      WHEN p_sort = 'release_date_proximity' THEN ABS(w.release_date - CURRENT_DATE)
      ELSE NULL
    END NULLS FIRST,
    w.added_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

REVOKE EXECUTE ON FUNCTION public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN) IS
  'ウォッチリストを指定ソートで返す。視聴済みは常に最後。p_exclude_watched で視聴済みを除外できる。SECURITY INVOKER のため RLS が効く。EXECUTE は service_role のみ。';
