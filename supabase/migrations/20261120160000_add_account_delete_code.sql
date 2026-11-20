-- 退会の確認コード（#1362）
--
-- ⛔ **パスワードも第2要素も持たない利用者には、再確認が1つも掛かっていなかった。**
--
--   `DELETE /api/user`（#932）は「持っている人にだけ」照合を要求する。
--   OAuth のみで登録し二段階認証を設定していない層は照合する材料が無いため、
--   **セッションだけで2クリックでアカウントが消える**。取り消しできない操作
--   なので、セッションを奪われた時点でデータを失う。
--
--   登録アドレスへ使い捨てコードを送り、受信箱の所持を再確認する。
--
-- ⚠️ 入力確認フレーズ（"delete" と打たせる等）では代わりにならない。
--   誤操作にしか効かず、セッションを持つ攻撃者は同じ文字列を打てる。

-- ---------------------------------------------------------------------------
-- 1. otp_codes に account_delete を許可する
-- ---------------------------------------------------------------------------
-- ⛔ **`OTP_ACTION`（src/constants/otp.ts）には足さない。** 足すと
--   `src/schema/otp.ts` の `PUBLIC_OTP_ACTIONS` 経由で `/api/auth/otp/send` が
--   受理する。あちらは宛先をセッションに固定する処理を `password_change` の
--   ときしか行わないため、**未認証のまま任意のアドレスへ自サービス名義の
--   確認コードを送れる**（#641 / #1261 / #1359 と同じ穴）。
--
-- ⚠️ 既存の `two_factor` を流用しない。件名・本文が「二段階認証」になり、
--   用途を明記して読み上げ型のソーシャルエンジニアリングを防ぐ設計（#648）が
--   崩れる。届いたコードが何のためのものか受信者に判断させない。

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
      -- 第2要素（src/constants/secondFactor.ts）。公開ルートからは到達しない
      'two_factor',
      -- メールアドレス変更（src/constants/emailChange.ts）。同上
      'email_change',
      -- 退会（src/constants/accountDeleteCode.ts）。同上
      'account_delete'
    )
  );

COMMENT ON CONSTRAINT chk_otp_action_type ON otp_codes IS
  'two_factor / email_change / account_delete は認証済みの経路専用で、公開ルート（/api/auth/otp/send, /verify）は受理しない。OTP_ACTION に足すと src/schema/otp.ts 経由で公開されるため足さないこと（#1261 / #1359 / #1362）。login は #1361 で退役。';

-- ---------------------------------------------------------------------------
-- 2. 退会コードは必ず利用者に紐づける
-- ---------------------------------------------------------------------------
-- ⛔ **#1359 と同じ理由。** `user_id` が無いと、攻撃者が自分のアカウントで
--   取ったコードを、奪った被害者のセッションで使えてしまう。削除対象は
--   セッションから決まるので、照合側に利用者が入っていないと意味を成さない。

-- ⚠️ `chk_email_change_has_user`（#1359）には触らない。あちらは不変条件テスト
--   （`emailChangeMigration.test.ts`）が制約名と本文を実走査で固定している。
--   同じ形の制約をもう1つ足す。

-- ⚠️ 同ファイルの他2つに合わせて冪等にする。新規環境（ローカル / CI）で
--   作り直すときに落ちないため。適用済みの本番では最終状態が変わらない
ALTER TABLE otp_codes
  DROP CONSTRAINT IF EXISTS chk_account_delete_has_user;

ALTER TABLE otp_codes
  ADD CONSTRAINT chk_account_delete_has_user
  CHECK (action_type <> 'account_delete' OR user_id IS NOT NULL);

COMMENT ON CONSTRAINT chk_account_delete_has_user ON otp_codes IS
  'account_delete は発行者と削除対象の一致確認に user_id を使う。NULL だと照合が成立しない（#1362）';

-- ---------------------------------------------------------------------------
-- 3. rate_limits に送信枠を足す
-- ---------------------------------------------------------------------------
-- ⚠️ 既存の `account_delete`（削除の試行）とは別カウンタ。同じにすると、
--   コードを送り直すだけで削除の試行枠を食い尽くし、**正しいコードを
--   持っていても消せなくなる**（#1359 で送信枠と検証枠を分けたのと同じ理由）。

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
      'email_change_request',
      'email_change_verify',
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'rate_limits.action_type の許可リスト。src/constants/rateLimit.ts の RateLimitActionType と一致させること。漏れると該当の制限が無言で無効化される。';
