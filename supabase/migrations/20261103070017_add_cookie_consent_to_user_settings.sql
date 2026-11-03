-- Cookie同意の状態・日時・版を保持する
--
-- 背景:
--   GA4 導入（#892）にあたりオプトインの同意UIを入れる（#893 で決定）。
--   同意は localStorage を正とするが、端末間で揃えることと証跡を残すことを
--   目的に、ログイン中はこのテーブルにも保存する。
--
-- user_settings に置く理由:
--   theme / notification_enabled / streaming_notice_scope と同じテーブルで、
--   service_role への GRANT が既にある（20261018053616）。テーブル単位の
--   GRANT は後から足した列にも及ぶため、ここでの GRANT 追加は不要。
--   なお本アプリは NextAuth を使い Supabase Auth を使わないので auth.uid() は
--   常に NULL であり、20260310000000 の RLS ポリシーは実質機能していない。
--   読み書きが通るのは service_role が RLS をバイパスするため。
--
-- cookie_consent_at を updated_at と別に持つ理由:
--   updated_at はテーマ変更など他の設定更新でも動くため、同意の証跡に使えない。
--
-- TIMESTAMPTZ にする理由:
--   この列はクライアントが申告した時刻が端末とサーバーの間を往復する。
--   naive TIMESTAMP だと PostgREST がオフセット無しで返し、JS の new Date() が
--   ローカル時刻として解釈するため往復のたびにずれる（#160 / 20261101095646）。
--   同テーブルの created_at / updated_at が TIMESTAMP なのは #160 の取りこぼしで、
--   踏襲すべき先例ではない。

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS cookie_consent TEXT NOT NULL DEFAULT 'unset';

-- 列側を IF NOT EXISTS にしている以上、制約側も再適用で落ちないようにする。
-- ADD CONSTRAINT には IF NOT EXISTS が無いため、先に落としてから足す
ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS chk_user_settings_cookie_consent;

ALTER TABLE public.user_settings
  ADD CONSTRAINT chk_user_settings_cookie_consent
    CHECK (cookie_consent IN ('unset', 'granted', 'denied'));

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS cookie_consent_at TIMESTAMPTZ;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS cookie_consent_version SMALLINT;

-- 未決定なのに同意日時が入っている行を作れないようにする。
-- 逆向き（granted だが日時が NULL）は許す。クライアントが送る時刻が
-- パース不能だった場合に NULL へ倒して状態だけ保存するため
ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS chk_user_settings_cookie_consent_at;

ALTER TABLE public.user_settings
  ADD CONSTRAINT chk_user_settings_cookie_consent_at
    CHECK (cookie_consent <> 'unset' OR cookie_consent_at IS NULL);

COMMENT ON COLUMN public.user_settings.cookie_consent IS
  'アクセス解析Cookieへの同意状態。unset = 未決定、granted = 同意、denied = 拒否。localStorage を正とし、ログイン中のみ同期される。';

COMMENT ON COLUMN public.user_settings.cookie_consent_at IS
  '最初に同意／撤回した日時。クライアントが申告した値であり、改ざん不能な証跡ではない。状態が変わらない更新では上書きしない。';

COMMENT ON COLUMN public.user_settings.cookie_consent_version IS
  '同意した時点のポリシー版。サーバーが書く（クライアントからは送らせない）。現行版より古い記録は未決定として扱いバナーを再表示するが、記録自体は消さない。';
