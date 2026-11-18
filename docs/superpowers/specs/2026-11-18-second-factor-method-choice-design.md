# 二段階認証の第2要素を選択制にする

作成日: 2026-11-18
ベース: `46e454cc`
Issue: #1261

## 概要

二段階認証の第2要素を、現在の TOTP 固定から **TOTP / メールOTP のどちらかをユーザーが選ぶ**方式に変える。

認証アプリの導入を負担に感じる利用者に、第2要素そのものを諦めさせないことが目的。

## 決定事項

| 論点 | 決定 |
|---|---|
| 排他性 | **どちらか1つだけ**。`user_totp` の主キーがDB側で保証する |
| データモデル | `user_totp` に `method` 列を足すだけ。**テーブルはリネームしない** |
| 型の表現 | `VARCHAR + CHECK`。ENUM は使わない（既存に `CREATE TYPE` は0件） |
| メール送信の上限 | 専用カウンタ `two_factor_send`（20通/日・ユーザー単位）を新設 |
| リカバリーコード | 方式を問わず発行 |
| パスワードレスOTPログイン | 方式によらず**引き続き塞ぐ**（#642 を維持） |
| admin 発行アカウント | **メールOTP を選ばせない**（宛先が `.invalid` で配送不能） |
| 既存ユーザー | `method` の既定値 `'totp'` で現状維持。移行作業なし |

### リネームしない理由

当初案はテーブルとAPIルートを `second_factor` 系へ改名する予定だったが、**本番の全ログインが
落ちる窓**が生じるため取りやめた。

- `getSecondFactorMethod`（現 `isTotpEnabled`）は2FA未設定の利用者も含め**全ログインで呼ばれる**
- DBエラーを意図的に throw する（`totpVerification.ts:83`、fail-closed。理由は同 :71-83 のコメント）
- このプロジェクトはDBが1つで、`.claude/rules/supabase-db.md` 自身が
  「作業中のブランチはスキーマ変更をリモートへ先行適用するしかない」と書いている

つまり `ALTER TABLE user_totp RENAME TO ...` は**旧コードが動いている本番DBに先に当たる**。
適用からデプロイ完了までの間、`from('user_totp')` が `42P01` を返し、`authorize` が throw して
**パスワード・メール・OAuth の全経路でログインできなくなる**。

機能に必要なのは `method` 列1本だけで、リネームで得られるのは名前の据わりのみ。割に合わない。

**TypeScript 側のリネームは行う**（コンパイル時に解決され、デプロイ窓を作らないため）。

| 対象 | 扱い |
|---|---|
| `user_totp` / `totp_recovery_codes` | 据え置き。`COMMENT ON TABLE` で両方式を扱う旨を記す |
| `/api/user/totp/**` | 据え置き（クライアントとサーバーのデプロイ間に404窓を作らないため） |
| `totpVerification.ts` → `secondFactor.ts` | リネームする |
| `helpers/totpGuard.ts` → `secondFactorGuard.ts` | リネームする |
| `isTotpEnabled` → `getSecondFactorMethod` | リネームする（戻り値の型も変わる） |
| `TOTP_VERIFY_RESULT` → `SECOND_FACTOR_VERIFY_RESULT` | リネームする（値は不変） |

### パスワードレスOTPログインを塞ぎ続ける理由

`auth.ts:170` は二段階認証が有効なユーザーの「メールでログイン」経路を
`OTP_LOGIN_DISABLED` で拒否している（#642）。第2要素がメールOTPになっても変えない。

- パスワードレスOTPログイン = 「メールのコードのみ」
- 第2要素がメールOTP = 「パスワード + メールのコード」

後者のほうが確実に強い。両方開けると前者が実効強度を決めるため、#642 の判断がそのまま当てはまる。

## 承知のうえで受け入れるリスク

**メールOTPを選んだアカウントの実効強度は受信箱と同等になる。**

パスワード再設定が同じ受信箱を通るため、受信箱を奪取した攻撃者はパスワードをリセットした
うえで第2要素も突破できる。

これは一般論ではない。`src/app/api/auth/password-reset/confirm/route.ts:219` は
**第2要素に意図的に触れない**設計で、理由をこう述べている。

