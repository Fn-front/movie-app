# 二段階認証の第2要素を選択制にする

作成日: 2026-11-18
ベース: `46e454cc`
Issue: #1261

## 概要

二段階認証の第2要素を、現在の TOTP 固定から **TOTP / メールOTP のどちらかをユーザーが選ぶ**方式に変える。

認証アプリの導入を負担に感じる利用者に、第2要素そのものを諦めさせない選択肢を用意することが目的。

## 決定事項

| 論点 | 決定 |
|---|---|
| 排他性 | **どちらか1つだけ**。両方の同時登録はしない |
| データモデル | `user_totp` をリネームして `method` 列を足す（主キーが排他性を保証） |
| メール送信の上限 | 専用カウンタ `two_factor_send` を新設（20通/日・ユーザー単位） |
| リカバリーコード | **方式を問わず発行**する |
| パスワードレスOTPログイン | 方式によらず**引き続き塞ぐ**（後述） |
| 既存ユーザー | `method` の既定値 `'totp'` で現状維持。移行作業なし |

### パスワードレスOTPログインを塞ぎ続ける理由

`auth.ts:170` は、二段階認証が有効なユーザーに対して「メールでログイン」経路を
`OTP_LOGIN_DISABLED` で拒否している（#642）。第2要素がメールOTPになってもこれは変えない。

- パスワードレスOTPログイン = 「メールのコードのみ」
- 第2要素がメールOTP = 「パスワード + メールのコード」

後者のほうが確実に強い。両方を開けると前者が実効強度を決めてしまうため、
「最も弱い経路が全体の強度を決める」という #642 の判断がそのまま当てはまる。

## 承知のうえで受け入れるリスク

**メールOTPを選んだアカウントの実効強度は受信箱と同等になる。**

パスワード再設定（`/auth/forgot-password`）が同じ受信箱を通るため、受信箱を奪取した
攻撃者はパスワードをリセットしたうえで第2要素も突破できる。つまりメールOTPは
「受信箱とは独立した第2の要素」にはなっていない。

これは単なる一般論ではない。`src/app/api/auth/password-reset/confirm/route.ts:219` は
**第2要素に意図的に触れない**設計になっており、コメントで理由をこう述べている。

> 二段階認証（user_totp）には触れない。解除してしまうと、メール受信箱を
> 押さえただけで第2要素を外せることになり、#642 が塞いだ穴が別経路で開く

方式にメールOTPを選ぶことは、**そのコードが塞いでいる穴を利用者自身の選択で開ける**
ことに等しい。リセット経路は「第2要素を外せない」ままだが、外す必要がなくなる。

実装では解消できない。選択制にする以上、設定画面で以下を明示したうえで利用者の
判断に委ねる。

- 認証アプリのほうが安全であること
- メールOTPを選ぶと、メールアカウントを奪われた場合にこのアカウントも奪われること

なお TOTP を選んだ利用者の強度は現行から一切変わらない。本変更は
**既存ユーザーの安全性を下げない**（`method` の既定は `'totp'`）。

---

## 1. データモデル

マイグレーション1本で、リネーム・`method` 列・許可リストの追加をまとめる。

```sql
CREATE TYPE second_factor_method AS ENUM ('totp', 'email_otp');

ALTER TABLE user_totp RENAME TO user_second_factor;
ALTER TABLE user_second_factor
  ADD COLUMN method second_factor_method NOT NULL DEFAULT 'totp',
  ALTER COLUMN encrypted_secret DROP NOT NULL,
  ADD CONSTRAINT chk_secret_matches_method CHECK (
    (method = 'totp'      AND encrypted_secret IS NOT NULL)
 OR (method = 'email_otp' AND encrypted_secret IS NULL));

ALTER TABLE totp_recovery_codes RENAME TO second_factor_recovery_codes;
```

- `user_id` が主キーのままなので、**「どちらか1つだけ」はDBが保証する**。アプリ側の
  整合チェックは要らない
- `confirmed_at` の意味（NULL なら設定途中で無効）は両方式で変わらない
- `last_used_counter` は TOTP でのみ使う。メールOTP では使い回しの拒否を
  `otp_codes` 行の削除で行うため、列としては NULL のまま
- リネームにより、トリガー・インデックス・GRANT・RLS は自動で追従する。再定義は不要

### 許可リストを2本とも更新する

