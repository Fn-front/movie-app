-- dismissed_movies に傾向学習用のカラムを追加
--
-- 「興味なし」から学習できるのは genre_ids だけで、監督・テーマ・年代の
-- 傾向は捨てられていた。レコメンド生成プロンプトでこれらを「避けるべき傾向」
-- として渡せるようにする。
--
-- keywords は ID ではなく名称で保持する。用途がAIプロンプトへの提示であり、
-- ID（例: 155477）のままではモデルが解釈できないため。
--
-- 既存レコードは収集前なのですべて NULL。以降の dismiss で埋まっていく。

ALTER TABLE dismissed_movies
  ADD COLUMN keywords TEXT[] NULL,
  ADD COLUMN director_name VARCHAR(255) NULL,
  ADD COLUMN release_year INTEGER NULL;

COMMENT ON COLUMN dismissed_movies.keywords IS 'TMDbキーワード名の配列。傾向分析用。収集できなかった場合はNULL';
COMMENT ON COLUMN dismissed_movies.director_name IS '監督名。傾向分析用。収集できなかった場合はNULL';
COMMENT ON COLUMN dismissed_movies.release_year IS '公開年。年代傾向の分析用。収集できなかった場合はNULL';