> 二段階認証（user_totp）には触れない。解除してしまうと、メール受信箱を
> 押さえただけで第2要素を外せることになり、#642 が塞いだ穴が別経路で開く

方式にメールOTPを選ぶことは、**そのコードが塞いでいる穴を利用者自身の選択で開ける**ことに
等しい。リセット経路は「外せない」ままだが、外す必要がなくなる。

実装では解消できない。設定画面で以下を明示し、利用者の判断に委ねる。

- 認証アプリのほうが安全であること
- メールアカウントを奪われた場合にこのアカウントも奪われること

TOTP を選んだ利用者の強度は現行から変わらず、既定も `'totp'` のため
**既存ユーザーの安全性は下がらない**。

---

## 1. データモデル

```sql
ALTER TABLE user_totp
  ADD COLUMN method VARCHAR(20) NOT NULL DEFAULT 'totp',
  ALTER COLUMN encrypted_secret DROP NOT NULL,
  ADD CONSTRAINT chk_second_factor_method CHECK (method IN ('totp', 'email_otp')),
  ADD CONSTRAINT chk_secret_matches_method CHECK (
    (method = 'totp'      AND encrypted_secret IS NOT NULL)
 OR (method = 'email_otp' AND encrypted_secret IS NULL));

COMMENT ON TABLE user_totp IS
  '二段階認証の設定。method が totp なら encrypted_secret に共有鍵、email_otp なら
   コードは otp_codes 側に持つ。Data APIには公開せず service_role 経由でのみ扱う';
```

- `user_id` が主キーのままなので、**「どちらか1つだけ」はDBが保証する**
- `ADD COLUMN ... NOT NULL DEFAULT` は PG11+ でテーブル書き換えを伴わない
- `chk_secret_matches_method` は既存行（`method='totp'` × `encrypted_secret NOT NULL`）を全件通る
- `last_used_counter` は TOTP でのみ使う。メールOTP では `otp_codes` 行の削除で消費を表す
- 旧コードと完全に後方互換。**デプロイ順序の制約なし**

適用後、`.claude/rules/supabase-db.md` の要求に従い `information_schema.role_table_grants` で
`anon` / `authenticated` に GRANT が付いていないことを実測する
（`user_totp` の防御の本体は `20261017160000_revoke_totp_table_grants.sql` の REVOKE）。

### `action_type` 許可リストの更新

| テーブル | 制約 | 追加する値 | 漏れたときの症状 |
|---|---|---|---|
| `otp_codes` | `chk_otp_action_type` | `'two_factor'` | INSERT が `23514` で失敗（明示的に壊れる） |
| `rate_limits` | `chk_action_type` | `'two_factor_send'` | **無言で制限が無効化**（#546 / #659） |

現在値は `chk_otp_action_type` が3値（`20260312000000:84` の1回きり）、
`chk_action_type` が35値（最新定義は `20261106095759:22-71`）。

### 第2要素のコードの置き場

`otp_codes` を `action_type = 'two_factor'` で再利用する。新しいテーブルは作らない。
`code_hash` は HMAC-SHA256（鍵 `OTP_HASH_PEPPER`、メッセージ `"email:code"`）。

⚠️ **有効期限と試行回数はDB制約では強制されていない。** `chk_otp_attempts`（0〜5）は
列のドメイン制約にすぎず、実際の判定は `auth/otp/verify/route.ts:137`（入口）と
`:166`（加算後）、期限は同 :118-132 の**ルートコード側**にある。
第2要素の検証はこのルートを通らないため、**期限判定と attempts の加算・上限判定を自前で書く**。
書かないと多層防御が1枚減ったことに誰も気づけない。

素の UPDATE で加算すると6回目に `23514` で失敗するので、加算前に上限で弾く。

---

## 2. 送信経路を4本に限定する

**第2要素のコードを送れる経路を、以下の4本だけにする。**

