-- 二段階認証の第2要素を選択制にする（#1261）
--
-- ⚠️ テーブルはリネームしない。`getSecondFactorMethod`（src/lib/auth/secondFactor.ts）は
-- 二段階認証を設定していない利用者も含め**全ログインで呼ばれ**、DBエラーで意図的に
-- throw する（fail-closed。null に倒すと第2要素が飛んだセッションが7日間発行される）。
-- このプロジェクトはDBが1つしかなく、スキーマ変更をリモートへ先行適用するしかないため、
-- `ALTER TABLE user_totp RENAME TO ...` は旧コードが動いている本番DBに先に当たる。
-- 適用からデプロイ完了までの間、from('user_totp') が 42P01 を返して
-- パスワード・メール・OAuth の全経路でログインできなくなる。
--
-- ENUM も作らない。既存マイグレーションに CREATE TYPE は0件で、
-- 区分値はすべて VARCHAR + CHECK（chk_user_role 等）で表現している。
-- ENUM にすると ALTER TYPE ... ADD VALUE が同一トランザクション内で使えず、
-- 型への USAGE 権限も既定privileges の対象外になる。

-- --------------------------------------------
-- user_totp.method
-- --------------------------------------------
ALTER TABLE user_totp
  ADD COLUMN method VARCHAR(20) NOT NULL DEFAULT 'totp';

-- メールOTP に共有鍵は無い
ALTER TABLE user_totp
  ALTER COLUMN encrypted_secret DROP NOT NULL;

ALTER TABLE user_totp
  ADD CONSTRAINT chk_second_factor_method
    CHECK (method IN ('totp', 'email_otp'));

-- method と共有鍵の有無を一致させる。
-- totp に鍵が無いと検証できず、email_otp に鍵があると実態と食い違う。
-- 既存行はすべて method='totp' × encrypted_secret NOT NULL なので全件通る。
ALTER TABLE user_totp
  ADD CONSTRAINT chk_secret_matches_method CHECK (
    (method = 'totp'      AND encrypted_secret IS NOT NULL)
 OR (method = 'email_otp' AND encrypted_secret IS NULL)
  );

COMMENT ON TABLE user_totp IS
  '二段階認証の設定。1ユーザー1件（user_id が主キー）なので方式は排他になる。method=totp なら encrypted_secret に共有鍵、email_otp ならコードは otp_codes（action_type=two_factor）側に持つ。Data APIには公開せず service_role 経由でのみ扱う。※ 名前は TOTP 専用だった頃の名残。リネームすると旧コードが動いている間ログインが全滅するため据え置いている（#1261）';

COMMENT ON COLUMN user_totp.method IS
  '第2要素の方式。totp=認証アプリ（RFC 6238）/ email_otp=メールのワンタイムコード';

COMMENT ON COLUMN user_totp.encrypted_secret IS
  'AES-256-GCM で暗号化した共有鍵。形式は iv:authTag:暗号文（base64）。method=email_otp のときは NULL';

COMMENT ON COLUMN user_totp.last_used_counter IS
  '最後に検証を通した時間ステップ。同じコードの使い回しを拒否するために使う。method=email_otp では使わない（消費は otp_codes 行の削除で表す）';

-- --------------------------------------------
-- otp_codes.action_type に two_factor を足す
-- --------------------------------------------
-- ⚠️ src/constants/secondFactor.ts の TWO_FACTOR_OTP_ACTION と一致させること。
--
-- OTP_ACTION（src/constants/otp.ts）には**足さない**。src/schema/otp.ts が
-- そこから公開ルートの zod enum を導出しているため、足すと
-- /api/auth/otp/send と /api/auth/otp/verify が two_factor を受理する。
-- send の action 分岐は宛先固定を password_change のときしか行わないので、
-- 未認証のまま任意のアドレスへ自サービス名義の確認コードを送れるようになる（#641）。
--
-- 現行は 20260312000000_phase8_auth_tables.sql:84 の3値のみ（以後の再定義なし）。
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
      'two_factor'
    )
  );

COMMENT ON CONSTRAINT chk_otp_action_type ON otp_codes IS
  'two_factor は第2要素専用で、公開ルート（/api/auth/otp/send, /verify）は受理しない。OTP_ACTION に足すと src/schema/otp.ts 経由で公開されるため足さないこと（#1261）。';

-- --------------------------------------------
-- rate_limits.chk_action_type に two_factor_send を足す
-- --------------------------------------------
-- ⚠️ 許可リストは src/constants/rateLimit.ts の RateLimitActionType と
-- 必ず一致させること。漏れるとその制限が無言で無効化される（#546 / #659）。
--
-- DROP → ADD で全量を再定義する方式のため、既存の値を1つでも落とすと
-- その制限が壊れる。追加するときは必ず既存の全値を書き写すこと。
-- 以下は 20261106095759 の35値に two_factor_send を足した36値。
ALTER TABLE rate_limits
  DROP CONSTRAINT IF EXISTS chk_action_type;

ALTER TABLE rate_limits
  ADD CONSTRAINT chk_action_type CHECK (
    action_type IN (
      -- OTP_ACTION（src/constants/otp.ts）
      'registration',
      'login',
      'password_change',
      -- RATE_LIMIT_ACTION（src/constants/rateLimit.ts）
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
      -- 公開映画API（20261018052254 で追加）
      'read_api_movies',
      'search_api_movies',
      'read_api_movie_detail',
      'read_api_genres',
      -- 認証必須API（20261018052953 で追加）
      'write_api_filters',
      'read_api_user_data',
      -- 人物詳細API（20261020100000 で追加）
      'read_api_person_detail',
      -- 管理者発行アカウント（20261030120000 で追加）
      'admin_account_issue',
      -- 受賞作品の手動同期（20261031093154 で追加）
      'admin_award_sync',
      'admin_award_sync_status',
      -- 二段階認証の設定変更（20261106095759 で追加）
      'totp_settings_verify',
      -- admin ルートのロール確認（20261106095759 で追加）
      'admin_role_check',
      -- 第2要素コードのメール送信（本マイグレーションで追加 / #1261）
      'two_factor_send',
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'src/constants/rateLimit.ts の RateLimitActionType と必ず一致させること。許可リストから漏れると該当の制限が無言で無効化される（#546 / #659）。';
