-- =============================================================
-- #159: テーブルインデックス最適化
-- #160: スキーマ整合性修正
-- =============================================================

-- -----------------------------------------------------------
-- #159: favorites テーブル — ソート用インデックス追加
-- -----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_favorites_user_added_at
  ON favorites (user_id, added_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_favorites_user_rating
  ON favorites (user_id, rating DESC)
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------
-- #159: recommendations テーブル — display_order ソート用インデックス
-- -----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_recommendations_user_display_order
  ON recommendations (user_id, display_order ASC);

-- -----------------------------------------------------------
-- #159: dismissed_movies テーブル — 複合インデックス
-- -----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dismissed_movies_user_created
  ON dismissed_movies (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------
-- #160: saved_filters テーブル — created_at カラム追加
-- -----------------------------------------------------------
ALTER TABLE saved_filters
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- -----------------------------------------------------------
-- #160: dismissed_movies テーブル — updated_at カラム + トリガー追加
-- -----------------------------------------------------------
ALTER TABLE dismissed_movies
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TRIGGER update_dismissed_movies_updated_at
  BEFORE UPDATE ON dismissed_movies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------
-- #160: TIMESTAMP → TIMESTAMPTZ 統一
-- users テーブル
-- -----------------------------------------------------------
ALTER TABLE users
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE users
  ALTER COLUMN password_changed_at TYPE TIMESTAMPTZ USING password_changed_at AT TIME ZONE 'UTC';

ALTER TABLE users
  ALTER COLUMN last_login_at TYPE TIMESTAMPTZ USING last_login_at AT TIME ZONE 'UTC';

-- -----------------------------------------------------------
-- #160: TIMESTAMP → TIMESTAMPTZ 統一
-- favorites テーブル
-- deleted_at を参照するRLSポリシー・インデックスを一旦DROPしてから型変更
-- -----------------------------------------------------------

-- 依存するポリシーをDROP
DROP POLICY IF EXISTS favorites_select_own ON favorites;

-- 依存する部分インデックスをDROP
DROP INDEX IF EXISTS idx_favorites_user_deleted;
DROP INDEX IF EXISTS idx_favorites_user_added_at;
DROP INDEX IF EXISTS idx_favorites_user_rating;
DROP INDEX IF EXISTS idx_favorites_unique_active;

-- 型変更
ALTER TABLE favorites
  ALTER COLUMN added_at TYPE TIMESTAMPTZ USING added_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC',
  ALTER COLUMN deleted_at TYPE TIMESTAMPTZ USING deleted_at AT TIME ZONE 'UTC';

-- ポリシーを再作成
CREATE POLICY favorites_select_own ON favorites
  FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

-- 部分インデックスを再作成（このマイグレーション冒頭で作成したものも含む）
CREATE INDEX IF NOT EXISTS idx_favorites_user_added_at
  ON favorites (user_id, added_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_favorites_user_rating
  ON favorites (user_id, rating DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_favorites_unique_active
  ON favorites(user_id, tmdb_movie_id) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------
-- #160: TIMESTAMP → TIMESTAMPTZ 統一
-- saved_filters テーブル
-- -----------------------------------------------------------
ALTER TABLE saved_filters
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
