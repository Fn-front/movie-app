-- ============================================
-- movie_cache に日本の配信実態を表す列と複合インデックスを追加
-- ============================================
-- 背景: streaming タブは TMDb Discover の with_release_type=4（Digital）を
-- 叩くだけで、「日本で実際に配信されているか」は一切保証されていなかった。
-- TMDb の region=JP は release_date の解釈に効くだけで、配信可否は
-- /movie/{id}/watch/providers を見ないと分からない。
-- 結果として「配信終了作品が残る」「JP未配信作品が混入する」状態だった。
--
-- digital_release_date: TMDb の movie.release_date は作品につき実質1つで、
-- theatrical でも streaming でも同じ値が入る。劇場公開済みで配信開始がこれからの
-- 作品を「配信予定」として出すには、JP の Digital（type=4）公開日が別途必要。

ALTER TABLE public.movie_cache
  ADD COLUMN IF NOT EXISTS is_currently_streaming BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS digital_release_date DATE;

COMMENT ON COLUMN public.movie_cache.is_currently_streaming IS
  '日本で現在配信中か（TMDb watch/providers の results.JP に flatrate/rent/buy のいずれかが存在する）';
COMMENT ON COLUMN public.movie_cache.digital_release_date IS
  '日本のデジタル公開日（TMDb release_dates の iso_3166_1=JP かつ type=4 の最早日）';

-- ============================================
-- インデックス
-- ============================================
-- 一覧APIは release_type で絞り込んでから release_date / popularity で
-- 並べ替えてページングする（src/app/api/movies/route.ts）。単独インデックスでは
-- 絞り込みにしか効かず、並べ替えは別途ソートが走る。
-- キャッシュ鮮度チェックの `.eq('release_type',...).order('cached_at desc').limit(1)`
-- も同様に全行スキャン相当になるため、同じ形の複合インデックスを張る。
--
-- CREATE INDEX CONCURRENTLY は使えない。`supabase db push` はマイグレーションを
-- トランザクション内で実行するが、CONCURRENTLY はトランザクション内で実行できない。
-- movie_cache は数千行規模であり、通常の CREATE INDEX のロック時間は許容範囲。

CREATE INDEX IF NOT EXISTS movie_cache_release_type_release_date_idx
  ON public.movie_cache (release_type, release_date DESC);

CREATE INDEX IF NOT EXISTS movie_cache_release_type_popularity_idx
  ON public.movie_cache (release_type, popularity DESC);

CREATE INDEX IF NOT EXISTS movie_cache_release_type_cached_at_idx
  ON public.movie_cache (release_type, cached_at DESC);

-- 配信中の作品は全体の一部のため部分インデックスにする。
-- false 側（配信予定タブ）は digital_release_date 側の絞り込みが効くため含めない。
CREATE INDEX IF NOT EXISTS movie_cache_is_currently_streaming_idx
  ON public.movie_cache (is_currently_streaming)
  WHERE is_currently_streaming = TRUE;
