-- ウォッチリストの作品の配信状況を追う
--
-- 背景:
--   movie_cache の配信情報は TMDb Discover 由来で、人気度と公開日ウィンドウで
--   絞られている。実測ではウォッチリストの未視聴26件のうち、movie_cache で
--   配信状況が分かるのは1件だけだった。ウォッチリストの作品を直接
--   問い合わせる置き場所が要る。
--
-- 作品単位で持つ理由:
--   同じ映画を複数ユーザーがウォッチリストに入れていても、TMDb への
--   問い合わせは1回で済む。ユーザーに紐づく情報は持たない。
--
-- rent と buy を paid にまとめる理由:
--   実測で「購入のみ」は0件。UI でも「レンタル」の一語で足り、
--   分けても表示に差が出ない。
--
-- since を消さない理由:
--   「配信終了をいつ確定させるか」を決めずに済ませるため。現在観られるかは
--   provider_ids が空かどうかで表し、since は並び順にだけ使う。
--   これにより TMDb のデータが1日欠けても、継続配信中の作品が
--   最上位へ再浮上しない。

CREATE TABLE IF NOT EXISTS public.movie_streaming_status (
  tmdb_movie_id INTEGER PRIMARY KEY,
  flatrate_provider_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  paid_provider_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  flatrate_since TIMESTAMPTZ,
  paid_since TIMESTAMPTZ,
  flatrate_last_seen_at TIMESTAMPTZ,
  paid_last_seen_at TIMESTAMPTZ,
  flatrate_resumed BOOLEAN NOT NULL DEFAULT FALSE,
  paid_resumed BOOLEAN NOT NULL DEFAULT FALSE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.movie_streaming_status IS
  'ウォッチリストの作品の日本での配信状況。作品単位で持ち、ユーザーには紐づかない。';
COMMENT ON COLUMN public.movie_streaming_status.flatrate_since IS
  '今の見放題期間がいつ始まったか。配信が見えなくなっても消さない（並び順に使う）。';
COMMENT ON COLUMN public.movie_streaming_status.flatrate_resumed IS
  '一度途切れたあとの再配信か。TRUE の作品は先頭グループの末尾へ送る。';

-- 配信中の作品を引くための部分インデックス。
-- JSONB の空配列判定はインデックスに乗らないため、部分インデックスの条件に置く
CREATE INDEX IF NOT EXISTS idx_movie_streaming_status_flatrate_since
  ON public.movie_streaming_status (flatrate_since DESC)
  WHERE flatrate_provider_ids <> '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_movie_streaming_status_paid_since
  ON public.movie_streaming_status (paid_since DESC)
  WHERE paid_provider_ids <> '[]'::jsonb;

-- --------------------------------------------
-- RLS と権限
-- --------------------------------------------
--
-- GRANT が無いと PostgREST は 42501 を返す（.claude/rules/supabase-db.md）。
-- 作品単位の情報でユーザーには紐づかないため、authenticated は読み取りのみ。
-- 書き込みは cron と API（service role）だけが行う。
-- anon には付与しない（未認証で見る画面にこの情報は出ない）。

ALTER TABLE public.movie_streaming_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY movie_streaming_status_select_authenticated
  ON public.movie_streaming_status
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.movie_streaming_status TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movie_streaming_status TO service_role;
