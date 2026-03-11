-- ============================================
-- favorites（お気に入り映画）テーブル追加
-- ============================================

-- --------------------------------------------
-- テーブル作成
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

-- --------------------------------------------
-- インデックス
-- --------------------------------------------

-- 重複防止（論理削除済みは対象外、再追加可能）
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_user_movie
  ON favorites(user_id, tmdb_movie_id) WHERE deleted_at IS NULL;

-- ユーザー別一覧取得用
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);

-- --------------------------------------------
-- トリガー
-- --------------------------------------------

-- update_updated_at_column() は初期マイグレーションで定義済み
CREATE TRIGGER update_favorites_updated_at
  BEFORE UPDATE ON favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------
-- Row Level Security
-- --------------------------------------------
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

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
