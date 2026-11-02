-- ウォッチリストで「配信中」とみなす範囲をユーザーごとに持つ
--
-- 背景:
--   配信開始の優先表示（#899）で、見放題だけを対象にするか
--   レンタル・購入も含めるかは好みが分かれる。実測では未視聴26件のうち
--   見放題10件・レンタルのみ5件で、どちらの設定でも実用になる。
--
-- 初期値を any にする理由:
--   バッジで「見放題」「レンタル」を区別して見せるため、含めても誤解させない。
--   「観ようと思えば今日観られる」作品が全部手前に来る方が目的に合う。
--
-- users ではなく user_settings に置く理由:
--   theme / notification_enabled と同じテーブルで、RLS と user_id ごとの
--   ポリシーが既にある。列を足すだけで保存の仕組みが揃う。

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS streaming_notice_scope TEXT NOT NULL DEFAULT 'any';

-- 列側を IF NOT EXISTS にしている以上、制約側も再適用で落ちないようにする。
-- ADD CONSTRAINT には IF NOT EXISTS が無いため、先に落としてから足す
ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS chk_user_settings_streaming_notice_scope;

ALTER TABLE public.user_settings
  ADD CONSTRAINT chk_user_settings_streaming_notice_scope
    CHECK (streaming_notice_scope IN ('any', 'flatrate'));

COMMENT ON COLUMN public.user_settings.streaming_notice_scope IS
  'ウォッチリストで「配信中」とみなす範囲。any = 見放題/レンタル/購入のいずれか、flatrate = 見放題のみ。';
