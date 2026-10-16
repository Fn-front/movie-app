-- ============================================
-- upsert_recommendations RPC の追加
-- ============================================
-- 背景: レコメンドの洗い替えは Supabase JS から DELETE → INSERT の2リクエストで
-- 行っていたため PostgreSQL のトランザクションにならず、DELETE 完了後 INSERT 前に
-- プロセスが落ちる / abort されると「既存レコメンドが全消失した状態」で残りうる。
-- 復元処理は INSERT 失敗時にしか発火しないため、kill / timeout では無効だった。
--
-- 本関数は DELETE → INSERT を1ステートメント（＝1トランザクション）内で実行するため、
-- 途中で中断されても既存レコメンドはロールバックで保持される。

CREATE OR REPLACE FUNCTION upsert_recommendations(
  p_user_id UUID,
  p_recommendations JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  -- 既存レコメンドを削除（UNIQUE制約 user_id+display_order / user_id+tmdb_movie_id の衝突回避）
  DELETE FROM recommendations WHERE user_id = p_user_id;

  INSERT INTO recommendations (
    user_id, tmdb_movie_id, title, poster_path, release_date,
    vote_average, vote_count, genre_ids, reason, display_order, generated_at
  )
  SELECT
    p_user_id,
    (item->>'tmdb_movie_id')::INTEGER,
    item->>'title',
    item->>'poster_path',
    CASE WHEN item->>'release_date' IS NOT NULL AND item->>'release_date' != ''
      THEN (item->>'release_date')::DATE
      ELSE NULL
    END,
    (item->>'vote_average')::NUMERIC(3,1),
    COALESCE((item->>'vote_count')::INTEGER, 0),
    CASE WHEN jsonb_typeof(item->'genre_ids') = 'array'
      THEN ARRAY(
        SELECT jsonb_array_elements_text(item->'genre_ids')::INTEGER
      )
      ELSE NULL
    END,
    item->>'reason',
    (item->>'display_order')::INTEGER,
    now()
  FROM jsonb_array_elements(p_recommendations) AS item;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN inserted_count;
END;
$$;

COMMENT ON FUNCTION upsert_recommendations(UUID, JSONB) IS
  'ユーザーのレコメンドをトランザクション内で全件洗い替えする（DELETE → INSERT）';
