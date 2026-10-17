-- ============================================
-- upsert_movie_cache RPC の追加（リバイバル作品の公開日を保護）
-- ============================================
-- 背景: movie_cache の同じ (id, 'theatrical') 行を複数の同期処理が書いており、
-- 日次の syncNowPlayingMovies が TMDb の原公開日で release_date を上書きしていた。
-- リバイバル上映作品は定義上「映画.comの上映日」と「TMDbの原公開日」が
-- 90日以上離れるため、is_revival=true のバッジは残ったまま公開日が
-- 数十年前になるという表示崩れが発生していた（本番DBで実際に発生）。
--
-- postgrest の upsert では列ごとの条件付き更新を表現できないため、
-- 「リバイバル行の release_date は映画.com側が持ち主」というルールを
-- DB側に置く。将来 theatrical 行を書く経路が増えても自動的に守られる。
--
-- トリガーでは実現できない: postgrest の upsert は payload の列だけを SET するが、
-- BEFORE UPDATE トリガーから見える NEW は「payload に無い列＝旧値」となるため、
-- 「送っていない」と「同じ値を送った」を区別できず、eiga 自身の更新まで止めてしまう。

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
    COALESCE((item->>'cached_at')::TIMESTAMP, now())
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
  'movie_cache への UPSERT。is_revival=true の行の release_date は上書きしない';