| # | 経路 | 送信する場所 | 宛先の決め方 | 認証 |
|---|---|---|---|---|
| 1 | パスワードログイン | `authorize` 内。パスワード照合の**後** | `user.email` | パスワード |
| 2 | OAuth ログイン | `jwt` コールバック（`trigger==='update'`） | `token` のユーザー | OAuth 済み |
| 3 | 設定画面での有効化 | `POST /api/user/totp/setup` | セッションのユーザー | セッション |
| 4 | 設定変更の本人確認 | `POST /api/user/totp/send-challenge`（**新規**） | セッションのユーザー | セッション |

いずれも**宛先がリクエストボディから来ない**ことが共通条件。これが満たされる限り、
メール爆撃・列挙・踏み台には使えない。

⚠️ **`user.email` を使う。`authorize` スコープの `email` ローカル変数を使ってはいけない。**
ユーザー名ログイン（`auth.ts:86-90`）では空文字になり、全ユーザー名アカウントが
`otp_codes.email = ''` の1行を共有してコードが混線し、再送間隔も日次上限も1つに潰れる。

### 2-1. 公開2ルートが `two_factor` を受理しないようにする（最重要）

`src/schema/otp.ts:11-14` は zod の enum を `OTP_ACTION` から**機械的に導出**している。

```ts
const otpActionValues = Object.values(OTP_ACTION) as [OtpAction, ...OtpAction[]];
```

これが `otpSendSchema`（:35）と `otpVerifySchema`（:51）の両方に入るため、
**`OTP_ACTION.TWO_FACTOR` を足すだけで公開2ルートが `two_factor` を受理する。**

さらに `auth/otp/send/route.ts` の分岐には `else` が無い（:106 `registration` →
:145 `else if` `login` → :168 で終了）。宛先固定は `action === PASSWORD_CHANGE` の
ときだけ（:69）。したがって未知の action は**存在チェックもセッション束縛も通らず**、
再送間隔 → 日次上限 → INSERT → `sendOtpEmail` へ素通りする。

成立する攻撃:

1. **未認証のメール中継** — 任意のアドレスへ自サービス名義の確認コードが飛ぶ。
   #641 で塞いだ穴（当時は「アカウントを1つ持つだけ」、これは**アカウント不要**）
2. **第2要素のDoS** — `route.ts:252-257` が同一 `email + action_type` の未検証行を
   DELETE してから INSERT するため、被害者が受け取ったコードを連続で無効化できる
3. **巻き添えの枠消費** — 被害者の `otp_send_daily`（5通/日）を食い、登録確認・
   メールログイン・パスワード変更のメールが止まる
4. **試行回数の焼き切り** — `otp/verify` も受理し、`attempts` 加算（:155-158）まで到達。
   成り代わりはできないが、被害者の `two_factor` 行を5回で使用不能にできる

#### 対策（両方入れる）

**(a) `two_factor` を `OTP_ACTION` に入れない。**
`otp_codes.action_type` の値としてのみ使う定数を `constants/totp.ts` 側に置く。
`OTP_ACTION` は「公開ルートが受け付ける action の一覧」という意味に保つ。

**(b) `send/route.ts` の分岐末尾に `else { 400 }` を足す。**
将来 action が増えたときに素通りできないようにする。(a) だけだと、次に誰かが
`OTP_ACTION` に値を足した瞬間に同じ穴が開く。

**(c) 不変条件をテストで固定する。**
「`/api/auth/otp/send` と `/api/auth/otp/verify` に `action:'two_factor'` を投げると 400」。
これは設計の前提そのものなので、テストが無い状態で実装を終えてはいけない。

### 2-2. 無効化・再発行のための送信経路（経路4）

**当初案には存在せず、メールOTP利用者が永久にロックアウトされる欠陥があった。**

設定画面の有効時ビュー（`twoFactorSettings.tsx:217-232`）には入力欄しかなく、
コードを送るボタンが無い。TOTP は手元のアプリで生成できるので成立していた。

メールOTP では:
- 無効化（`disable/route.ts:60`）も再発行（`recovery-codes/route.ts:59`）も
  `requireSecondFactor` がコードを要求する
- そのコードを取得する経路が無い
- 再セットアップでも逃げられない（`totpSetup.ts:76` が `TotpAlreadyEnabledError`）
- パスワードリセットは第2要素に触れない

結果、リカバリーコードを使い切ると**方式を変えることも2FAを外すこともできなくなる**。

