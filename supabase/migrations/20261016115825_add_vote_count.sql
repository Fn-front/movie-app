-- ============================================
-- vote_count（TMDb評価件数）カラムの追加
-- ============================================
-- TMDb は映画ごとに vote_average（平均評価）と vote_count（評価件数）の両方を返すが、
-- これまで vote_count を保持していなかった。信頼性による足切り・重み付けスコアの
-- 土台として 4 テーブルに vote_count を追加する。
-- 既存レコードは DEFAULT 0 で埋め、以降の TMDb 同期で正しい値が入る。

ALTER TABLE public.movie_cache
  ADD COLUMN IF NOT EXISTS vote_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.recommendations
  ADD COLUMN IF NOT EXISTS vote_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.now_showing_movies
  ADD COLUMN IF NOT EXISTS vote_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.award_movies
  ADD COLUMN IF NOT EXISTS vote_count INTEGER NOT NULL DEFAULT 0;

-- ============================================
-- sync_now_showing_movies RPC の更新
-- ============================================
-- now_showing_movies は RPC 内の DELETE → INSERT で全件洗い替えするため、
-- INSERT 対象カラムに vote_count を追加する。
-- （定義は 20260318000000_security_improvements.sql の SECURITY INVOKER 版を踏襲）

CREATE OR REPLACE FUNCTION sync_now_showing_movies(movies JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
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
    vote_average, vote_count, popularity, display_order, fetched_at
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
    COALESCE((item->>'vote_count')::INTEGER, 0),
    (item->>'popularity')::DECIMAL(10,3),
    (item->>'display_order')::INTEGER,
    now()
  FROM jsonb_array_elements(movies) AS item;

  GET DIAGNOSTICS synced_count = ROW_COUNT;

  RETURN synced_count;
END;
$$;
