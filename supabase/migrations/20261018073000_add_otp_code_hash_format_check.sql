-- otp_codes.code_hash に形式の CHECK を付ける（#698）
--
-- 削除した平文列 `code` には `chk_otp_code_format`（6桁数字）があったが、
-- `code_hash TEXT` には形式の縛りが無く、誤って平文を書き込む実装が復活しても
-- DB 側では気付けない。本Issueの趣旨は「無言で元に戻る事故を防ぐ」ことなので、
-- 列を落とすだけでなく形式でも縛る。
--
-- 値は HMAC-SHA256 を hex 化したもので、64桁の小文字16進に固定される
-- （src/lib/otp/hashOtpCode.ts の `.digest('hex')`）。
-- 6桁の平文も、別アルゴリズムのハッシュも、この制約を通らない。
--
-- 適用前に本番DBで確認した前提:
--   otp_codes 全件    = 3
--   64桁hex でない行  = 0

ALTER TABLE public.otp_codes
  DROP CONSTRAINT IF EXISTS chk_otp_code_hash_format;

ALTER TABLE public.otp_codes
  ADD CONSTRAINT chk_otp_code_hash_format
  CHECK (code_hash ~ '^[0-9a-f]{64}$');

COMMENT ON CONSTRAINT chk_otp_code_hash_format ON public.otp_codes IS
  'HMAC-SHA256 の hex（64桁小文字）のみを許可する。平文や別形式の書き込みをDB側で弾く（#698）。';
