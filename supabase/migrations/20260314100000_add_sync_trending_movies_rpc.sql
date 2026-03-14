-- ============================================
-- sync_trending_movies RPC関数
-- ============================================
-- トレンド映画の全件洗い替えをトランザクション内で実行する
-- DELETE → INSERT をアトミックに行い、途中失敗時はロールバック

CREATE OR REPLACE FUNCTION sync_trending_movies(movies JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  synced_count INTEGER;
BEGIN
  -- 既存データを全件削除
  DELETE FROM trending_movies;

  -- 新しいデータを挿入
  INSERT INTO trending_movies (
    tmdb_movie_id, title, poster_path, release_date,
    vote_average, popularity, display_order, fetched_at
  )
  SELECT
    (item->>'tmdb_movie_id')::INTEGER,
    item->>'title',
    item->>'poster_path',
    CASE WHEN item->>'release_date' IS NOT NULL AND item->>'release_date' != ''
      THEN (item->>'release_date')::DATE
      ELSE NULL
    END,
    (item->>'vote_average')::DECIMAL(3,1),
    (item->>'popularity')::DECIMAL(10,3),
    (item->>'display_order')::INTEGER,
    now()
  FROM jsonb_array_elements(movies) AS item;

  GET DIAGNOSTICS synced_count = ROW_COUNT;

  RETURN synced_count;
END;
$$;
