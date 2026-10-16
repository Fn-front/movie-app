-- ============================================
-- OTP検証済みトークンの導入
-- ============================================
-- 背景:
-- OTPログインの最終ステップ（NextAuth credentials の signIn）が秘密情報を持たず、
-- 「検証済みの証明」が otp_codes の行（キーはメールアドレスのみ）に委ねられていた。
-- そのため、被害者が OTP 検証を完了した直後の最大5分間、メールアドレスを知って
-- いるだけの第三者が signIn を叩いてそのアカウントにログインできた。
--
-- 対策:
-- 検証成功時に推測不能なワンタイムトークン（256bit）を発行し、その SHA-256 ハッシュ
-- のみを保存する。以降の「検証済み」判定はメールアドレスではなく、このトークン
-- ハッシュの一致で行う。トークンを持たない第三者は該当行を特定すらできない。
--
-- `code` 列（平文のOTPコード）のハッシュ化は別Issue（#640）のスコープ。

ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS verification_token_hash TEXT;

-- トークンハッシュによる検索をインデックスで引く。
-- UNIQUE にすることで、万一ハッシュが衝突・重複登録された場合に DB 側で弾く。
-- 未検証行は NULL のため、部分インデックスで NULL を除外する。
CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_codes_verification_token_hash
  ON public.otp_codes (verification_token_hash)
  WHERE verification_token_hash IS NOT NULL;

COMMENT ON COLUMN public.otp_codes.verification_token_hash IS
  'OTP検証成功時に発行するワンタイムトークンの SHA-256 ハッシュ（hex）。平文トークンはレスポンスで一度だけ返し、DBには保存しない。login / password_change の本人確認はこの値の一致で行う（メールアドレスでは行わない）。';

-- 既存の検証済み行はトークンを持たないため、そのままでは新ロジックで認証できない。
-- 有効期限は最大5分であり、移行時点で有効な行は実質ゼロに近い。残っていても
-- 利用者は再送信で復帰できるため、混乱を避けるために削除する。
DELETE FROM public.otp_codes WHERE verified_at IS NOT NULL;
