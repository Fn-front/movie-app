-- password_reset_tokens テーブルの再作成（#709）
--
-- 初期スキーマ（20260202000000_initial_schema.sql:68）に存在したが、
-- 20260312000000_phase8_auth_tables.sql:119 で削除されていた。以降、パスワードを
-- 忘れた利用者はメールOTP単独ログインで事実上の復旧をしていた。
--
-- #642 Part 2 でその経路を二段階認証の有効なユーザーに対して塞いだため、
-- リセット導線が無いとパスワードを忘れた時点でロックアウトになる。
-- リカバリーコードは TOTP の代替であってパスワードの代替ではない。
--
-- 旧実装との違い:
-- - トークンを**平文で保存しない**。256bit の乱数を SHA-256 でハッシュ化して
--   保存し、照合はハッシュ値での検索で行う（src/lib/otp/verificationToken.ts と
--   同じ方式。256bit の乱数なのでストレッチは不要）
-- - anon / authenticated への GRANT を明示的に剥奪する。旧実装は
--   `FOR INSERT WITH CHECK (true)` の公開ポリシーを持っていた

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- トークンの SHA-256（hex）。平文はメールのリンクにだけ載り、DBには残らない
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  -- 使用済みの日時。行を消さずに残すのは、使い回しを「見つからない」ではなく
  -- 「使用済み」として判定できるようにするため
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Data API には公開しない。サーバー側（service_role）からのみ読み書きする。
-- ⚠️ 既存プロジェクトは public スキーマのテーブルに anon / authenticated への
-- デフォルトGRANTが付く。明示的に剥奪しない限り残る（20261017160000 で踏んだ）。
REVOKE ALL ON public.password_reset_tokens FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_tokens TO service_role;

-- 照合はハッシュ値の一致で行う。一意にすることで衝突の取り違えも防ぐ
CREATE UNIQUE INDEX uq_password_reset_tokens_token_hash
  ON password_reset_tokens (token_hash);

-- 発行時に同一ユーザーの未使用トークンを無効化する用途
CREATE INDEX idx_password_reset_tokens_user_unused
  ON password_reset_tokens (user_id)
  WHERE used_at IS NULL;

-- 期限切れレコードの定期削除で使う
CREATE INDEX idx_password_reset_tokens_expires_at
  ON password_reset_tokens (expires_at);

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- ポリシーを1つも作らない = service_role 以外は全拒否。
-- GRANT の剥奪と合わせて二重の歯止めにする。

COMMENT ON TABLE password_reset_tokens IS 'パスワードリセットのワンタイムトークン。service_role 専用。anon / authenticated への GRANT は剥奪済み';
COMMENT ON COLUMN password_reset_tokens.token_hash IS 'トークンの SHA-256（hex）。平文はメールのリンクにのみ載せDBには保存しない';
COMMENT ON COLUMN password_reset_tokens.used_at IS '使用済みの日時。使い回しを「使用済み」として判定するため行は消さない';

-- --------------------------------------------
-- chk_action_type にリセット用のアクションを追加
-- --------------------------------------------
-- ⚠️ 許可リストは src/constants/rateLimit.ts の RateLimitActionType と
-- 必ず一致させること。漏れるとその制限が無言で無効化される（#546 / #659）。

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
      'otp_send_daily',
      'otp_verify',
      'login_ip',
      'totp_verify',
      'password_reset_request',  -- 本マイグレーションで追加（#709）
      'password_reset_confirm',  -- 本マイグレーションで追加（#709）
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'src/constants/rateLimit.ts の RateLimitActionType と必ず一致させること。許可リストから漏れると該当の制限が無言で無効化される（#546 / #659）。';
