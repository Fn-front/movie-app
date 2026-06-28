-- OTP/認証系の naive TIMESTAMP を TIMESTAMPTZ に変換する
--
-- 背景:
--   これらのカラムは `timestamp without time zone`（naive）で、アプリは UTC の
--   ISO 文字列（toISOString / now()）で書き込む。PostgREST は naive 値を TZ なしで
--   返すため、サーバー（JST 等の非UTC環境）の `new Date(value)` がローカル時刻として
--   解釈し、実時刻が +9h ずれる。結果として OTP が即「期限切れ」、再送制限・
--   レート制限ロックが実質無効化される（本番/CI は UTC のため顕在化しない）。
--
-- 対応:
--   JS 側で `new Date()` 比較しているカラムを TIMESTAMPTZ 化する。既存値は UTC で
--   書き込まれているため `AT TIME ZONE 'UTC'` で正しく再解釈される。
--   DEFAULT now() はそのまま timestamptz に適合する。

ALTER TABLE otp_codes
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC',
  ALTER COLUMN verified_at TYPE TIMESTAMPTZ USING verified_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE users
  ALTER COLUMN password_changed_at TYPE TIMESTAMPTZ
  USING password_changed_at AT TIME ZONE 'UTC';

ALTER TABLE rate_limits
  ALTER COLUMN locked_until TYPE TIMESTAMPTZ
  USING locked_until AT TIME ZONE 'UTC';
