-- ============================================
-- セキュリティ改善マイグレーション
-- ============================================
-- 1. rate_limits テーブルのRLSポリシーを厳格化
-- 2. movie_cache, accounts, otp_codes のRLSポリシーを明示化
-- 3. sync_now_showing_movies RPCを SECURITY INVOKER に変更

-- ============================================
-- 1. rate_limits テーブルのRLSポリシー厳格化
-- ============================================
-- 現状: 全操作が USING (true) で完全開放
-- 修正: anon/authenticated ユーザーからのアクセスを拒否
-- ※ 実際のアクセスは全て service role 経由（RLSバイパス）

DROP POLICY IF EXISTS rate_limits_select_all ON rate_limits;
DROP POLICY IF EXISTS rate_limits_insert_all ON rate_limits;
DROP POLICY IF EXISTS rate_limits_update_all ON rate_limits;
DROP POLICY IF EXISTS rate_limits_delete_all ON rate_limits;

-- service role のみアクセス可能（ポリシーなし = 全拒否、service role は RLS バイパス）

-- ============================================
-- 2. movie_cache のRLSポリシー明示化
-- ============================================
-- SELECT は既存ポリシーで全員閲覧可能（そのまま維持）
-- INSERT/UPDATE/DELETE は service role のみ（ポリシーなし = 暗黙的拒否）
-- → コメントで意図を明示（暗黙的拒否で正しい動作）

-- ============================================
-- 3. accounts テーブルのRLSポリシー明示化
-- ============================================
-- SELECT/DELETE は既存ポリシーで auth.uid() = user_id（そのまま維持）
-- INSERT/UPDATE は service role のみ（ポリシーなし = 暗黙的拒否）
-- → コメントで意図を明示（暗黙的拒否で正しい動作）

-- ============================================
-- 4. otp_codes テーブルのRLSポリシー明示化
-- ============================================
-- RLS有効、ポリシーなし = 全拒否（service role のみアクセス可能）
-- → コメントで意図を明示（暗黙的拒否で正しい動作）

-- ============================================
-- 5. sync_now_showing_movies RPCを SECURITY INVOKER に変更
-- ============================================
-- SECURITY DEFINER → SECURITY INVOKER に修正
-- Cron APIから service role で呼び出すため RLS バイパスは維持される

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
