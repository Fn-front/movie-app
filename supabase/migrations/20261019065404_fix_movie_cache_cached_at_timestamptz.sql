-- movie_cache.cached_at を TIMESTAMPTZ に変換する
--
-- 背景:
--   20260628111105（OTP/認証系）と 20261019012324（rate_limits.last_attempt_at）で
--   naive TIMESTAMP を TIMESTAMPTZ 化したが、movie_cache は対象から漏れていた。
--
--   naive 値は PostgREST が TZ サフィックス無し（2026-10-19T01:00:00）で返すため、
--   JS の `new Date()` がローカル時刻として解釈する。JST のアプリサーバーでは
--   実時刻より9時間古く見え、src/app/api/movies/route.ts のキャッシュ鮮度判定で
--   経過時間が実際より9時間長く計算される（#763）。
--
--   CACHE_DURATION_HOURS = 6（theatrical / upcoming）はこのずれだけで常に超過し、
--   一覧を開くたびに TMDb Discover が走る。
--   NOW_PLAYING_CACHE_DURATION_HOURS = 24 は常時失効にはならないが、
--   有効期間が実質15時間に縮む。
--   本番/CI は UTC のため顕在化しない。
--
-- 対応:
--   既存値は UTC の壁時計で書き込まれている（アプリは toISOString() を渡し、
--   upsert_movie_cache は ::TIMESTAMP でキャストして TZ を落としていた）ため、
--   `AT TIME ZONE 'UTC'` で正しく再解釈される。DEFAULT now() はそのまま適合する。
--
--   movie_cache の RLS ポリシーは movie_cache_select_all（USING (true)）のみで
--   対象カラムを参照していないため、#268 の型変更エラーは起きない。

ALTER TABLE movie_cache
  ALTER COLUMN cached_at TYPE TIMESTAMPTZ
  USING cached_at AT TIME ZONE 'UTC';

COMMENT ON COLUMN movie_cache.cached_at IS
  'キャッシュ取得時刻。src/app/api/movies/route.ts が JS 側で new Date() 比較するため TIMESTAMPTZ 必須（naive に戻すと非UTC環境でキャッシュが早期失効する）。';

-- --------------------------------------------
-- upsert_movie_cache のキャストを TIMESTAMPTZ に揃える
-- --------------------------------------------
-- アプリは cached_at に `toISOString()`（例: 2026-10-19T01:00:00.000Z）を渡す。
-- ::TIMESTAMP だと Z が落ち、セッションのタイムゾーン次第で解釈が変わる。
-- ::TIMESTAMPTZ ならオフセットを尊重するため、セッション設定に依存しない。
--
-- 変更はこの1行のみ。他の列の扱い（リバイバル行の release_date 保護、
-- is_now_playing の条件付き更新、is_revival の非更新）は 20261017032342 のまま。
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
    is_now_playing, cached_at
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
  'movie_cache への UPSERT。is_revival=true の行の release_date は上書きしない。cached_at はオフセット付きで受け取る（#763）。';

-- CREATE OR REPLACE は既存権限を保持するが、意図が読み取れるよう明示し直す
-- （.claude/rules/supabase-db.md）。20261018042537 と同じ内容。
REVOKE EXECUTE ON FUNCTION public.upsert_movie_cache(JSONB, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_movie_cache(JSONB, BOOLEAN)
  TO service_role;
