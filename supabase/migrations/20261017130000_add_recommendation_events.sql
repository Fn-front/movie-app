-- recommendation_events テーブル作成
--
-- レコメンドの品質を客観的に測る指標（CTR・ウォッチリスト追加率・dismiss率）が
-- 無く、改善の効果を判断できなかった。表示・クリック・ウォッチリスト追加・
-- 興味なし の4イベントを記録する。
--
-- recommendation_id は参照のみで外部キーを張らない。レコメンドは日次CRONで
-- 全件洗い替え（DELETE → INSERT）されるため、外部キーにすると過去のイベントが
-- 連鎖削除され、時系列で効果を追えなくなる。
-- 代わりに tmdb_movie_id を持たせ、作品単位の集計を可能にする。

CREATE TABLE recommendation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recommendation_id UUID NOT NULL,
  tmdb_movie_id INTEGER NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('impression', 'click', 'add_to_watchlist', 'dismiss')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Data API（supabase-js / PostgREST）への公開に必要なGRANT。
-- 書き込みは本人、集計はサーバー側（service_role）のみ。
-- 行動ログなので anon には一切付与しない。
GRANT SELECT, INSERT ON public.recommendation_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendation_events TO service_role;

-- 同一ユーザー・同一レコメンド・同一種別のイベントは1件に抑える。
-- impression はスクロールのたびに発火しうるため、重複記録を防ぐ。
CREATE UNIQUE INDEX uq_recommendation_events_user_rec_type
  ON recommendation_events (user_id, recommendation_id, event_type);

-- 保持期間（90日）の削除で使う
CREATE INDEX idx_recommendation_events_created_at
  ON recommendation_events (created_at);

-- 集計（種別ごとの件数）で使う
CREATE INDEX idx_recommendation_events_type_created_at
  ON recommendation_events (event_type, created_at);

ALTER TABLE recommendation_events ENABLE ROW LEVEL SECURITY;

-- 行動ログは個人の嗜好に直結するため、本人以外から読めないようにする。
-- 集計は service_role（RLSをバイパス）で行う。
CREATE POLICY "recommendation_events_select_own"
  ON recommendation_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "recommendation_events_insert_own"
  ON recommendation_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE recommendation_events IS 'レコメンドの利用イベント。保持期間は90日で、日次CRONが超過分を削除する';
COMMENT ON COLUMN recommendation_events.recommendation_id IS 'recommendations.id。洗い替えで消えるため外部キーは張らない';

-- 90日より古いイベントを削除する
--
-- 行動ログを無期限に保持しないための定期削除。日次CRONから呼び出す。
-- service_role 経由でのみ実行されるため SECURITY INVOKER で十分。
CREATE OR REPLACE FUNCTION delete_expired_recommendation_events(
  retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM recommendation_events
  WHERE created_at < now() - (retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_expired_recommendation_events(INTEGER) TO service_role;

-- ============================================
-- chk_action_type に write_api_recommendation_events を追加
-- ============================================
-- イベント記録APIのレート制限で使う。
-- ⚠️ 許可リストは src/constants/rateLimit.ts の RateLimitActionType と
-- 必ず一致させること。漏れるとその制限が無言で無効化される（#546 / #659）。

ALTER TABLE rate_limits
  DROP CONSTRAINT IF EXISTS chk_action_type;

ALTER TABLE rate_limits
  ADD CONSTRAINT chk_action_type CHECK (
    action_type IN (
      -- OTP_ACTION（src/constants/otp.ts）
      'registration',
      'login',
      'password_change',
      -- RATE_LIMIT_ACTION（src/constants/rateLimit.ts）
      'write_api_favorites',
      'write_api_watchlist',
      'write_api_dismissed_movies',
      'write_api_profile',
      'write_api_settings',
      'read_api_theaters',
      'read_api_theater_detail',
      'awards_fetch',
      'suggest_title',
      'register',
      'change_password',
      'recommendation_refresh',
      'write_api_recommendation_events',  -- 本マイグレーションで追加（#574）
      'otp_send_daily',
      'otp_verify',
      'login_ip',
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'src/constants/rateLimit.ts の RateLimitActionType と必ず一致させること。許可リストから漏れると該当の制限が無言で無効化される（#546 / #659）。';
