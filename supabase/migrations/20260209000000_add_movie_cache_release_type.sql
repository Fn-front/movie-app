-- release_typeカラムを追加
ALTER TABLE movie_cache ADD COLUMN release_type VARCHAR(20) NOT NULL DEFAULT 'theatrical';

-- 主キーを(id, release_type)の複合キーに変更
-- （同じ映画が劇場公開・ストリーミング両方に存在可能にする）
ALTER TABLE movie_cache DROP CONSTRAINT movie_cache_pkey;
ALTER TABLE movie_cache ADD PRIMARY KEY (id, release_type);

-- release_typeフィルタリング用インデックス
CREATE INDEX IF NOT EXISTS idx_movie_cache_release_type ON movie_cache(release_type);
