-- ============================================
-- trending_movies → now_showing_movies リネーム
-- ============================================
-- コード側の命名（nowShowing）に合わせてDB側の命名を統一する

-- --------------------------------------------
-- 1. テーブルリネーム
-- --------------------------------------------
ALTER TABLE trending_movies RENAME TO now_showing_movies;

-- --------------------------------------------
-- 2. インデックスリネーム
-- --------------------------------------------
ALTER INDEX idx_trending_movies_tmdb_movie_id RENAME TO idx_now_showing_movies_tmdb_movie_id;
ALTER INDEX idx_trending_movies_display_order RENAME TO idx_now_showing_movies_display_order;

-- --------------------------------------------
-- 3. RLSポリシーのリネーム（DROP → CREATE）
-- --------------------------------------------
DROP POLICY IF EXISTS trending_movies_select_all ON now_showing_movies;

CREATE POLICY now_showing_movies_select_all ON now_showing_movies
  FOR SELECT
  USING (true);

-- --------------------------------------------
-- 4. RPC関数のリネーム（DROP → CREATE）
-- --------------------------------------------
DROP FUNCTION IF EXISTS sync_trending_movies(JSONB);

CREATE OR REPLACE FUNCTION sync_now_showing_movies(movies JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  synced_count INTEGER;
BEGIN
  -- 既存データを全件削除（WHERE TRUE で全件指定）
  DELETE FROM now_showing_movies WHERE TRUE;

  -- 新しいデータを挿入
  INSERT INTO now_showing_movies (
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
