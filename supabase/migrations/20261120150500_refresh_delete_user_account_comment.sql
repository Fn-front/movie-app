-- delete_user_account の説明を実体に合わせる（#1359 の2回目レビュー / MIN-5）
--
-- ⚠️ #932 当時のコメントは「otp_codes は FK を持たないため明示的に消す」と
--   書いていたが、#1359 で `otp_codes.user_id`（ON DELETE CASCADE）を足した
--   ため半分しか当たらなくなった。いま明示的な DELETE が要るのは
--   **`user_id` が NULL の行**（登録前のコードなど）だけ。
--
--   関数の中身は変えない。説明だけを直す。

COMMENT ON FUNCTION public.delete_user_account(UUID) IS
  'アカウントを物理削除する。rate_limits は identifier が文字列（利用者ID / 生のメール / メール|IP / ユーザー名|IP）で FK に乗らないため4形態すべてを明示的に消す。otp_codes は user_id を持つ行だけ CASCADE で連鎖するので、NULL の行をメールアドレス一致で消す。戻り値は消した rate_limits の件数（#932 / #1359）';