→ `POST /api/user/totp/send-challenge` を1本追加する。セッション必須・宛先は本人固定で、
経路3（`setup`）と同じ安全条件を満たす。`method='email_otp'` のときだけ有効とし、
`two_factor_send` と `TOTP_SETTINGS_VERIFY` の両方を消費する。

### 2-3. レート制限

| カウンタ | 上限 | 識別子 | 位置 |
|---|---|---|---|
| `two_factor_send`（新規） | 20通/日 | ユーザーID | **送信の直前**（例外2） |
| `TOTP_SETTINGS_VERIFY`（既存） | 5回/15分 | ユーザーID | **検証より前**（原則） |

`.claude/rules/api-route.md` は「1ハンドラに複数のレート制限がある場合は、それぞれ別々に
判定すること」と明記している。`setup` と `send-challenge` は**2本持ちになる初めてのルート**なので、
上記のとおり片方を原則・片方を例外2として扱う。併せて同ルールの「例外の一覧」表に
`user/totp/setup POST（TWO_FACTOR_SEND）` と `user/totp/send-challenge POST（同）` を追記する。

`otp_send_daily`（5通/日）とカウンタを分ける理由は、ログインの多さが**新規登録のメール確認と
パスワード変更の本人確認**（`otp/send:228` と `auth/register:159` が消費する2か所）を
巻き添えにしないため。`TOTP_VERIFY` をログインと設定で分けた #940 と同じ発想。

⚠️ `two_factor_send` を `FAIL_CLOSED_ACTIONS`（`constants/rateLimit.ts:111`）に**入れる**。
入れないと `rate_limits` の書き込みだけが壊れた状況で `undeterminedResult` が
`{allowed:true}` を返し、日次上限が無言で消える。既存の `OTP_SEND_DAILY` は入っている。

⚠️ **送信に失敗したら消費した枠を戻す。** 現行の `/api/auth/otp/send` は送信失敗でも枠を
戻さない既知のバグがある（Issue #1260）。登録確認なら「後で再試行」で済むが、
第2要素では**ログインそのものができなくなる** — 数回の送信失敗で24時間ログイン不能になる。
ここは #1260 の修正を待たず、本機能の側で後始末を実装する。

### 2-4. ログイン画面の再送で `login` カウンタを消費しない

`auth.ts:122-132` の `login` レート制限（5回/30分）は `authorize` が呼ばれるたびに
**無条件で消費**され、`resetRateLimit`（:324）は完全成功時にしか走らない。

メールOTPの典型的な流れで枠を使い切る:

```
1. パスワード送信 → 1回目消費・メール送信
2. コード入力     → 2回目
3. 打ち間違え     → 3回目
4. 再送           → 4回目
5. 打ち間違え     → 5回目で30分ロック
```

TOTP と予算は同じだが、メールは遅延・迷惑メール振り分け・コピペミスで到達確率が明確に下がる。

さらに超過時の投げ方が非対称で、`auth.ts:115` と `:131` は**プレーンな `new Error`**。
Auth.js はプレーンな Error に `code` を載せないため（`auth.ts:254-259` のコメント参照）、
`loginForm.tsx` の `resolveErrorMessage` が default に落ちて
**「メールアドレスまたはパスワードが正しくありません」**と表示される。
パスワードは正しいのに30分間そう言われ続ける — #1247 で直したのと同じ形。

→ 再送パス（コード未指定での再呼び出し）では `login` カウンタを消費しない。
併せて :115 / :131 を `CredentialsSignInError(RATE_LIMITED)` に揃える
（識別子にIPが入り照合前に消費されるので、`rate_limited` を返してもアカウント列挙にはならない）。

---

## 3. 検証層

### 公開インターフェースの変更

```ts
// 変更前（src/lib/auth/totpVerification.ts）
isTotpEnabled(supabase, userId): Promise<boolean>

// 変更後（src/lib/auth/secondFactor.ts）
getSecondFactorMethod(supabase, userId): Promise<'totp' | 'email_otp' | null>
```

呼び出し元は**5か所**。