`action_type` の許可リストがDB側にもあり、**漏れるとその制限が無言で無効化される**
（`20261018000000` のコメントに #546 / #659 で2度発生したと記録がある）。

| テーブル | 制約 | 追加する値 |
|---|---|---|
| `otp_codes` | `chk_otp_action_type` | `'two_factor'` |
| `rate_limits` | `chk_action_type` | `'two_factor_send'` |

対応する TS 側の定数（`OTP_ACTION` / `RATE_LIMIT_ACTION`）も同時に更新する。

### 第2要素のコードの置き場

`otp_codes` を `action_type = 'two_factor'` で再利用する。新しいテーブルは作らない。

`code_hash` は `HMAC(code, email)`（`20261017050000` / `src/lib/otp/hashOtpCode.ts`）なので、
宛先をセッション由来のアドレスに固定すれば既存の仕組みがそのまま効く。
有効期限10分・試行5回（`chk_otp_attempts`）も既存の制約を流用する。

---

## 2. 送信は認証コールバックの中だけに置く

**第2要素のメール送信を公開ルートに生やさない。** これが本設計の中心。

`/api/auth/otp/send` に `two_factor` を足すと、アカウントを1つ持つだけで任意のアドレスへ
自サービス名義の「確認コード」メールを送れてしまう。#641 でパスワード変更について
同じ穴を塞いだ経緯があり、同じ轍を踏まない。

| 経路 | 送信する場所 | 識別子の出どころ |
|---|---|---|
| パスワードログイン | `authorize` 内。パスワード照合の**後** | `user.id` |
| OAuth ログイン | `jwt` コールバック（`trigger === 'update'`） | `token.id` |
| 設定画面での有効化 | `/api/user/two-factor/setup` | セッション |

再送も同じ経路を通す。**第2要素のコードを送れる公開エンドポイントは1つも増やさない**
（設定画面の `setup` は既存ルートのリネームで、セッション必須かつ宛先が本人固定）。

- ログイン画面の「再送」= コードを空のままフォームを再送信（パスワードは state に
  保持済み）。`authorize` はコード未指定のときだけ送信する
- `/auth/two-factor` の「再送」= `update({ resend: true })` で `jwt` コールバックへ

### レート制限の位置

`two_factor_send`（20通/日・ユーザー単位）は `.claude/rules/api-route.md` の**例外2**
（守る資源がメールボックスで、そこへ到達するのが検証の後）に当たる。
**送信の直前**に置き、1通も送らないパスで枠を減らさない。

既存の `otp_send_daily`（5通/日）とはカウンタを分ける。共有すると「1日5回ログインしたら
パスワードリセットのメールが送れない」状態になる。`TOTP_VERIFY` をログインと設定で
分けた #940 と同じ発想。

再送間隔は既存の `OTP_CONFIG.RESEND_INTERVAL_SECONDS`（60秒）を流用する。

---

## 3. 検証層

### 公開インターフェースの変更

`src/lib/auth/totpVerification.ts` を `src/lib/auth/secondFactor.ts` にリネームする。

```ts
// 変更前
isTotpEnabled(supabase, userId): Promise<boolean>

// 変更後
getSecondFactorMethod(supabase, userId): Promise<SecondFactorMethod | null>
```

呼び出し側3か所（`auth.ts:170` / `auth.ts:274` / `auth.ts:575`）と
`helpers/totpGuard.ts:89` をこれ経由にする。`totpGuard.ts` は
`helpers/secondFactorGuard.ts` にリネームする。

**DBエラーを握り潰さない現行方針は維持する。** `totpVerification.ts:71-83` の
長いコメントが述べるとおり、`null` に倒すと第2要素が飛んだセッションが7日間発行される。
方式が増えてもこの危険は変わらないので、`throw toDbError(...)` のままにする。

### 検証の分岐

`verifySecondFactor()` を入口のまま保ち、内部で分岐させる。

```
verifySecondFactor(supabase, userId, code)
  ├ リカバリーコード形式  → verifyRecoveryCode（方式に依存しない。変更なし）
  ├ method = 'totp'      → verifyAuthenticatorCode（変更なし）
  └ method = 'email_otp' → verifyEmailOtpCode（新規）
```

