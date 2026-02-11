-- is_now_playingカラムを追加（TMDb now_playingリスト掲載フラグ）
ALTER TABLE movie_cache ADD COLUMN is_now_playing BOOLEAN NOT NULL DEFAULT false;

-- is_now_playingフィルタ用インデックス
CREATE INDEX IF NOT EXISTS idx_movie_cache_is_now_playing ON movie_cache(is_now_playing);