| 場所 | 用途 |
|---|---|
| `auth.ts:170` | メールOTPログインを塞ぐ |
| `auth.ts:274` | パスワードログインの第2要素 |
| `auth.ts:575` | OAuth の `totpPending` |
| `helpers/totpGuard.ts:89` | 設定変更のガード |
| `api/user/totp/route.ts:48` | 設定画面への状態返却 |

**DBエラーを握り潰さない現行方針は維持する。** `totpVerification.ts:71-83` のとおり、
`null` に倒すと第2要素が飛んだセッションが7日間発行される。

### 検証の分岐

```
verifySecondFactor(supabase, userId, code)
  ├ リカバリーコード形式  → verifyRecoveryCode（方式非依存。変更なし）
  ├ method = 'totp'      → verifyAuthenticatorCode（変更なし）
  └ method = 'email_otp' → verifyEmailOtpCode（新規）
```

リカバリーコードとの共存は安全。`RECOVERY_CODE_PATTERN`（`totpVerification.ts:47`）は
`[2-9A-HJKMNP-TWXYZ]{10}` で、6桁の数字コードとは長さも文字種も交わらない。

`verifyEmailOtpCode` は**条件付き DELETE の削除行数**で消費を判定する。

```
DELETE FROM otp_codes
 WHERE email=? AND action_type='two_factor'
   AND code_hash=? AND expires_at > now()
RETURNING id    -- 削除できた行数が1なら成功、0なら不一致または期限切れ
```

`hashOtpCode` は決定的なので1文で書ける。既存の `/api/auth/otp/verify` は
read-then-write で原子的ではない（:94-102 で SELECT → :226-232 で無条件 UPDATE）ため、
これは**既存と同等ではなく既存より強い**。

### 触らないもの

`src/lib/totp/*`（RFC 6238 の計算・暗号化・リカバリーコード生成）は責務も名前も正しい。

---

## 4. 画面

### 設定画面（`features/settings/twoFactorSettings/`）

`TWO_FACTOR_VIEW.DISABLED` に方式選択を1段挟む。

```
DISABLED ─┬→ [TOTP]      → SETUP（QR + 初回コード）      ─┐
          └→ [メールOTP] → SETUP_EMAIL（コード入力）     ─┴→ RECOVERY_CODES → ENABLED
```

- 有効化の成功でリカバリーコードを一度だけ平文表示（`useTwoFactorSettings.ts:149` を踏襲）
- `ENABLED` 画面に現在の方式を表示し、**メールOTP のときだけ「コードを送信」ボタンを出す**
  （経路4。無効化・再発行の前段）
- 方式の切り替えは「無効化 → 再度有効化」
- **`users.username IS NOT NULL`（admin 発行アカウント）にはメールOTP の選択肢を出さない。**
  `adminAccount.ts:132` が `generateSyntheticEmail()` で `.invalid` TLD（RFC 2606、
  絶対に名前解決されない）を入れているため、選ばせると永久に届かない。
  サーバー側でも同条件で拒否する（画面だけの制限にしない）

`TOTP_SETTINGS_LIMIT`（5回/15分、`constants/totp.ts:89-92`）を送信と検証で共有すると、
メールOTP の有効化は `setup`（送信）＋ `enable`（検証）で2枠使う。届かず再送すると
計4回の再試行で15分ロックになる。**送信は `two_factor_send` のみを消費させ、
`TOTP_SETTINGS_VERIFY` は検証側だけにする。**

### ログイン画面（`features/auth/loginForm/`）

`authorize` が投げるエラーコードを2つに分ける。

| コード | 表示 |
|---|---|
| `TOTP_REQUIRED` | 「認証アプリのコード」。現行どおり |
| `EMAIL_OTP_REQUIRED` | 「メールに送ったコード」＋ 再送ボタン＋60秒カウントダウン |

「パスワードが正しいときだけ入力欄を出す」現行の作法（`loginForm.tsx:97-102` のコメント）は維持。
方式の違いもパスワード照合後にしか露出しない。

⚠️ 再送ハンドラは `setTotpCode('')` してから submit する。`loginForm.tsx:135` は
`...(totpRequired ? { totpCode } : {})` で、一度入力欄を出すと**常に** `totpCode` を送るため、
打ち間違えた状態で再送を押すとそのコードが検証されて `TOTP_VERIFY` の枠を1つ失う。

