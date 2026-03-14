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
  password_hash VARCHAR(255),
  name VARCHAR(100),
  avatar_url TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  password_changed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_user_role CHECK (role IN ('user', 'admin'))
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

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
-- accounts（ソーシャルログインアカウント連携）
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'oauth',
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  token_type VARCHAR(50),
  scope VARCHAR(255),
  id_token TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- インデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_provider_account
  ON accounts(provider, provider_account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id
  ON accounts(user_id);

-- 更新日時自動更新トリガー
CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------
-- otp_codes（OTP検証コード）
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  code VARCHAR(6) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_otp_action_type CHECK (action_type IN ('registration', 'login', 'password_change')),
  CONSTRAINT chk_otp_attempts CHECK (attempts >= 0 AND attempts <= 5),
  CONSTRAINT chk_otp_code_format CHECK (code ~ '^\d{6}$')
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_otp_codes_email_action_created
  ON otp_codes(email, action_type, created_at);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at
  ON otp_codes(expires_at);

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
-- favorites（お気に入り映画）
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_movie_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  poster_path VARCHAR(255),
  release_date DATE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
  added_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP
);

-- インデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_user_movie
  ON favorites(user_id, tmdb_movie_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);

-- 更新日時自動更新トリガー
CREATE TRIGGER update_favorites_updated_at
  BEFORE UPDATE ON favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------
-- movie_cache（映画情報キャッシュ）
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS movie_cache (
  id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  poster_path VARCHAR(255),
  backdrop_path VARCHAR(255),
  release_date DATE,
  overview TEXT,
  vote_average DECIMAL(3,1),
  popularity DECIMAL(10,3),
  genre_ids JSONB,
  release_type VARCHAR(20) NOT NULL DEFAULT 'theatrical',
  is_revival BOOLEAN NOT NULL DEFAULT false,
  is_now_playing BOOLEAN NOT NULL DEFAULT false,
  cached_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (id, release_type)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_movie_cache_release_date ON movie_cache(release_date);
CREATE INDEX IF NOT EXISTS idx_movie_cache_popularity ON movie_cache(popularity);
CREATE INDEX IF NOT EXISTS idx_movie_cache_cached_at ON movie_cache(cached_at);
CREATE INDEX IF NOT EXISTS idx_movie_cache_updated_at ON movie_cache(updated_at);
CREATE INDEX IF NOT EXISTS idx_movie_cache_release_type ON movie_cache(release_type);
CREATE INDEX IF NOT EXISTS idx_movie_cache_is_now_playing ON movie_cache(is_now_playing);

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
  CONSTRAINT chk_action_type CHECK (action_type IN ('login', 'otp_verify', 'otp_resend', 'change_password'))
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
-- user_settings（ユーザー設定）
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme VARCHAR(10) NOT NULL DEFAULT 'light',
  notification_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT user_settings_user_id_unique UNIQUE (user_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- 更新日時自動更新トリガー
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------
-- saved_filters（保存済みフィルター）
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filter_conditions JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT saved_filters_user_id_unique UNIQUE (user_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_saved_filters_user_id ON saved_filters(user_id);

-- 更新日時自動更新トリガー
CREATE TRIGGER update_saved_filters_updated_at
  BEFORE UPDATE ON saved_filters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------
-- user_preferences（ユーザー嗜好データ）
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

-- --------------------------------------------
-- trending_movies（トレンド映画）
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS trending_movies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_movie_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  poster_path VARCHAR(255),
  release_date DATE,
  vote_average DECIMAL(3,1),
  popularity DECIMAL(10,3),
  display_order INTEGER NOT NULL,
  fetched_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_display_order CHECK (display_order >= 1 AND display_order <= 10)
);

-- インデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_trending_movies_tmdb_movie_id ON trending_movies(tmdb_movie_id);
CREATE INDEX IF NOT EXISTS idx_trending_movies_display_order ON trending_movies(display_order);

-- ============================================
-- 3. Row Level Security (RLS) ポリシー
-- ============================================

-- RLS有効化
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE movie_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE trending_movies ENABLE ROW LEVEL SECURITY;

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
-- accounts ポリシー
-- --------------------------------------------

-- SELECT: 自分のレコードのみ閲覧可能
CREATE POLICY accounts_select_own ON accounts
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE: サーバー側のみ（service roleでバイパス）

-- DELETE: 自分のレコードのみ削除可能
CREATE POLICY accounts_delete_own ON accounts
  FOR DELETE
  USING (auth.uid() = user_id);

-- --------------------------------------------
-- otp_codes ポリシー
-- --------------------------------------------
-- すべてservice roleで操作するためポリシーは設定しない

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
-- favorites ポリシー
-- --------------------------------------------

-- SELECT: 自分のお気に入りのみ閲覧可能（論理削除済みを除外）
CREATE POLICY favorites_select_own ON favorites
  FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

-- INSERT: 自分のお気に入りのみ追加可能
CREATE POLICY favorites_insert_own ON favorites
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: 自分のお気に入りのみ更新可能
CREATE POLICY favorites_update_own ON favorites
  FOR UPDATE
  USING (auth.uid() = user_id);

-- DELETE: 自分のお気に入りのみ削除可能（実際には論理削除を使用）
CREATE POLICY favorites_delete_own ON favorites
  FOR DELETE
  USING (auth.uid() = user_id);

-- --------------------------------------------
-- movie_cache ポリシー
-- --------------------------------------------

-- SELECT: 全員閲覧可能
CREATE POLICY movie_cache_select_all ON movie_cache
  FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE: サービスロールのみ
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
-- user_settings ポリシー
-- --------------------------------------------

CREATE POLICY user_settings_select_own ON user_settings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY user_settings_insert_own ON user_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_settings_update_own ON user_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY user_settings_delete_own ON user_settings
  FOR DELETE
  USING (auth.uid() = user_id);

-- --------------------------------------------
-- saved_filters ポリシー
-- --------------------------------------------

CREATE POLICY saved_filters_select_own ON saved_filters
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY saved_filters_insert_own ON saved_filters
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY saved_filters_update_own ON saved_filters
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY saved_filters_delete_own ON saved_filters
  FOR DELETE
  USING (auth.uid() = user_id);

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

-- --------------------------------------------
-- trending_movies ポリシー
-- --------------------------------------------

-- SELECT: 全員閲覧可能
CREATE POLICY trending_movies_select_all ON trending_movies
  FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE: サービスロールのみ（Cron API経由）
