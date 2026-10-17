-- ============================================
-- otp_codes.code のハッシュ化（code_hash 列の追加）
-- ============================================
-- 背景: OTPコードを平文で保存していたため、DBのバックアップ流出や
-- service_role キー漏洩が起きると、有効期限内のコードでそのままログイン・
-- パスワード変更ができた（#640）。password_hash はハッシュ化しているのに
-- 同等の認証材料であるOTPが平文なのは一貫性を欠く。
--
-- 保存するのは HMAC-SHA256（鍵 = 環境変数 OTP_HASH_PEPPER、
-- メッセージ = "email:code"）。素の SHA-256 では6桁＝100万通りを1秒未満で
-- 全列挙できてしまい平文保存とほぼ変わらないため、DBの外に鍵を置く。
--
-- ■ このマイグレーションは additive（追加のみ）にしてある
--   code 列を今すぐ落とすと、デプロイ前の旧コード（code に書き込む）が
--   動かなくなる。順序に関わらず壊れないよう、
--     - code_hash を追加（NULL 可）
--     - code を NULL 可にし、6桁数字の CHECK を外す
--   とすることで、旧コード（code を書く）も新コード（code_hash を書く）も
--   並行して動作できる。
--   code 列の削除は、デプロイ完了を確認してから別マイグレーションで行う。

ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS code_hash TEXT;

-- 新コードは code を書かないため NOT NULL を外す
ALTER TABLE public.otp_codes
  ALTER COLUMN code DROP NOT NULL;

-- code が NULL になりうるため、6桁数字を強制する CHECK を外す
ALTER TABLE public.otp_codes
  DROP CONSTRAINT IF EXISTS chk_otp_code_format;

-- 検証は code_hash の完全一致で引く
CREATE INDEX IF NOT EXISTS idx_otp_codes_code_hash
  ON public.otp_codes (code_hash)
  WHERE code_hash IS NOT NULL;

COMMENT ON COLUMN public.otp_codes.code_hash IS
  'OTPコードの HMAC-SHA256（鍵は環境変数 OTP_HASH_PEPPER、メッセージは "email:code"）。6桁は低エントロピーのため、鍵をDBの外に置かないと総当たりで復元される。';

COMMENT ON COLUMN public.otp_codes.code IS
  '非推奨。平文のOTPコード（#640 で廃止）。移行期間の互換のために残しているだけで、新規レコードでは常に NULL。デプロイ完了後に別マイグレーションで削除する。';

-- 平文が残っている既存レコードは、移行後の新ロジックでは検証できない。
-- 有効期限は最大10分であり、利用者は再送信で復帰できるため削除する。
DELETE FROM public.otp_codes WHERE code IS NOT NULL;
