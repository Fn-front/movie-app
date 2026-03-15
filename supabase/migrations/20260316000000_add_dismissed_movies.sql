-- dismissed_movies テーブル作成
-- ユーザーが「興味なし」とした映画を管理
-- レコメンド精度向上のためジャンル傾向分析に使用

CREATE TABLE dismissed_movies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_movie_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  genre_ids INTEGER[] NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

-- インデックス
CREATE UNIQUE INDEX uq_dismissed_movies_user_movie
  ON dismissed_movies (user_id, tmdb_movie_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_dismissed_movies_user_id
  ON dismissed_movies (user_id);

-- RLS有効化
ALTER TABLE dismissed_movies ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
CREATE POLICY "dismissed_movies_select_own"
  ON dismissed_movies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "dismissed_movies_insert_own"
  ON dismissed_movies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "dismissed_movies_update_own"
  ON dismissed_movies FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "dismissed_movies_delete_own"
  ON dismissed_movies FOR DELETE
  USING (auth.uid() = user_id);
