-- ============================================
-- trending_movies（トレンド映画）
-- ============================================
-- TMDb Trending API（週次）から取得したトレンド映画を保存
-- Vercel Cronで週1回同期（全件洗い替え）

-- --------------------------------------------
-- テーブル作成
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

-- --------------------------------------------
-- RLS（Row Level Security）
-- --------------------------------------------
ALTER TABLE trending_movies ENABLE ROW LEVEL SECURITY;

-- SELECT: 全員閲覧可能
CREATE POLICY trending_movies_select_all ON trending_movies
  FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE: サービスロールのみ（Cron API経由）
