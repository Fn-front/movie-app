-- ============================================
-- accounts から未使用の OAuth トークン列を削除
-- ============================================
-- 背景:
-- accounts は NextAuth のアダプタ規約に沿った列構成だが、本アプリは JWT
-- セッション戦略でアダプタを使っておらず、signIn コールバックが手動で
-- 書き込むだけ。保存したトークンを読み出すコードは存在しない。
--
-- 用途のないクレデンシャルを平文で持ち続けると、DBバックアップの流出や
-- service_role キー漏洩時の被害面を無駄に広げる。refresh_token は特に、
-- アクセストークンの再発行に使えるため期限切れ後も影響が続く。
--
-- 将来プロバイダAPIを叩く機能（カレンダー連携等）が必要になった場合は、
-- その時点で暗号化付きで再導入する。

ALTER TABLE public.accounts
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS refresh_token,
  DROP COLUMN IF EXISTS id_token,
  -- トークン本体が無ければ意味を持たない付随情報も併せて削除する
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS token_type,
  DROP COLUMN IF EXISTS scope;

COMMENT ON TABLE public.accounts IS
  'OAuthプロバイダとユーザーのリンク情報のみを保持する。トークン類は 20261017020000 で削除済み（読み出す実装が無く、保持は漏洩時の被害面を広げるだけのため）。必要になったら暗号化付きで再導入すること。';
