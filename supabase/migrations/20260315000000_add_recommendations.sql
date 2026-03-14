-- ============================================
-- recommendations（AIレコメンド）テーブル追加
-- ============================================

-- --------------------------------------------
-- テーブル作成
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_movie_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  poster_path VARCHAR(255),
  release_date DATE,
  vote_average NUMERIC(3,1),
  genre_ids INTEGER[],
  reason TEXT NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 10), -- RECOMMENDATIONS_MAX_COUNT = 10 と同期
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_recommendations_user_order UNIQUE (user_id, display_order),
  CONSTRAINT uq_recommendations_user_movie UNIQUE (user_id, tmdb_movie_id)
);

-- --------------------------------------------
-- インデックス
-- --------------------------------------------

-- ユーザー別一覧取得用
CREATE INDEX IF NOT EXISTS idx_recommendations_user_id ON recommendations(user_id);

-- --------------------------------------------
-- Row Level Security
-- --------------------------------------------
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

-- SELECT: 自分のレコメンドのみ参照可能
CREATE POLICY recommendations_select_own ON recommendations
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE: service_role のみ（Cron API経由）
-- RLSでユーザーからの直接操作は不可（service_roleはRLSをバイパス）