`verifyEmailOtpCode` は `otp_codes` の `action_type='two_factor'` 行と照合する。
既存の `verifyAuthenticatorCode` / `verifyRecoveryCode` と同じく、
**条件付きUPDATE（または DELETE）の更新行数で消費を判定**し、同じコードの同時2回投入で
両方通ることを防ぐ。

`TOTP_VERIFY_RESULT` は `SECOND_FACTOR_VERIFY_RESULT` にリネームする。値
（`SUCCESS` / `INVALID` / `REUSED` / `NOT_ENABLED`）は変えない。

### 触らないもの

`src/lib/totp/*`（RFC 6238 の計算・暗号化・リカバリーコード生成）は名前も責務も
正しいので変更しない。

---

## 4. 画面

### 設定画面（`features/settings/twoFactorSettings/`）

`TWO_FACTOR_VIEW.DISABLED` に方式の選択を1段挟む。

```
DISABLED ─┬→ [TOTP を選択]      → SETUP（QR + 初回コード）  ─┐
          └→ [メールOTP を選択] → SETUP_EMAIL（コード入力）  ─┴→ RECOVERY_CODES → ENABLED
```

- メールOTP の「有効にする」でサーバーがコードを送信し、入力して確定
- どちらの方式でも、有効化の成功でリカバリーコードを一度だけ平文表示する
  （`useTwoFactorSettings.ts:149` の既存の扱いを踏襲）
- `ENABLED` 画面には現在の方式を表示する
- **方式の切り替えは「一度無効化してから再度有効化」**。無効化は現行どおり
  現方式のコード（またはリカバリーコード）を要求する。切り替え専用の経路は作らない

### ログイン画面（`features/auth/loginForm/`）

`authorize` が投げるエラーコードを2つに分ける。

| コード | クライアントの表示 |
|---|---|
| `TOTP_REQUIRED` | 「認証アプリのコード」。現行どおり |
| `EMAIL_OTP_REQUIRED` | 「メールに送ったコード」＋ 再送ボタン＋60秒カウントダウン |

「パスワードが正しいときだけ入力欄を出す」という現行の作法（`loginForm.tsx:70` 付近の
コメント）は維持する。パスワードを知らない相手に、そのアカウントが二段階認証を
使っているかを教えないため。方式の違いも同様に、パスワード照合後にしか露出しない。

### OAuth の第2要素画面（`app/auth/two-factor/`）

`totpPending` のセッションでコードを入力する現行フローは変えない。メールOTP の場合のみ、
画面の表示を変え、再送ボタンを足す。検証は引き続き `jwt` コールバック側で行う
（クライアントから渡せるのは入力されたコードだけで、「検証済み」という結果は渡せない）。

この画面の唯一の出口がログアウトである点（#1161）も変えない。

---

## 5. エラー処理

### メール送信の失敗を「コードが違う」に化けさせない

`SECOND_FACTOR_SEND_FAILED` を新設し、送信そのものが成立しなかった場合に返す。
`TOTP_UNAVAILABLE`（#1148）と同じ発想で、「打ち直しても直らない失敗」を
「コードが違う」と区別する。区別しないと、利用者は正しいコードを繰り返し打ち続ける。

Resend のドメイン検証が未実測である（所有者以外へ届くか確認できていない）ため、
ここが実運用で最初に詰まる場所になる可能性が高い。

### 検証失敗の内訳は引き続き区別しない

不正 / 期限切れ / 使い回し / 試行上限を利用者に区別して見せない。
区別するとコードを総当たりする側に手がかりを与える
（`useTwoFactorChallenge.ts:100` の現行判断を踏襲）。

---

## 6. テスト

### 単体

対象ファイルと同階層に `<filename>.test.ts(x)` で配置。カバレッジは全指標80%以上。

`.claude/rules/testing.md` の観点チェックリストのうち、本機能で該当するもの:

- [ ] 正常系（方式ごとのログイン / 有効化 / 無効化）
- [ ] 入力バリデーション（桁数不正、空）
- [ ] 認証・認可（未認証での設定変更、他人のユーザーIDでの検証）
- [ ] 期限切れ / 試行回数上限（10分超過、5回超過、`two_factor_send` の日次上限）
- [ ] エラー応答（メール送信失敗、DB障害）
- [ ] 重複・競合（再送クールダウン、同じコードの同時2回投入）
- [ ] 状態保持・遷移（方式の切り替え、`callbackUrl` の保持）

