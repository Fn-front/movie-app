-- 確認コードを利用者に紐づける（#1359 のレビュー / critical）
--
-- ⛔ **コードの発行者と差し替え対象が一致している保証が無かった。**
--
--   `otp_codes` は `user_id` を持たず、`consumeEmailChangeCode` は
--   `(email, action_type, code_hash)` だけで照合していた。一方 confirm は
--   差し替え先を**セッション**から取る。つまり次が成立していた。
--
--     1. 攻撃者が**自分のアカウント**で変更をリクエストし、自分の受信箱で
--        コード C を受け取る（自分のパスワードは当然知っている）
--     2. 奪った**被害者のセッション**で confirm に C を投げる
--     3. 照合は通り、被害者のログイン識別子が攻撃者のアドレスになる
--
--   さらに `change_user_email` が旧アドレスの `otp_codes` を消すため、
--   被害者はパスワードリセットも使えず**自力の復旧経路を失う**。
--
--   「パスワード必須だからセッションだけでは変更できない」という本機能の
--   前提が丸ごと無効化されていた。
--
-- ---------------------------------------------------------------------------
-- 1. otp_codes に利用者を持たせる
-- ---------------------------------------------------------------------------
-- ⚠️ **NULL 許容にする。** 既存の用途（registration / login / password_change /
--   two_factor）は利用者が確定する前にも行を作るため、必須にできない。
--   `email_change` だけが必ず値を持つ。
--
-- ⚠️ FK は `ON DELETE CASCADE`。退会時の消し残り（#932 のレビューで
--   critical になった件）も、この列を持つ行については自動で連鎖する。
--   `delete_user_account` のメールアドレス一致による削除はそのまま残す
--   （`user_id` が NULL の行を消すのはあちらの役目）。

ALTER TABLE otp_codes
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.otp_codes.user_id IS
  'コードを要求した利用者。email_change では必須で、照合条件に含める（#1359）。他の用途は利用者が確定する前にも行を作るため NULL。';

-- 「この利用者のこの用途の最新行」を引くための索引
CREATE INDEX IF NOT EXISTS idx_otp_codes_user_action
  ON public.otp_codes (user_id, action_type, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. 差し替え時に「誰のアドレスを消すか」を取り違えない
-- ---------------------------------------------------------------------------
-- ⚠️ 関数自体は `p_user_id` をそのまま信用してよい。呼び出し側が
--   セッションの利用者IDしか渡さないことに加え、**コードの照合で
--   同じ利用者IDを要求する**ようになったため、ここへ到達する時点で
--   発行者と対象の一致が確認済みになる。
--
-- ⚠️ 変更前のアドレスを返す契約は維持する（旧アドレスへの通知に使う）。

COMMENT ON FUNCTION public.change_user_email(UUID, TEXT) IS
  'users.email を差し替え、旧アドレスの rate_limits / otp_codes を同じトランザクションで消す。戻り値は旧アドレス（通知に使う）。重複は users_email_key の 23505 で弾く。呼び出し側はコードの照合で発行者と対象の一致を確認してから呼ぶこと（#1359）';
