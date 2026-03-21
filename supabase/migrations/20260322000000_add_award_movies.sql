-- ============================================
-- award_movies（受賞作品）テーブル追加
-- ============================================

-- --------------------------------------------
-- テーブル作成
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS award_movies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_movie_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  poster_path VARCHAR(255),
  release_date DATE,
  vote_average NUMERIC(3,1),
  genre_ids INTEGER[],
  award_name VARCHAR(100) NOT NULL,
  award_year INTEGER NOT NULL,
  category VARCHAR(100) NOT NULL,
  award_label VARCHAR(255) NOT NULL,
  is_winner BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_award_movies_entry UNIQUE (tmdb_movie_id, award_name, award_year, category)
);

-- --------------------------------------------
-- インデックス
-- --------------------------------------------

-- 賞・年ごとの絞り込み用
CREATE INDEX IF NOT EXISTS idx_award_movies_award_year ON award_movies(award_name, award_year);

-- 受賞作品フィルタ用
CREATE INDEX IF NOT EXISTS idx_award_movies_is_winner ON award_movies(is_winner);

-- --------------------------------------------
-- Row Level Security
-- --------------------------------------------
ALTER TABLE award_movies ENABLE ROW LEVEL SECURITY;

-- SELECT: 全ユーザー閲覧可能（公開データ）
CREATE POLICY award_movies_select_all ON award_movies
  FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE: service_role のみ（Cron API経由）
-- RLSでユーザーからの直接操作は不可（service_roleはRLSをバイパス）
