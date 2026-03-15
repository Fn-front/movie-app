-- dismissed_moviesテーブルにposter_pathカラムを追加
-- 設定ページの興味なし一覧でポスターサムネイルを表示するために使用

ALTER TABLE dismissed_movies
  ADD COLUMN poster_path VARCHAR(255) NULL;
