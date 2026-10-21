-- 配信サービス（JPのwatch providers）を movie_cache に保存する
--
-- 背景:
--   配信タブで「どのサービスで観られるか」による絞り込みができなかった。
--   syncStreamingMovies は watch/providers を既に取得しているが、
--   「どこかで配信されているか」の真偽値（is_currently_streaming）に畳んで
--   捨てていたため、プロバイダー単位の情報が残っていなかった。
--
-- 提供形態ごとに列を分ける理由:
--   {"flatrate":[8],"rent":[84]} のような入れ子で持つと、PostgREST での
--   絞り込みがネストしたJSONBへの containment になる。genre_ids が
--   `cs.[28]` で絞れているのと同じ形にしておけば確実に効く。
--   総件数クエリとデータクエリで条件がずれるとページング判定が壊れるため、
--   ここは確実に動く形を選ぶ。
--
--   形態を区別して持つのは、同じサービスでも見放題とレンタルで意味が違うため。
--   実測では U-NEXT は rent のみで flatrate がゼロ件であり、区別しないと
--   「加入していれば観られる」と誤解させる。
--
-- 既存行は次回の sync-streaming（毎日19:00）で埋まる。

ALTER TABLE public.movie_cache
  ADD COLUMN IF NOT EXISTS watch_provider_flatrate JSONB,
  ADD COLUMN IF NOT EXISTS watch_provider_rent JSONB,
  ADD COLUMN IF NOT EXISTS watch_provider_buy JSONB;

COMMENT ON COLUMN public.movie_cache.watch_provider_flatrate IS 'JPで見放題配信しているプロバイダーID配列（TMDb watch/providers の flatrate）';
COMMENT ON COLUMN public.movie_cache.watch_provider_rent IS 'JPでレンタル配信しているプロバイダーID配列（TMDb watch/providers の rent）';
COMMENT ON COLUMN public.movie_cache.watch_provider_buy IS 'JPで購入できるプロバイダーID配列（TMDb watch/providers の buy）';

-- containment（`@>`）での絞り込みに効かせる
CREATE INDEX IF NOT EXISTS idx_movie_cache_watch_provider_flatrate
  ON public.movie_cache USING GIN (watch_provider_flatrate);
CREATE INDEX IF NOT EXISTS idx_movie_cache_watch_provider_rent
  ON public.movie_cache USING GIN (watch_provider_rent);
CREATE INDEX IF NOT EXISTS idx_movie_cache_watch_provider_buy
  ON public.movie_cache USING GIN (watch_provider_buy);
