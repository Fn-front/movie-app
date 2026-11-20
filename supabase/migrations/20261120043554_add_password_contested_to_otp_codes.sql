-- otp_codes に「このコードのパスワードは係争中か」を持たせる（#1325）
--
-- 背景:
--   `OTP_ACTION.REGISTRATION` 経由の昇格で、**第三者が仕込んだ
--   `password_hash` が残ったまま `is_verified` が立つ**経路があった。
--
--     1. 被害者が /auth/signup で登録 → is_verified=false / H(VictimPass)
--     2. 攻撃者が同じメールで register を1回叩く
--        → password_hash が H(AttackerPass) に上書きされ、未検証OTPが消える
--     3. 被害者の手元のコードは不一致 → 「再送」を押す
--     4. auth/otp/send は password_hash に触らない
--     5. 被害者が新コードを入力 → is_verified=true だけ立つ
--        → password_hash は H(AttackerPass) のまま
--     6. 攻撃者が victim@example.com / AttackerPass でログイン成功
--
-- ⛔ 「発行時の password_hash の指紋を持たせて、検証時に現在の値と
--    突き合わせる」案は**効かない**（実装しかけて判明）。
--
--    攻撃者の register 呼び出しは**それ自体が整合している** —— パスワードと
--    コードを同時に設定するので、「このコードの指紋」と「現在のパスワード」は
--    必ず一致する。再送が指紋を継承しても取り直しても、どちらも攻撃者の指紋に
--    なる。さらに被害者が受信箱で**新しいほうのメール**（攻撃者の register が
--    送ったコード）を使うと、再送を経由せずに同じ結末になる。
--
--    「どのパスワードと対になるコードか」は、**どちらの当事者がメールボックスの
--    持ち主か**を区別しない。サーバーから見て両者は対称で、観測できる差が無い。
--
-- 対応:
--   成立する規則は1つだけ ——
--   **未検証アカウントのパスワードが2回以上設定されたら、どちらが本人か
--   判定できない。だから残さない。**
--
--   `auth/register` の既存ユーザー分岐（＝未検証ユーザーの上書き）で発行した
--   コードに印を付け、再送はそれを引き継ぐ。`auth/otp/verify` の REGISTRATION
--   分岐は、印が付いていたら `password_hash` を NULL にして昇格させる。
--   失効は #1302 が LOGIN 経路で用意した仕組み（`sendPasswordInvalidatedEmail`
--   ＋ パスワード再設定への導線）をそのまま使う。
--
--   これは #1302 の判断（「未検証の間に設定されたパスワードは出自を区別する
--   手段が無いので、安全側に倒して一律で失効させる」）を REGISTRATION へ
--   広げるもので、整合する。
--
-- 緩和:
--   本人が自分で登録をやり直した場合も同じ分岐を通るため、何もしないと
--   入力したばかりのパスワードが消える。`bcrypt.compare` で
--   **同じパスワードでのやり直しは係争扱いにしない**（攻撃者は被害者の
--   パスワードを知らないので、安全性は落ちない）。
--
-- DEFAULT false の理由:
--   既存行と、通常の新規登録（INSERT 分岐）・パスワードを伴わない action
--   （login / password_change / two_factor）はすべて係争ではない。
--   移行期間中の行が false になることで、既存の利用者に影響しない。

ALTER TABLE otp_codes
  ADD COLUMN IF NOT EXISTS password_contested BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN otp_codes.password_contested IS
  'このコードに対応する users.password_hash が、他人の未検証登録を上書きして設定されたものか。REGISTRATION の検証時に true なら password_hash を NULL にして昇格させる（#1325）。再送（auth/otp/send）は直前のコードの値を引き継ぐ';
