-- movie_streaming_status の制約・コメント・インデックスを整える
--
-- 直前のマイグレーションで作ったテーブルに対し、レビューで出た4点を直す。
-- まだ誰も使っていないテーブルだが、履歴を保つため DROP せず ALTER で足す。

-- --------------------------------------------
-- 1. 主キーの方針を明示する
-- --------------------------------------------
--
-- /db-schema の規約（UUID主キー・論理削除）から外れている。
-- tmdb_movie_id を主キーにするのは、TMDb ID が外部で安定した自然キーであり、
-- 1作品1行で上書きし続ける設計（履歴を残さない）のため。
-- 論理削除を持たないのも同じ理由で、ウォッチリストから外れた作品の行は
-- 残っていても害が無く、再び追加されたときそのまま使える。

COMMENT ON COLUMN public.movie_streaming_status.tmdb_movie_id IS
  'TMDbの映画ID。外部で安定した自然キーのため、UUIDではなくこれを主キーにする。';

-- --------------------------------------------
-- 2. JSONB が配列であることを型レベルで保証する
-- --------------------------------------------
--
-- 部分インデックスの条件 `<> '[]'::jsonb` は、'null'::jsonb やオブジェクトも
-- 「空でない」と判定してしまう。書き込むのは cron だけで必ず配列を入れるが、
-- 将来の誤用で「配信中」の判定が静かに壊れるのを防ぐ。
--
-- INTEGER[] に変えない理由: 既存の movie_cache.watch_provider_flatrate が
-- JSONB で揃えてあり、片方だけ型を変えると扱いが分かれるため。

ALTER TABLE public.movie_streaming_status
  ADD CONSTRAINT chk_movie_streaming_status_flatrate_is_array
    CHECK (jsonb_typeof(flatrate_provider_ids) = 'array'),
  ADD CONSTRAINT chk_movie_streaming_status_paid_is_array
    CHECK (jsonb_typeof(paid_provider_ids) = 'array');

-- --------------------------------------------
-- 3. 残りの列にコメントを付ける
-- --------------------------------------------
--
-- last_seen_at と checked_at は紛らわしいので違いを明記する。

COMMENT ON COLUMN public.movie_streaming_status.paid_since IS
  '今のレンタル・購入期間がいつ始まったか。配信が見えなくなっても消さない（並び順に使う）。';
COMMENT ON COLUMN public.movie_streaming_status.paid_resumed IS
  '一度途切れたあとの再配信か。TRUE の作品は先頭グループの末尾へ送る。';
COMMENT ON COLUMN public.movie_streaming_status.flatrate_last_seen_at IS
  '最後に見放題を「確認できた」日時。checked_at と違い、配信が無かった回では進まない。再配信の判定に使う。';
COMMENT ON COLUMN public.movie_streaming_status.paid_last_seen_at IS
  '最後にレンタル・購入を「確認できた」日時。checked_at と違い、配信が無かった回では進まない。';
COMMENT ON COLUMN public.movie_streaming_status.checked_at IS
  '最後にTMDbへ「問い合わせた」日時。配信の有無にかかわらず毎回進む。last_seen_at とは別物。';
COMMENT ON COLUMN public.movie_streaming_status.flatrate_provider_ids IS
  'JPで見放題配信しているプロバイダーID配列（代表IDへ正規化済み）。空なら今は観られない。';
COMMENT ON COLUMN public.movie_streaming_status.paid_provider_ids IS
  'JPでレンタル・購入できるプロバイダーID配列（代表IDへ正規化済み）。空なら今は観られない。';

-- --------------------------------------------
-- 4. インデックスの NULLS 順序を並び順に合わせる
-- --------------------------------------------
--
-- DESC の既定は NULLS FIRST。一覧の ORDER BY は since の新しい順で
-- NULLS LAST を使うため、揃えないとインデックスが使われない。

DROP INDEX IF EXISTS idx_movie_streaming_status_flatrate_since;
DROP INDEX IF EXISTS idx_movie_streaming_status_paid_since;

CREATE INDEX IF NOT EXISTS idx_movie_streaming_status_flatrate_since
  ON public.movie_streaming_status (flatrate_since DESC NULLS LAST)
  WHERE flatrate_provider_ids <> '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_movie_streaming_status_paid_since
  ON public.movie_streaming_status (paid_since DESC NULLS LAST)
  WHERE paid_provider_ids <> '[]'::jsonb;
