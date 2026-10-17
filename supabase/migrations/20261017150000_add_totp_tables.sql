-- TOTP（二段階認証）用テーブルの作成
--
-- 既存の user_settings には置かない。user_settings は authenticated に
-- SELECT を付与しており、ログイン済みの第三者が RLS をすり抜ける経路が
-- 1つでも生まれると共有鍵が読めてしまう。二段階認証の資格情報は
-- 「サーバー（service_role）だけが触れる」境界に置く。
--
-- したがって以下の2テーブルには anon / authenticated への GRANT を
-- 一切与えない。Data API（supabase-js / PostgREST）からは到達できず、
-- サーバー側のルートハンドラ経由でのみ読み書きする。

-- --------------------------------------------
-- user_totp（TOTP 共有鍵）
-- --------------------------------------------
-- 1ユーザー1件。user_id を主キーにして「2つ登録されている」状態を作れなくする。
CREATE TABLE user_totp (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- AES-256-GCM で暗号化した共有鍵（`iv:authTag:暗号文`、いずれも base64）。
  -- TOTP はハッシュ化できない（検証のたびに鍵そのものが要る）ため、
  -- 復号可能な形で持たざるを得ない。鍵は環境変数側にあるので、
  -- DB だけが漏れても復号できない。
  encrypted_secret TEXT NOT NULL,
  -- 利用者が初回コードを入力して所持確認が取れた日時。
  -- NULL の間は「設定途中」で、二段階認証としては無効。
  -- QRを表示しただけで有効化してしまうと、認証アプリに登録し損ねた利用者が
  -- ログインできなくなる。
  confirmed_at TIMESTAMPTZ,
  -- 最後に検証を通した時間ステップ（RFC 6238 のカウンタ値）。
  -- 同じコードの使い回しを拒否するために使う。コードは30秒間有効なので、
  -- これが無いと盗み見られたコードをその間なんどでも使える。
  last_used_counter BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Data API には公開しない。サーバー側からのみ読み書きする。
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_totp TO service_role;

ALTER TABLE user_totp ENABLE ROW LEVEL SECURITY;

-- ポリシーを1つも作らない = service_role 以外は全拒否。
-- GRANT が無いので到達もしないが、将来 GRANT が誤って追加された場合の
-- 二重の歯止めになる。

COMMENT ON TABLE user_totp IS 'TOTP（二段階認証）の共有鍵。Data APIには公開せず、service_role 経由でのみ扱う';
COMMENT ON COLUMN user_totp.encrypted_secret IS 'AES-256-GCM で暗号化した共有鍵。形式は iv:authTag:暗号文（base64）';
COMMENT ON COLUMN user_totp.confirmed_at IS '初回コードの入力で所持確認が取れた日時。NULL は設定途中で、二段階認証は無効';
COMMENT ON COLUMN user_totp.last_used_counter IS '最後に検証を通した時間ステップ。同じコードの使い回しを拒否するために使う';

-- --------------------------------------------
-- totp_recovery_codes（リカバリーコード）
-- --------------------------------------------
-- 認証アプリを失った利用者の復旧手段。使い捨て。
CREATE TABLE totp_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- HMAC-SHA256（サーバー側の鍵付き）。平文は発行時に一度だけ利用者へ見せる。
  -- コードは約48bitの乱数なので、bcrypt のようなストレッチより
  -- 「鍵が無ければ照合できない」ことのほうが効く。
  code_hash TEXT NOT NULL,
  -- 使用済みの日時。行を消さずに残すのは、利用者が
  -- 「残り何個か」を確認できるようにするため。
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.totp_recovery_codes TO service_role;

-- 同じユーザーに同じコードが2つ存在しないようにする
CREATE UNIQUE INDEX uq_totp_recovery_codes_user_hash
  ON totp_recovery_codes (user_id, code_hash);

-- 照合時に「そのユーザーの未使用コード」を引く
CREATE INDEX idx_totp_recovery_codes_user_unused
  ON totp_recovery_codes (user_id)
  WHERE used_at IS NULL;

ALTER TABLE totp_recovery_codes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE totp_recovery_codes IS 'TOTP のリカバリーコード。Data APIには公開せず、service_role 経由でのみ扱う';
COMMENT ON COLUMN totp_recovery_codes.code_hash IS 'HMAC-SHA256（サーバー側の鍵付き）。平文は発行時の一度しか見せない';
COMMENT ON COLUMN totp_recovery_codes.used_at IS '使用済みの日時。残数を表示するため行は消さない';

-- --------------------------------------------
-- updated_at の自動更新
-- --------------------------------------------
-- 既存テーブルと同じく update_updated_at_column() を使う。
CREATE TRIGGER update_user_totp_updated_at
  BEFORE UPDATE ON user_totp
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
