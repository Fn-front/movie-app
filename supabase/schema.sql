-- ============================================
-- Movie App データベーススキーマ
-- ============================================
-- このSQLファイルをSupabase SQL Editorで実行してください
-- 実行順序: このファイルを上から順に実行

-- ============================================
-- 1. 拡張機能の有効化
-- ============================================

-- UUID生成用
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 2. テーブル作成
-- ============================================

-- --------------------------------------------
-- users（ユーザー）
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  avatar_url TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 更新日時自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------
-- otp_tokens（ワンタイムパスワード）
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS otp_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- インデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_tokens_user_token ON otp_tokens(user_id, token);
CREATE INDEX IF NOT EXISTS idx_otp_tokens_expires_at ON otp_tokens(expires_at);

-- --------------------------------------------
-- password_reset_tokens（パスワードリセット）
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- インデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- --------------------------------------------
-- watchlist（見たい映画リスト）
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_movie_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  poster_path VARCHAR(255),
  backdrop_path VARCHAR(255),
  release_date DATE,
  added_at TIMESTAMP NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP,
  notes TEXT
);

-- インデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_user_movie ON watchlist(user_id, tmdb_movie_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_added_at ON watchlist(added_at);
CREATE INDEX IF NOT EXISTS idx_watchlist_deleted_at ON watchlist(deleted_at);

-- --------------------------------------------
-- movie_cache（映画情報キャッシュ）
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS movie_cache (
  id INTEGER PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  poster_path VARCHAR(255),
  backdrop_path VARCHAR(255),
  release_date DATE,
  overview TEXT,
  vote_average DECIMAL(3,1),
  popularity DECIMAL(10,3),
  genre_ids JSONB,
  cached_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_movie_cache_release_date ON movie_cache(release_date);
CREATE INDEX IF NOT EXISTS idx_movie_cache_popularity ON movie_cache(popularity);
CREATE INDEX IF NOT EXISTS idx_movie_cache_cached_at ON movie_cache(cached_at);
CREATE INDEX IF NOT EXISTS idx_movie_cache_updated_at ON movie_cache(updated_at);

-- 更新日時自動更新トリガー
CREATE TRIGGER update_movie_cache_updated_at
  BEFORE UPDATE ON movie_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------
-- rate_limits（レート制限管理）
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier VARCHAR(255) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMP,
  last_attempt_at TIMESTAMP NOT NULL DEFAULT now(),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_action_type CHECK (action_type IN ('login', 'otp_verify', 'otp_resend'))
);

-- インデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limits_identifier_action ON rate_limits(identifier, action_type);
CREATE INDEX IF NOT EXISTS idx_rate_limits_locked_until ON rate_limits(locked_until);

-- 更新日時自動更新トリガー
CREATE TRIGGER update_rate_limits_updated_at
  BEFORE UPDATE ON rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------
-- user_preferences（ユーザー設定）
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  favorite_genres JSONB,
  preferred_languages JSONB,
  analysis_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- インデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- 更新日時自動更新トリガー
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------
-- reviews（レビュー・評価）
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_movie_id INTEGER NOT NULL,
  rating DECIMAL(2,1) NOT NULL,
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_rating CHECK (rating >= 0.5 AND rating <= 5.0),
  CONSTRAINT chk_comment_length CHECK (char_length(comment) <= 500)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_reviews_tmdb_movie_id ON reviews(tmdb_movie_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_movie ON reviews(user_id, tmdb_movie_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at);

-- 更新日時自動更新トリガー
CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 3. Row Level Security (RLS) ポリシー
-- ============================================

-- RLS有効化
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE movie_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------
-- users ポリシー
-- --------------------------------------------

-- SELECT: 自分のレコードのみ閲覧可能
CREATE POLICY users_select_own ON users
  FOR SELECT
  USING (auth.uid() = id);

-- INSERT: 公開（新規登録用）
CREATE POLICY users_insert_public ON users
  FOR INSERT
  WITH CHECK (true);

-- UPDATE: 自分のレコードのみ更新可能
CREATE POLICY users_update_own ON users
  FOR UPDATE
  USING (auth.uid() = id);

-- DELETE: 自分のレコードのみ削除可能
CREATE POLICY users_delete_own ON users
  FOR DELETE
  USING (auth.uid() = id);

-- --------------------------------------------
-- otp_tokens ポリシー
-- --------------------------------------------

-- SELECT: 自分のトークンのみ閲覧可能
CREATE POLICY otp_tokens_select_own ON otp_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: 公開（OTP発行用）
CREATE POLICY otp_tokens_insert_public ON otp_tokens
  FOR INSERT
  WITH CHECK (true);

-- UPDATE: 自分のトークンのみ更新可能
CREATE POLICY otp_tokens_update_own ON otp_tokens
  FOR UPDATE
  USING (auth.uid() = user_id);

-- DELETE: 自分のトークンのみ削除可能
CREATE POLICY otp_tokens_delete_own ON otp_tokens
  FOR DELETE
  USING (auth.uid() = user_id);

-- --------------------------------------------
-- password_reset_tokens ポリシー
-- --------------------------------------------

-- SELECT: 自分のトークンのみ閲覧可能
CREATE POLICY password_reset_tokens_select_own ON password_reset_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: 公開（パスワードリセット用）
CREATE POLICY password_reset_tokens_insert_public ON password_reset_tokens
  FOR INSERT
  WITH CHECK (true);

-- UPDATE: 自分のトークンのみ更新可能
CREATE POLICY password_reset_tokens_update_own ON password_reset_tokens
  FOR UPDATE
  USING (auth.uid() = user_id);

-- DELETE: 自分のトークンのみ削除可能
CREATE POLICY password_reset_tokens_delete_own ON password_reset_tokens
  FOR DELETE
  USING (auth.uid() = user_id);

-- --------------------------------------------
-- watchlist ポリシー
-- --------------------------------------------

-- SELECT: 自分のウォッチリストのみ閲覧可能（論理削除済みを除外）
CREATE POLICY watchlist_select_own ON watchlist
  FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

-- INSERT: 自分のウォッチリストのみ追加可能
CREATE POLICY watchlist_insert_own ON watchlist
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: 自分のウォッチリストのみ更新可能
CREATE POLICY watchlist_update_own ON watchlist
  FOR UPDATE
  USING (auth.uid() = user_id);

-- DELETE: 自分のウォッチリストのみ削除可能（実際には論理削除を使用）
CREATE POLICY watchlist_delete_own ON watchlist
  FOR DELETE
  USING (auth.uid() = user_id);

-- --------------------------------------------
-- movie_cache ポリシー
-- --------------------------------------------

-- SELECT: 全員閲覧可能
CREATE POLICY movie_cache_select_all ON movie_cache
  FOR SELECT
  USING (true);

-- INSERT: サービスロールのみ
-- UPDATE: サービスロールのみ
-- DELETE: サービスロールのみ
-- （API Routeでservice_role keyを使用して操作）

-- --------------------------------------------
-- rate_limits ポリシー
-- --------------------------------------------

-- SELECT: 全員閲覧可能（自身のレート制限確認用）
CREATE POLICY rate_limits_select_all ON rate_limits
  FOR SELECT
  USING (true);

-- INSERT: 全員挿入可能
CREATE POLICY rate_limits_insert_all ON rate_limits
  FOR INSERT
  WITH CHECK (true);

-- UPDATE: 全員更新可能
CREATE POLICY rate_limits_update_all ON rate_limits
  FOR UPDATE
  USING (true);

-- DELETE: 全員削除可能
CREATE POLICY rate_limits_delete_all ON rate_limits
  FOR DELETE
  USING (true);

-- --------------------------------------------
-- user_preferences ポリシー
-- --------------------------------------------

-- SELECT: 自分の設定のみ閲覧可能
CREATE POLICY user_preferences_select_own ON user_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: 自分の設定のみ追加可能
CREATE POLICY user_preferences_insert_own ON user_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: 自分の設定のみ更新可能
CREATE POLICY user_preferences_update_own ON user_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

-- DELETE: 自分の設定のみ削除可能
CREATE POLICY user_preferences_delete_own ON user_preferences
  FOR DELETE
  USING (auth.uid() = user_id);

-- --------------------------------------------
-- reviews ポリシー
-- --------------------------------------------

-- SELECT: 全員閲覧可能
CREATE POLICY reviews_select_all ON reviews
  FOR SELECT
  USING (true);

-- INSERT: 自分のレビューのみ追加可能
CREATE POLICY reviews_insert_own ON reviews
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: 自分のレビューのみ更新可能
CREATE POLICY reviews_update_own ON reviews
  FOR UPDATE
  USING (auth.uid() = user_id);

-- DELETE: 自分のレビューのみ削除可能
CREATE POLICY reviews_delete_own ON reviews
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 4. 完了メッセージ
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ データベーススキーマの作成が完了しました！';
  RAISE NOTICE '';
  RAISE NOTICE '作成されたテーブル:';
  RAISE NOTICE '  - users';
  RAISE NOTICE '  - otp_tokens';
  RAISE NOTICE '  - password_reset_tokens';
  RAISE NOTICE '  - watchlist';
  RAISE NOTICE '  - movie_cache';
  RAISE NOTICE '  - rate_limits';
  RAISE NOTICE '  - user_preferences';
  RAISE NOTICE '  - reviews';
  RAISE NOTICE '';
  RAISE NOTICE '次のステップ:';
  RAISE NOTICE '  1. Supabaseダッシュボードでテーブルが作成されたことを確認';
  RAISE NOTICE '  2. Authentication設定を確認';
  RAISE NOTICE '  3. NextAuth.js設定ファイルを作成';
END $$;
