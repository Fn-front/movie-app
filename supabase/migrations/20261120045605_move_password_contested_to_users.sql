-- 係争中の印を otp_codes から users へ移す（#1325）
--
-- 直前のマイグレーション（20261120043554）で `otp_codes.password_contested` を
-- 足したが、**レビューで2つの穴が実測された**ので置き場所を変える。
--
-- ## 穴1: 同じ register を2回送るだけで印が消える（critical）
--
--   `auth/register` の既存ユーザー分岐は「同じパスワードでのやり直しなら
--   係争にしない」を `bcrypt.compare(password, existingUser.password_hash)` で
--   判定していた。ところが比較相手は**直前に誰かが設定したハッシュ**であって
--   「本人が設定したパスワード」ではない。
--
--     1. 被害者が登録 → H(VictimPass)
--     2. 攻撃者が register{AttackerPass} → compare=false → 係争 true
--     3. 攻撃者が **同じリクエストをもう一度** → compare(AttackerPass,
--        H(AttackerPass))=true → 係争 **false**。しかも既存ユーザー分岐は
--        未検証OTP行を DELETE してから INSERT するので、印の付いた行ごと消える
--     4. 被害者が検証を終える → 攻撃者のパスワードが残る（#1325 が再成立）
--
--   攻撃者は被害者のパスワードを一切知らなくてよく、手順3は手順2の
--   完全なリプレイ。レート制限にも当たらない（3通 < 5通/日）。
--
-- ## 穴2: 引き継ぎ元の行が無いと印が落ちる（fail-open）
--
--   `auth/otp/send` の `recentOtp?.password_contested ?? false` は、行が
--   無ければ「係争なし」に倒れる。`register` のメール送信失敗ロールバックは
--   未検証OTP行を全削除しつつ `users` 行は残すので、**攻撃者のハッシュが
--   載ったまま印だけ消えた**状態を作れる。
--
-- ## 対応
--
--   印は**パスワードの属性**であって、コードの属性ではなかった。
--   `users` に置けば、
--
--   - 一度立った印は、昇格かパスワード再設定まで消えない（穴1が閉じる）
--   - OTP行の有無と無関係になる（穴2が閉じる）
--   - `auth/otp/send` の引き継ぎロジックそのものが要らなくなる
--
--   `register` の既存ユーザー分岐では **OR で畳む**:
--     新しい値 = 既存の印 || (パスワードが違う)
--   これで同一パスワードのリプレイでは落ちない。
--
--   印を下ろすのは2箇所だけ。
--   - `auth/otp/verify` の REGISTRATION 分岐（昇格と同時に password_hash を
--     NULL にしたうえで下ろす）
--   - `auth/password-reset/confirm`（メールボックス所有を証明したうえで
--     本人がパスワードを設定し直したため）

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_contested BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.password_contested IS
  '現在の password_hash が、他人の未検証登録を上書きして設定されたものか（#1325）。REGISTRATION の検証で true なら password_hash を NULL にして昇格させる。昇格時とパスワード再設定時に false へ戻す';

-- 置き場所を変えたので旧列は落とす。#1348 はまだ main に入っていないため、
-- この列を読むコードは本番に存在しない
ALTER TABLE otp_codes
  DROP COLUMN IF EXISTS password_contested;
