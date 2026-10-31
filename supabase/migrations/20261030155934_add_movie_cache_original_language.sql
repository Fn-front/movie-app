-- movie_cache に original_language を追加する
--
-- 背景:
--   映画タブ・配信タブで韓国・中華圏・タイ/インドの作品を既定で非表示にし、
--   検索条件で切り替えられるようにしたい。
--
--   既存の言語フィルタ（ALLOWED_LANGUAGES / src/constants/movies.ts）は
--   保存時に弾くだけで、保存後の行からは原語が分からない。ユーザーが
--   切り替えられるようにするには、行ごとに原語を保存する必要がある。
--
--   原語コードをそのまま持ち、地域へのグルーピングはアプリ側の定数
--   （REGION_LANGUAGE_GROUPS）で行う。地域を列に持つと、グループ分けを
--   変えるたびにマイグレーションと全行バックフィルが必要になるため。
--
--   NULL は「未取得」を表す。読み取り側は NULL 行を常に結果に含める
--   （除外に倒すと、列追加直後に一覧が空になる）。

ALTER TABLE movie_cache
  ADD COLUMN IF NOT EXISTS original_language VARCHAR(10);

-- インデックスは作らない。
--   読み取り側の述語は `original_language IS NULL OR original_language NOT IN (...)`
--   という否定形で、かつ原語は数十種しかない低カーディナリティ列。B-tree は
--   選択されず、INSERT/UPDATE の書き込みコストだけが増える。
--   movie_cache は 1,142 行（2026-10-31 時点）でシーケンシャルスキャンでも
--   十分速い。行数が桁で増えたら EXPLAIN で再評価する。

COMMENT ON COLUMN movie_cache.original_language IS
  'TMDbの原語（ISO 639-1）。地域フィルタの絞り込みに使う。NULLは未取得を表し、除外対象にしない。';

-- --------------------------------------------
-- upsert_movie_cache に original_language を通す
-- --------------------------------------------
-- 20261019065404 の定義に original_language を足しただけ。他の列の扱い
-- （リバイバル行の release_date 保護、is_now_playing の条件付き更新、
-- is_revival の非更新）は変えていない。
CREATE OR REPLACE FUNCTION upsert_movie_cache(
  movies JSONB,
  set_now_playing BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  upserted_count INTEGER;
BEGIN
  INSERT INTO movie_cache (
    id, title, poster_path, backdrop_path, release_date, overview,
    vote_average, vote_count, popularity, genre_ids, release_type,
    original_language, is_now_playing, cached_at
  )
  SELECT
    (item->>'id')::INTEGER,
    item->>'title',
    item->>'poster_path',
    item->>'backdrop_path',
    CASE WHEN item->>'release_date' IS NOT NULL AND item->>'release_date' != ''
      THEN (item->>'release_date')::DATE
      ELSE NULL
    END,
    item->>'overview',
    (item->>'vote_average')::DECIMAL(3,1),
    COALESCE((item->>'vote_count')::INTEGER, 0),
    (item->>'popularity')::DECIMAL(10,3),
    item->'genre_ids',
    item->>'release_type',
    item->>'original_language',
    set_now_playing,
    COALESCE((item->>'cached_at')::TIMESTAMPTZ, now())
  FROM jsonb_array_elements(movies) AS item
  ON CONFLICT (id, release_type) DO UPDATE SET
    title = EXCLUDED.title,
    poster_path = EXCLUDED.poster_path,
    backdrop_path = EXCLUDED.backdrop_path,
    -- リバイバル行の公開日は映画.com側（syncEigaMovies）が持ち主。
    -- TMDbの原公開日で上書きしない。
    release_date = CASE
      WHEN movie_cache.is_revival THEN movie_cache.release_date
      ELSE EXCLUDED.release_date
    END,
    overview = EXCLUDED.overview,
    vote_average = EXCLUDED.vote_average,
    vote_count = EXCLUDED.vote_count,
    popularity = EXCLUDED.popularity,
    genre_ids = EXCLUDED.genre_ids,
    -- 原語は取得できたときだけ更新する。呼び出し側が渡し損ねても、
    -- 既にバックフィル済みの値を NULL で潰さない
    original_language = COALESCE(
      EXCLUDED.original_language,
      movie_cache.original_language
    ),
    -- is_now_playing は明示的に立てるときだけ更新する。
    -- Discover経由（set_now_playing=false）では既存のフラグを保持する。
    is_now_playing = CASE
      WHEN set_now_playing THEN TRUE
      ELSE movie_cache.is_now_playing
    END,
    cached_at = EXCLUDED.cached_at;
    -- is_revival は更新対象に含めない（eiga のみが持ち主のため既存値を保持）

  GET DIAGNOSTICS upserted_count = ROW_COUNT;

  RETURN upserted_count;
END;
$$;

COMMENT ON FUNCTION upsert_movie_cache(JSONB, BOOLEAN) IS
  'movie_cache への UPSERT。is_revival=true の行の release_date は上書きしない。original_language は NULL で既存値を潰さない。';

-- CREATE OR REPLACE は既存権限を保持するが、意図が読み取れるよう明示し直す
-- （.claude/rules/supabase-db.md）
REVOKE EXECUTE ON FUNCTION public.upsert_movie_cache(JSONB, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_movie_cache(JSONB, BOOLEAN)
  TO service_role;