設定系ルートには `処理順` の describe を付け、「レート制限超過 かつ 入力が不正」が
429 を返すことを回帰テストする（`.claude/rules/api-route.md`）。

⚠️ `/api/user/two-factor/*` は `withAdminAuth` ではないが、レート制限が
`checkSecondFactorRateLimit` と handler 内に分かれている。テストで
`mockCheckRateLimit` を積むときは、どちらの層を落としているかを
`toHaveBeenNthCalledWith` で確認する。

### E2E

- 方式 TOTP でのログイン（既存テストの維持）
- 方式メールOTP でのログイン
- 方式の切り替え（TOTP → 無効化 → メールOTP）

実送信のバイパスは `sendOtpEmail`（`src/lib/otp/sendOtpEmail.ts:41`）の内部にあり、
`E2E_TEST_MODE=true` + `OTP_EMAIL_TEST_BYPASS=true` + 非 Vercel本番 の positive guard で
判定している。第2要素の送信も `sendOtpEmail` を再利用するので、**バイパスは自動的に効く**。
新しい分岐は要らない。

E2E ヘルパーは `otp_codes` を PostgREST で直接引き、`code_hash` から総当たりで
コードを復元している（`e2e/helpers/api.ts:1117`）。`action_type` のフィルタを
`two_factor` に広げるだけで流用できる。

⚠️ `e2e/helpers/totp.ts:212` と `e2e/helpers/dedicatedUser.ts:136` はリネーム対象の
テーブル名を直書きしているため、マイグレーションと同時に直さないと E2E が落ちる。

---

## 影響範囲

### 変更

| ファイル | 内容 |
|---|---|
| `supabase/migrations/<new>.sql` | リネーム・`method` 列・許可リスト2本 |
| `src/types/database.types.ts` | 再生成 |
| `src/lib/auth/totpVerification.ts` | → `secondFactor.ts`。方式分岐 |
| `src/helpers/totpGuard.ts` | → `secondFactorGuard.ts` |
| `src/lib/auth/auth.ts` | 3か所の呼び出し、送信、再送、新エラーコード |
| `src/app/api/user/totp/**` | → `api/user/two-factor/**`。setup / enable を方式対応 |
| `src/constants/otp.ts` | `OTP_ACTION.TWO_FACTOR` |
| `src/constants/rateLimit.ts` | `RATE_LIMIT_ACTION.TWO_FACTOR_SEND` と上限 |
| `src/constants/totp.ts` | 方式の定数・文言 |
| `src/constants/auth.ts` | `EMAIL_OTP_REQUIRED` / `SECOND_FACTOR_SEND_FAILED` |
| `src/constants/apiEndpoints.ts` | ルートのリネーム追従 |
| `src/features/settings/twoFactorSettings/**` | 方式選択の1段を追加 |
| `src/features/auth/loginForm/**` | 方式別の表示と再送 |
| `src/features/auth/twoFactorChallenge/**` | 同上 |
| `src/app/api/auth/password-reset/confirm/route.ts` | テーブル名の追従のみ（挙動は変えない） |
| `e2e/helpers/totp.ts` / `dedicatedUser.ts` | テーブル名の追従 |
| `e2e/auth/twoFactor.spec.ts` / `authFixture.spec.ts` | 方式別シナリオの追加 |
| `.claude/documents/authentication-flow.md` | 実態との乖離をまとめて解消 |

テーブル名を直書きしている箇所の全件（リネーム漏れは実行時まで気づけない）:

```
e2e/auth/authFixture.spec.ts          src/lib/auth/auth.ts
e2e/auth/twoFactor.spec.ts            src/lib/auth/dbError.test.ts
e2e/helpers/dedicatedUser.ts          src/lib/auth/totpSetup.ts
e2e/helpers/totp.ts                   src/lib/auth/totpVerification.ts
src/app/api/auth/password-reset/confirm/route.ts
src/constants/rateLimit.ts            src/types/database.types.ts（再生成）
```

### 変更しない

- `src/lib/totp/*`（RFC 6238 の純粋計算）
- `/api/auth/otp/send` / `/api/auth/otp/verify`（`two_factor` を足さない）
- パスワードリセット・新規登録のフロー

### ドキュメントの既存の乖離

`.claude/documents/authentication-flow.md:846` は「二要素認証（TOTP）: 不要（対象外）」
と書いているが、実装は存在する。本作業でまとめて現状に合わせる。
