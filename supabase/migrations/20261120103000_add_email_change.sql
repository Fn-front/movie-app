-- メールアドレスの自己変更（#1359）
--
-- 背景:
--   アドレスは**ログイン識別子そのもの**なのに変更する手段が無かった。
--   会社・学校のアドレスで登録した人が退職・卒業すると詰む。回避策は
--   「退会して作り直す」しかないが、#932 まで退会機能も無かった。
--
-- ---------------------------------------------------------------------------
-- 1. otp_codes の用途に email_change を足す
-- ---------------------------------------------------------------------------
-- ⛔ **OTP_ACTION（src/constants/otp.ts）には足さない。**
--
--   `src/schema/otp.ts` の `PUBLIC_OTP_ACTIONS` へ入ると
--   `/api/auth/otp/send` と `/api/auth/otp/verify` が受理する。あちらの
--   action 分岐は宛先をセッションに固定する処理を `password_change` の
--   ときしか行わないため、**未認証のまま任意のアドレスへ自サービス名義の
--   確認コードを送れる**状態になる（#641 / #1261）。
--
--   とくにこの用途は**宛先がまだ本人のものでないアドレス**なので、
--   公開されたときの被害が第2要素より大きい。
--   送信は src/lib/auth/sendEmailChangeCode.ts からだけ行う。

ALTER TABLE otp_codes
  DROP CONSTRAINT IF EXISTS chk_otp_action_type;

ALTER TABLE otp_codes
  ADD CONSTRAINT chk_otp_action_type CHECK (
    action_type IN (
      -- OTP_ACTION（src/constants/otp.ts）＝公開ルートが受け付ける用途
      'registration',
      'login',
      'password_change',
      -- 第2要素（src/constants/secondFactor.ts）。公開ルートからは到達しない
      'two_factor',
      -- メールアドレス変更（src/constants/emailChange.ts）。同上
      'email_change'
    )
  );

COMMENT ON CONSTRAINT chk_otp_action_type ON otp_codes IS
  'two_factor / email_change は認証済みの経路専用で、公開ルート（/api/auth/otp/send, /verify）は受理しない。OTP_ACTION に足すと src/schema/otp.ts 経由で公開されるため足さないこと（#1261 / #1359）。';

-- ---------------------------------------------------------------------------
-- 2. chk_action_type に email_change_request を追加する
-- ---------------------------------------------------------------------------
-- ⚠️ 許可リストは src/constants/rateLimit.ts の RateLimitActionType と
-- 必ず一致させること。漏れるとその制限が無言で無効化される（#546 / #659 で2度発生）。
-- DROP → ADD で全量を再定義する方式のため、既存の値を1つでも落とすと
-- その制限が壊れる。本ファイルの値は**直前の適用済み定義（20261120093701）を
-- そのまま引き継いで**1値だけ足している。

ALTER TABLE rate_limits
  DROP CONSTRAINT IF EXISTS chk_action_type;

ALTER TABLE rate_limits
  ADD CONSTRAINT chk_action_type CHECK (
    action_type IN (
      'registration',
      'login',
      'password_change',
      'write_api_favorites',
      'write_api_watchlist',
      'write_api_dismissed_movies',
      'write_api_profile',
      'write_api_settings',
      'read_api_theaters',
      'read_api_theater_detail',
      'awards_fetch',
      'suggest_title',
      'register',
      'change_password',
      'recommendation_refresh',
      'write_api_recommendation_events',
      'login_ip',
      'otp_send_daily',
      'otp_verify',
      'totp_verify',
      'password_reset_request',
      'password_reset_confirm',
      'read_api_movies',
      'search_api_movies',
      'read_api_movie_detail',
      'read_api_genres',
      'write_api_filters',
      'read_api_user_data',
      'read_api_person_detail',
      'admin_account_issue',
      'admin_award_sync',
      'admin_award_sync_status',
      'totp_settings_verify',
      'admin_role_check',
      'two_factor_send',
      'register_ip',
      'otp_verify_ip',
      'password_reset_request_ip',
      'otp_send_ip',
      'cron_failure_notice',
      'account_delete',
      'email_change_request',
      'email_change_verify',
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'rate_limits.action_type の許可リスト。src/constants/rateLimit.ts の RateLimitActionType と一致させること。漏れると該当の制限が無言で無効化される。';

-- ---------------------------------------------------------------------------
-- 3. アドレスの差し替え本体
-- ---------------------------------------------------------------------------
-- ⚠️ **旧アドレスの跡を同じトランザクションで消す。**
--
--   `rate_limits` の識別子はメールアドレスそのもの（otp_send_daily /
--   password_reset_request）か `メールアドレス|IP`（ログイン系）。
--   残すと**古いアドレスの行が永久に残り、新しいアドレスは枠0から始まる**。
--
--   `otp_codes` も `email` 列で引くので、旧アドレス宛の未使用コードが
--   宙に浮く。期限切れを待たず消す。
--
-- ⚠️ `LIKE` を使わない理由は #932 と同じ。メールアドレスには `_` や `%` が
--   入りうるため、パターンとして解釈されると**他人の行まで消す**。
--
-- ⚠️ 重複は `users_email_key`（UNIQUE）が 23505 で弾く。ここで事前チェック
--   しないのは、確認と UPDATE の間に別の利用者が同じアドレスを取る余地を
--   残さないため。呼び出し側が 23505 を利用者向けの文言へ変換する。

CREATE OR REPLACE FUNCTION public.change_user_email(
  p_user_id UUID,
  p_new_email TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_email TEXT;
BEGIN
  SELECT email INTO v_old_email
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_old_email IS NULL THEN
    RAISE EXCEPTION 'user not found: %', p_user_id
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE users
  SET email = p_new_email
  WHERE id = p_user_id;

  DELETE FROM rate_limits
  WHERE identifier = v_old_email
     OR starts_with(identifier, v_old_email || '|');

  DELETE FROM otp_codes
  WHERE email = v_old_email;

  -- 旧アドレスへ通知を送るために返す
  RETURN v_old_email;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_user_email(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_user_email(UUID, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.change_user_email(UUID, TEXT) IS
  'users.email を差し替え、旧アドレスの rate_limits / otp_codes を同じトランザクションで消す。戻り値は旧アドレス（通知に使う）。重複は users_email_key の 23505 で弾く（#1359）';
