-- 二段階認証の設定に使う再認証コード（#1368）
--
-- ⛔ **第2要素はセッションだけで自己登録できた。**
--
--   `totp/setup` も `totp/enable` も `getAuthSession()` 以外に何も要求しない。
--   セッションを奪った第三者は
--
--     1. `POST /api/user/totp/setup {"method":"totp"}` で共有鍵を受け取る
--     2. `POST /api/user/totp/enable` に自分で計算した6桁を入れる
--
--   の2手で**被害者のアカウントに自分の第2要素を登録できる**。被害者には
--   メールが1通も届かない。
--
--   被害が退会（#1362）だけで済まないのは、登録された第2要素が
--   **乗っ取りの固定手段**になるため。被害者が後からパスワードを変えても
--   攻撃者の TOTP は残り、被害者は自分が設定していない第2要素を求められる。
--
-- ⚠️ パスワードを持つ利用者には現在のパスワードを要求すれば足りる。
--   **持たない利用者（OAuth のみ）には照合する材料が無い**ので、
--   登録アドレスへ使い捨てコードを送る（#1362 と同じ形）。
--
-- ⛔ **`OTP_ACTION` には足さない。** 足すと `/api/auth/otp/send` が受理し、
--   未認証のまま任意のアドレスへ自サービス名義のコードを送れる
--   （#641 / #1261 / #1359 / #1362）。
--
-- ⚠️ 既存の `two_factor` を流用しない。あちらは「第2要素そのもののコード」で、
--   こちらは「第2要素を**設定してよいか**の再認証」。件名・本文が同じになると
--   受信者が区別できず、#648 の設計が崩れる。

-- ---------------------------------------------------------------------------
-- 1. otp_codes に second_factor_setup を許可する
-- ---------------------------------------------------------------------------

ALTER TABLE otp_codes
  DROP CONSTRAINT IF EXISTS chk_otp_action_type;

ALTER TABLE otp_codes
  ADD CONSTRAINT chk_otp_action_type CHECK (
    action_type IN (
      -- OTP_ACTION（src/constants/otp.ts）＝公開ルートが受け付ける用途
      'registration',
      'password_change',
      -- 退役: メールOTPログイン（#1361）。保持期間内の既存行のために残す
      'login',
      -- 第2要素そのもののコード（src/constants/secondFactor.ts）
      'two_factor',
      -- メールアドレス変更（src/constants/emailChange.ts）
      'email_change',
      -- 退会（src/constants/accountDeleteCode.ts）
      'account_delete',
      -- 二段階認証の設定の再認証（src/constants/secondFactorSetupCode.ts）
      'second_factor_setup'
    )
  );

COMMENT ON CONSTRAINT chk_otp_action_type ON otp_codes IS
  'two_factor / email_change / account_delete / second_factor_setup は認証済みの経路専用で、公開ルート（/api/auth/otp/send, /verify）は受理しない。OTP_ACTION に足すと src/schema/otp.ts 経由で公開されるため足さないこと（#1261 / #1359 / #1362 / #1368）。login は #1361 で退役。';

-- ---------------------------------------------------------------------------
-- 2. 再認証コードは必ず利用者に紐づける
-- ---------------------------------------------------------------------------
-- ⛔ **#1359 の critical と同じ理由。** `user_id` が無いと、攻撃者が自分の
--   アカウントで取ったコードを奪った被害者のセッションで使える。設定対象は
--   セッションから決まるので、照合側に利用者が入っていないと意味を成さない。
--
-- ⚠️ 既存の `chk_account_delete_has_user`（#1362）には触らない。あちらは
--   `accountDeleteCodeMigration.test.ts` が制約名と本文を実走査で固定している。

ALTER TABLE otp_codes
  DROP CONSTRAINT IF EXISTS chk_second_factor_setup_has_user;

ALTER TABLE otp_codes
  ADD CONSTRAINT chk_second_factor_setup_has_user
  CHECK (action_type <> 'second_factor_setup' OR user_id IS NOT NULL);

COMMENT ON CONSTRAINT chk_second_factor_setup_has_user ON otp_codes IS
  'second_factor_setup は発行者と設定対象の一致確認に user_id を使う。NULL だと照合が成立しない（#1368）';

-- ---------------------------------------------------------------------------
-- 3. rate_limits に送信枠を足す
-- ---------------------------------------------------------------------------
-- ⚠️ `TOTP_SETTINGS_VERIFY`（設定変更の試行）とは別カウンタ。同じにすると、
--   コードを送り直すだけで設定の試行枠を食い尽くし、**正しいコードを
--   持っていても設定できなくなる**（#1359 / #1362 と同じ理由）。

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
      'account_delete_code_send',
      'second_factor_setup_code_send',
      'email_change_request',
      'email_change_verify',
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'rate_limits.action_type の許可リスト。src/constants/rateLimit.ts の RateLimitActionType と一致させること。漏れると該当の制限が無言で無効化される。';
