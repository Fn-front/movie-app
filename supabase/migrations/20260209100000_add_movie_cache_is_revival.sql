-- is_revivalカラムを追加（リバイバル上映フラグ）
ALTER TABLE movie_cache ADD COLUMN is_revival BOOLEAN NOT NULL DEFAULT false;
