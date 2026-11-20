-- email_change のコードには必ず利用者を持たせる（#1359 の2回目レビュー / MIN-4）
--
-- ⚠️ **critical だった不変条件が、アプリ側の INSERT 1行にしか無かった。**
--
--   `20261120110337` で `otp_codes.user_id` を足したが NULL 許容のままで、
--   `email_change` だけが必須という条件はコードのコメントで担保していた。
--   `sendEmailChangeCode` の insert から `user_id` を落とすと、照合側は
--   `.eq('user_id', userId)` で誰にも一致しなくなって**コードが使えなくなる**
--   —— 失敗の出方が「確認コードが間違っています」なので、原因に辿り着けない。
--
--   他の用途（registration / login / password_change / two_factor）は利用者が
--   確定する前にも行を作るため NULL 許容のままにする。条件付き CHECK で
--   `email_change` だけを縛る。
--
-- ⚠️ 既存行への影響: `email_change` の行は #1359 の実装以降しか存在せず、
--   その実装は最初から `user_id` を入れている。NOT VALID は使わない。

ALTER TABLE public.otp_codes
  ADD CONSTRAINT chk_email_change_has_user
  CHECK (action_type <> 'email_change' OR user_id IS NOT NULL);

COMMENT ON CONSTRAINT chk_email_change_has_user ON public.otp_codes IS
  'email_change のコードは発行者と差し替え対象の一致確認に user_id を使う。NULL だと照合が成立しない（#1359）';
