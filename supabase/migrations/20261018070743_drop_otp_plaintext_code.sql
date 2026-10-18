-- otp_codes.code（平文のOTPコード列）を削除する（#698）
--
-- #640（PR #693）で OTPコードを HMAC-SHA256 + pepper に移行した際、
-- デプロイ順序に関わらず壊れないよう `code` を NULL 可にして残していた。
-- アプリは `code_hash` のみを読み書きしており、この列はもう使われていない。
--
-- 平文を保存できる列が残っていること自体が #640 で塞いだ経路なので、
-- 不要になった時点で落とす。残したままだと、将来 `code` に書き込む実装が
-- 復活しても気付けない（#546 / #659 のような「無言で元に戻る」事故）。
--
-- 適用前に本番DBで確認した前提:
--   otp_codes 全件               = 4
--   code IS NOT NULL（平文あり） = 0
--   code_hash IS NULL            = 0
--
-- ⚠️ デプロイ順序: 列の削除は不可逆で、切り戻せない。
-- `code` に INSERT する旧実装へ戻すと OTP 発行が全て失敗する。
-- 必ず「新実装（code_hash のみ）をデプロイ → 本マイグレーション適用」の順で行う。

ALTER TABLE public.otp_codes DROP COLUMN IF EXISTS code;

-- NOT NULL を付ける前に、ハッシュを持たない行を落とす。
--
-- 事前確認では0件だったが、確認と適用の間に1件でも入ると ALTER が失敗し、
-- DROP COLUMN だけ適用された中途半端な状態になる。
-- code_hash が無いOTPはそもそも照合できず、10分で期限切れになる使い捨ての行なので
-- 消して差し支えない。
DELETE FROM public.otp_codes WHERE code_hash IS NULL;

-- 全レコードがハッシュを持っている状態になったので NOT NULL を付ける。
-- 「ハッシュが無い行」を作れなくなり、照合できないOTPが生まれる余地が消える。
ALTER TABLE public.otp_codes ALTER COLUMN code_hash SET NOT NULL;

COMMENT ON COLUMN public.otp_codes.code_hash IS
  'OTPコードの HMAC-SHA256（鍵は OTP_HASH_PEPPER）。平文は保存しない（#640 / #698）。';