### OAuth の第2要素画面（`app/auth/two-factor/`）

- `session.secondFactorMethod` を新設して方式を渡す。`session` コールバック
  （`auth.ts:824-837`）は `totpPending` のとき `user` を全部空にするため、
  現状では画面が方式を知る経路が無い。OAuth 認証は済んでいるので露出して問題ない
- 再送は `update({ resend: true })`。**`isSubmitting` / `isCancelling` と同じ相互排他に入れる。**
  NextAuth の `update()` は「Cookie を読む → `jwt` 実行 → 書き戻す」を独立に行うため、
  再送（Resend の往復で遅い）と検証（速い）が並行すると再送が後から
  `totpPending: true` を書き戻し、**成功した検証が巻き戻る**。既存コードは同じ危険を
  `useTwoFactorChallenge.ts:71` / `:124` で解決済みなので、同じ形に揃える
- 唯一の出口がログアウトである点（#1161）は変えない

---

## 5. エラー処理

### 送信の失敗を「コードが違う」に化けさせない

`SECOND_FACTOR_SEND_FAILED` を新設する。ただし **`jwt` コールバックからは例外を出せない**
（`auth.ts:502-514` / #1148）ため、OAuth 経路では既存の `token.totpUnavailable` →
`session.totpUnavailable`（`auth.ts:636` / `:835`）と同じ形のトークンフラグを用意する。

### 検証失敗の内訳は引き続き区別しない

不正 / 期限切れ / 使い回し / 試行上限を利用者に区別して見せない。総当たり側に
手がかりを与えるため（`useTwoFactorChallenge.ts:100-102` の現行判断を踏襲）。

---

## 6. テスト

### 単体

対象ファイルと同階層に配置。カバレッジは全指標80%以上。

`.claude/rules/testing.md` の観点チェックリスト:

- [ ] 正常系（方式ごとのログイン / 有効化 / 無効化 / 切り替え）
- [ ] 入力バリデーション（桁数不正、空、形式不正）
- [ ] 認証・認可（未認証での設定変更、他人のユーザーIDでの検証）
- [ ] 期限切れ / 試行回数上限（10分超過、attempts 5回、`two_factor_send` 日次、`TOTP_VERIFY`）
- [ ] エラー応答（メール送信失敗 → 枠が戻ること、DB障害 → fail-closed）
- [ ] 重複・競合（再送クールダウン、同じコードの同時2回投入、再送と検証の競合）
- [ ] 状態保持・遷移（方式の切り替え、`callbackUrl` の保持）
- [ ] **セキュリティ**（§2-1 の不変条件、`resolveSafeCallbackUrl` のオープンリダイレクト拒否、
      admin 発行アカウントのメールOTP 拒否）
- [ ] **レスポンシブ / アクセシビリティ**（方式選択のキーボード操作、SP表示、
      再送カウントダウンのライブリージョン告知）

⚠️ §2-1(c) の不変条件テストは**必須**。これが無いと、将来 `OTP_ACTION` に値が
足された時点で公開ルートが黙って開く。

### 順序の回帰

`setup` / `send-challenge` は `two_factor_send`（例外2）と `TOTP_SETTINGS_VERIFY`（原則）の
2本を持つ初めてのルートなので、`処理順` の describe を付ける。

⚠️ 現行の `/api/user/totp/*` 5ルートは**いずれもレート制限1本**で、`withAdminAuth` のような
2層構造ではない（`checkSecondFactorRateLimit` も handler の中から呼ばれている:
`disable/route.ts:37`）。`.claude/rules/api-route.md` の2層警告は `withAdminAuth` 固有の話。
存在しない層を探さないこと。

### E2E

- 方式 TOTP でのログイン（既存の維持）
- 方式メールOTP でのログイン
- 方式の切り替え（TOTP → 無効化 → メールOTP → 無効化）

実送信のバイパスは `sendOtpEmail`（`src/lib/otp/sendOtpEmail.ts:40-49`）の内部にあり
`action` を見ないため、**第2要素でも自動的に効く**。新しい分岐は不要。

E2E ヘルパーは `otp_codes` を PostgREST で直引きし、`findOtpCodeByHash`
（`e2e/helpers/api.ts:1137-1160`）で 000000〜999999 を総当たりしてコードを復元する。
`api.ts:1113-1115` の `action` 引数はリテラル union なので、型の拡張も要る。

---

## 影響範囲

| ファイル | 内容 |
|---|---|
| `supabase/migrations/<new>.sql` | `method` 列・CHECK 2本・許可リスト2本・COMMENT |
| `src/types/database.types.ts` | 再生成 |
| `src/lib/auth/totpVerification.ts` | → `secondFactor.ts`。方式分岐・`verifyEmailOtpCode` |
| `src/lib/auth/totpSetup.ts` | **方式ごとの分岐が要る**（下記） |
| `src/helpers/totpGuard.ts` | → `secondFactorGuard.ts` |
| `src/lib/auth/auth.ts` | 5か所のうち3つ、送信、再送、`login` カウンタ、新エラーコード、`session.secondFactorMethod` |
| `src/schema/otp.ts` | **公開許可リスト化**（`Object.values` をやめる） |
| `src/app/api/auth/otp/send/route.ts` | 分岐末尾に `else { 400 }` |
| `src/app/api/user/totp/send-challenge/route.ts` | **新規**（経路4） |
| `src/app/api/user/totp/{setup,enable,disable,recovery-codes,route}.ts` | 方式対応 |
| `src/constants/totp.ts` | 方式の定数・`'two_factor'`・文言 |
| `src/constants/rateLimit.ts` | `TWO_FACTOR_SEND` と上限、**`FAIL_CLOSED_ACTIONS`** |
| `src/constants/email.ts` | 第2要素メールの件名・本文 |
| `src/constants/auth.ts` | `EMAIL_OTP_REQUIRED` / `SECOND_FACTOR_SEND_FAILED` |
| `src/features/settings/twoFactorSettings/**` | 方式選択・送信ボタン・admin 発行の除外 |
| `src/features/auth/loginForm/**` | 方式別表示・再送（コードのクリア） |
| `src/features/auth/twoFactorChallenge/**` | 方式別表示・再送（相互排他） |

### `totpSetup.ts` に必要な分岐

テーブル名の追従では済まない。

- `startTotpSetup`（:87-99）は delete → insert する。`method='email_otp'` の INSERT で
  `method` を明示しないと DEFAULT `'totp'` が入り、`encrypted_secret` が NULL なので
  `chk_secret_matches_method` に `23514` で落ちる
- `confirmTotpSetup`（:119-162）は `verifyTotpCode` 決め打ち
- `disableTotp`（:173-200）とリカバリーコードの差し替えは共通で使える

### テストとドキュメントの追従

リネームをやめたため、テーブル名の棚卸しは不要になった。ただし以下は方式追加に伴って要更新。

- `src/lib/auth/totpVerification.test.ts` / `totpSetup.test.ts` — 方式分岐の追加
- `src/app/api/auth/password-reset/confirm/route.test.ts:153-154` — **変更不要**
  （`touchedTables` に `user_totp` が含まれないことを検証する #642 の回帰テスト。
  リネームしないので有効なまま保たれる）
- `.claude/documents/authentication-flow.md` — TOTP の記述は :846 の1行のみで、
  実質ほぼ新規執筆になる
- `.claude/rules/api-route.md` — 例外の一覧表に新ルート2件を追記

### 変更しない

- `src/lib/totp/*`（RFC 6238 の純粋計算）
- `/api/auth/otp/send` / `/api/auth/otp/verify` が受け付ける action の集合（むしろ固定する）
- パスワードリセット・新規登録のフロー
- テーブル名・API ルートのパス

---

## 前提と既知の制約

- **Resend** は 2026-11-18 に本番・ローカルとも `movie-app-fn.com` へ移行済みで、
  所有者以外へも配送可能。当初の「ドメイン検証が未実測」という懸念は解消している
- **Issue #1260**（送信失敗でも日次枠が減る）は未修正。第2要素では
  ログイン不能に直結するため、§2-3 のとおり本機能側で後始末を実装する
