# 認証フロー設計

## 認証方式一覧

| 方式 | 説明 | 用途 |
|------|------|------|
| メール+パスワード | 従来のメール/パスワード認証 | 新規登録・ログイン |
| Google OAuth | Googleアカウントでログイン | ソーシャルログイン |
| GitHub OAuth | GitHubアカウントでログイン | ソーシャルログイン |

**共通仕様:**
- 既存のメール+パスワード登録は引き続き有効
- 同じメールアドレスのアカウントは自動リンク（統合）
- OTP: 6桁数字、有効期限30分（#1258 で10分から延長）、再送あり

---

## 新規登録フロー（メール+パスワード）

### 1. ユーザー情報入力
```
ユーザー
  ↓
[登録フォーム画面]
  - メールアドレス入力
  - パスワード入力（12文字以上72バイト以内、英字大文字・小文字 + 数字）
  - ユーザー名入力（オプション）
  ↓
バリデーション
  - メール形式チェック
  - パスワード強度チェック
  - 重複メールアドレスチェック
```

### 2. 登録処理 + OTP送信
```
クライアント
  ↓
POST /api/auth/register
  {
    email: "user@example.com",
    password: "Password123",
    name: "ユーザー名"
  }
  ↓
サーバー処理:
  1. メールアドレスで既存ユーザーを検索
     a. 既に存在する（メールアドレス列挙防止）
        - 新規ユーザー・OTPを作成せず、メールも送信しない
        - bcrypt.hash + randomDelay(200〜500ms) でタイミングを均一化
        - 新規登録と区別できないレスポンス（201・同一ボディ形状、userId はダミーUUID）を返す
     b. 存在しない → 新規作成
  2. パスワードをハッシュ化（bcrypt, cost=12）
  3. usersテーブルに登録（is_verified = false）
  4. OTPコードを生成（6桁数字）
  5. otp_codesテーブルに保存（有効期限: 30分）
  6. Resendでメール送信
  7. randomDelay(200〜500ms)（既存メール分岐とタイミングを揃える）
  ↓
レスポンス（新規・既存とも同一形状）
  {
    success: true,
    data: { userId: "uuid" },
    message: "確認コードをメールに送信しました"
  }
  ↓
[OTP検証画面に遷移]
```

**メールアドレス列挙防止:**
- 既存メールでも `409 EMAIL_ALREADY_EXISTS` は返さず、新規登録と同一形状の `201` を返す（`userId` はダミーUUID）
- 新規成功パスにも同じ `randomDelay()` を通し、両パスの応答時間分布を近づける
- 残る限界: 既存メール分岐は SELECT 1回のみ、新規成功パスは users/otp_codes への INSERT と Resend 送信の実処理を伴うため、DB・外部メール送信の実所要時間差の完全な隠蔽は本実装のスコープ外

### 3. OTP検証
```
ユーザー
  ↓
[OTP検証画面]
  - 6桁のコードを入力
  ↓
POST /api/auth/otp/verify
  {
    email: "user@example.com",
    code: "123456",
    action: "registration"
  }
  ↓
サーバー処理:
  1. 検証試行のレート制限チェック（email単位、10回/10分）
     - 超過 → 429 RATE_LIMIT_EXCEEDED（Retry-Afterヘッダ付き）、コード照合はスキップ
  2. otp_codesテーブルから該当レコード検索
  3. 有効期限チェック（30分以内か。`OTP_CONFIG.EXPIRY_MINUTES`）
  4. 試行回数チェック（5回以内か）
  5. コード照合
     a. 一致 → is_verified = true に更新、OTPレコード削除、レート制限をリセット
     b. 不一致 → attempts+1、エラー返却（レート制限はリセットしない）
  ↓
成功レスポンス
  {
    success: true,
    message: "メール認証が完了しました"
  }
  ↓
[ログイン画面に遷移]
```

**検証試行のレート制限（email単位）:**
- OTP行の `attempts`（5回）とは独立した、エンドポイント単位の多層防御。上限は 10回/10分
- OTP行の `attempts` は送信のたびにリセットされるため、送信を挟んだ検証試行の連打を防ぐ目的
- 超過時は 429 `RATE_LIMIT_EXCEEDED` + `Retry-After` ヘッダを返し、コード照合をスキップ
- 方式は「上限超過時点からウィンドウ分（10分）ロック」（スライディングウィンドウの集計ではない）
- 検証成功時（registration / login / password_change）はレート制限をリセットし、正当なユーザーの再検証を妨げない

### 4. OTP再送信
```
ユーザーが「再送信」ボタンをクリック
  ↓
POST /api/auth/otp/send
  {
    email: "user@example.com",
    action: "registration"
  }
  ↓
サーバー処理:
  1. 前回送信から1分以上経過しているかチェック
     a. 1分未満 → エラー「しばらく待ってから再送信してください」
     b. 1分以上 → 続行
  2. 既存の未使用OTPを無効化
  3. 新しいOTPコードを生成・保存
  4. Resendでメール送信
  ↓
レスポンス
  {
    success: true,
    message: "確認コードを再送信しました"
  }
```

---

## ログインフロー（メール+パスワード）

### 1. ログイン情報入力
```
ユーザー
  ↓
[ログインフォーム画面]
  - メールアドレス入力
  - パスワード入力
  ↓
POST /api/auth/callback/credentials（NextAuth.js Credentials Provider）
  ※ `/api/auth/login` というルートは無い。`[...nextauth]` の handlers が
    受ける。画面からは `signIn('credentials', ...)` を呼ぶ
  {
    email: "user@example.com",
    password: "Password123"
  }
  ↓
サーバー処理:
  1. usersテーブルから該当ユーザー検索
  2. is_verified チェック
     a. false → エラー「メール認証が完了していません」
     b. true → 続行
  3. パスワードハッシュ照合
  4. セッション/JWTトークン発行
  ↓
レスポンス
  {
    success: true,
    user: { id, email, name, avatar_url }
  }
  ↓
[ホーム画面に遷移]
```

---

## ~~メールOTPログインフロー（パスワードレス）~~（#1361 で削除）

⛔ **パスワード不要でメールのコードだけログインできる経路は削除した。**

受信箱を押さえられるとログインできてしまう経路が、パスワード再設定と
**二重に存在していた**。減らしても復旧手段は残る（再設定／未検証なら再登録）。

消したもの:

- `src/features/auth/otpLoginForm/`（画面・フック）と `LoginForm` の導線
- `/api/auth/otp/send` の `action=login` 分岐、`/api/auth/otp/verify` の LOGIN 経路
- NextAuth credentials の `loginMethod` 分岐（`LOGIN_METHOD` ごと）
- `OTP_ACTION.LOGIN` と `PUBLIC_OTP_ACTIONS` の `'login'`

残したもの:

- **第2要素のメールOTP**（`two_factor`）。別の仕組みで、パスワードの後に来る
- `registration` / `password_change` の OTP。`/api/auth/otp/send` 自体は残る
- `rate_limits` の `'login'`。NextAuth の credentials が**いまも使う**ので
  `RATE_LIMIT_ACTION.LOGIN` として定数化した（以前は `OTP_ACTION.LOGIN` を流用していた）
- `otp_codes.chk_otp_action_type` の `'login'`。**保持期間（48時間）内の既存行が
  あるため、すぐには外さない**。外すと未使用のコードを持つ利用者が壊れる
  （`src/constants/otpActions.test.ts` の `RETIRED_ACTIONS` で固定している）

`verification_token_hash` 列も残る。`password_change` が使い続けている。

---

## ソーシャルログインフロー（Google / GitHub）

### 1. OAuth認証フロー
```
ユーザー
  ↓
[ログインフォーム画面]
  - 「Googleでログイン」or「GitHubでログイン」ボタンをクリック
  ↓
NextAuth.js OAuth Provider
  1. OAuth認証画面にリダイレクト（Google / GitHub）
  2. ユーザーがアクセス許可
  3. コールバックURLにリダイレクト
  ↓
サーバー処理（NextAuth.js signIn callback）:
  1. OAuthプロバイダーからユーザー情報取得
     - email, name, avatar_url
  2. emailでusersテーブルを検索
     a. 既存ユーザーあり → accountsテーブルにプロバイダー情報を追加（リンク）
     b. 既存ユーザーなし → usersテーブルに新規作成（is_verified = true）
                         + accountsテーブルにプロバイダー情報を保存
  3. セッション/JWTトークン発行
  ↓
[ホーム画面に遷移]
```

### 2. アカウントリンク仕様
```
同じメールアドレスの場合、自動リンク:

例: user@example.com でメール+パスワード登録済み
  → Googleログイン（同じ user@example.com）
  → 既存ユーザーにGoogleアカウントをリンク
  → 以降、メール+パスワード / Google どちらでもログイン可能

リンクされたアカウント情報:
  users テーブル: 1レコード（user@example.com）
  accounts テーブル:
    - { provider: 'google', provider_account_id: 'xxx' }
    - { provider: 'github', provider_account_id: 'yyy' }（追加した場合）
```

---

## パスワード変更フロー

### 1. パスワード変更リクエスト
```
ユーザー（ログイン済み）
  ↓
[設定画面 > パスワード変更]
  - 「パスワードを変更する」ボタンをクリック
  ↓
POST /api/auth/otp/send
  {
    email: "user@example.com",
    action: "password_change"
  }
  ↓
サーバー処理:
  1. セッションからユーザー情報を取得
  2. OTPコードを生成・保存
  3. Resendでメール送信
  ↓
レスポンス
  {
    success: true,
    message: "確認コードをメールに送信しました"
  }
  ↓
[OTP検証 + 新パスワード入力画面]
```

### 2. OTP検証
```
ユーザー
  ↓
[OTP検証 + 新パスワード入力画面]
  - 6桁のコードを入力
  ↓
POST /api/auth/otp/verify
  {
    email: "user@example.com",
    code: "123456",
    action: "password_change"
  }
  ↓
サーバー処理:
  1. OTPコード検証
  2. 検証成功 → otp_codesのverified_atを設定
```

### 3. パスワード変更
```
ユーザー
  ↓
[新パスワード入力]
  - 新しいパスワードを入力
  ↓
POST /api/user/change-password
  {
    newPassword: "NewPassword456"
  }
  ↓
サーバー処理:
  1. セッションからユーザー情報を取得
  2. otp_codesで検証済みOTPが存在するか確認（verified_at IS NOT NULL、有効期限内）
  3. 新しいパスワードのバリデーション
  4. パスワードハッシュ化・更新
  5. password_changed_at を更新
  6. OTPレコード削除
  ↓
レスポンス
  {
    success: true,
    message: "パスワードを変更しました"
  }
```

---

## メールアドレス変更フロー（#1359）

**ログイン識別子そのものを差し替える操作。** パスワード変更と同じ重さで扱う。

### 1. 変更リクエスト
```
ユーザー（設定画面）
  ↓
[新しいアドレス + 現在のパスワード]
  ↓
POST /api/user/email-change/request
  ↓
サーバー処理:
  1. レート制限 email_change_request（5回/60分・利用者ID単位）← 検証より前
  2. 入力の検証
  3. users から現在のアドレスと password_hash を取得
  4. password_hash が無い（ソーシャル連携のみ）→ 400
     ※ アプリ側だけ変えると provider 側のアドレスと食い違う
  4-2. accounts に連携行がある → 400
     ※ パスワードと連携を**両方**持つ利用者も対象外。signIn は既存ユーザーを
       users.email で引くため、変更後のソーシャルログインで別アカウントが生える
  5. bcrypt で現在のパスワードを照合
  6. 現在と同じ / 既に他の利用者が使っている → 400
  7. 再送間隔（60秒）を確認 → 既存コードを消して新規 INSERT
     otp_codes { email: 新アドレス, user_id: セッションの利用者ID,
                 action_type: 'email_change' }
  8. 新しいアドレスへ確認コードを送信
```

### 2. 確認コードの検証 → 差し替え
```
POST /api/user/email-change/confirm
  { newEmail, code }
  ↓
サーバー処理:
  1. レート制限 email_change_verify ← 検証より前（送信枠とは別カウンタ）
  2. 入力の検証
  3. 二段階認証を設定しているなら第2要素を要求
     ⚠️ 消費より前。後ろだと打ち間違えるたびに確認コードが焼ける
  4. otp_codes を条件付き DELETE で消費（削除行数で判定）
     条件: user_id + email + action_type + code_hash + 有効期限
  5. change_user_email RPC
     - users.email を差し替え
     - 旧アドレスの rate_limits（完全一致 + `メール|` の前方一致）を削除
     - 旧アドレスの otp_codes を削除
     - 戻り値は旧アドレス
  6. 旧アドレスへ「変更されました」を通知（失敗しても 500 にしない）
  7. クライアントは useSession().update() を呼び、
     auth.ts の jwt callback が users から最新の email を読み直す
```

### ⛔ ここで落としやすい3つ

1. **コードの照合に `user_id` を含めない** → 攻撃者が自分のアカウントで
   取ったコードを、奪った被害者のセッションで使える。差し替え先は
   セッション由来なので、被害者のログイン識別子が攻撃者のものになる。
   さらに旧アドレスの `otp_codes` も消えるためパスワードリセットも使えず、
   **自力の復旧経路が無くなる**（#1359 のレビューで critical）
2. **通知を新アドレスへ送る** → 乗っ取った側に届くだけで持ち主は気づけない。
   **旧アドレスへ送る**
3. **`token.email` を更新しない** → パスワード変更が古いアドレスで
   `otp_codes` を引き、変更後は**永久に失敗する**。`trigger === 'update'` の
   分岐で読み直す（`totpPending` のときは触らない。2要素の途中で
   セッションを確定させてしまうため）

---

## 最終ログイン日時（last_login_at）更新フロー

ユーザーのアクティブ状態を追跡するため、`users.last_login_at` を以下のタイミングで更新する。

### 更新タイミング

#### 1. signInコールバック（初回ログイン時）
```
認証成功（Credentials / OAuth）
  ↓
signIn callback
  ↓
supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', userId)
  ↓
全プロバイダー共通で実行
```

#### 2. jwtコールバック（セッション更新時、1時間間隔でスロットリング）
```
JWTトークン検証時（ページアクセス / API呼び出し）
  ↓
jwt callback
  ↓
token.lastLoginUpdate でスロットリングチェック（1時間間隔）
  ↓
1時間以上経過 → supabase.from('users').update({ last_login_at: ... }) + token.lastLoginUpdate 更新
1時間未満 → スキップ
```

**設計判断 — スロットリングの理由:**
- JWTコールバックはリクエストごとに呼ばれるため、毎回DB更新するとパフォーマンス劣化
- 既存の `token.lastPasswordCheck`（5分間隔）と同じパターンを採用
- 1時間間隔はアクティブユーザー判定（3日以内）に対して十分な精度

**用途:**
- レコメンド生成Cron（`/api/cron/generate-recommendations`）でアクティブユーザーのフィルタリングに使用
- `last_login_at >= now() - 3日` のユーザーのみレコメンド生成対象

---

## セッション絶対有効期限（7日間）

アクティブなセッションであっても、ログインから7日間が経過したセッションは強制的に無効化する。

### 仕様

| 項目 | 値 |
|------|-----|
| 絶対有効期限 | 7日間（`SESSION_CONFIG.ABSOLUTE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000`） |
| 非アクティブ有効期限 | 24時間（`SESSION_CONFIG.IDLE_MAX_AGE_S`） |
| チェックタイミング | jwtコールバック（リクエストごと） |
| 無効化フラグ | `token.invalidated = true` |

### フロー
```
JWTコールバック実行
  ↓
token.issuedAt（ログイン時に設定）と現在時刻を比較
  ↓
  経過時間 > 7日間 → token.invalidated = true を設定してトークンを返す
  経過時間 ≤ 7日間 → 続行
  ↓
sessionコールバック: token.invalidated が true の場合
  → session.user.id = '' など空のユーザー情報を返す
  → クライアント側は未認証状態と判定し、ログイン画面にリダイレクト
```

**実装ファイル:**
- `src/lib/auth/sessionExpiry.ts` — `isSessionExpired(issuedAt)` 関数
- `src/lib/auth/auth.ts` — jwtコールバック内でチェック
- `src/constants/auth.ts` — `SESSION_CONFIG.ABSOLUTE_MAX_AGE_MS`

---

## パスワード変更によるセッション無効化

パスワード変更後、既存の全セッション（他デバイスを含む）を強制的に無効化する。

### 仕様

| 項目 | 値 |
|------|-----|
| チェック間隔 | 5分（`CHECK_INTERVAL = 5 * 60 * 1000`） |
| チェックタイミング | jwtコールバック（前回チェックから5分以上経過した場合） |
| 比較対象 | DBの `users.password_changed_at` vs トークンの `token.passwordChangedAt` |
| 無効化フラグ | `token.invalidated = true` |

### フロー
```
JWTコールバック実行
  ↓
現在時刻 - token.lastPasswordCheck > 5分？
  ↓ YES
  DBから users.password_changed_at を取得
  ↓
  DB の password_changed_at > token.passwordChangedAt？
    YES → token.invalidated = true を設定（セッション無効化）
    NO  → token.lastPasswordCheck を現在時刻に更新して続行
  ↓ NO（5分未満）
  スキップ
```

**パスワード変更時のDBレコード更新（`src/app/api/user/change-password/route.ts`）:**
```
POST /api/user/change-password
  ↓
新しいパスワードのハッシュ化
  ↓
usersテーブルの password_changed_at を現在時刻に更新
  ↓
最大5分以内に全セッションのjwtコールバックが検知 → token.invalidated = true
```

**実装ファイル:**
- `src/lib/auth/auth.ts` — jwtコールバック内でチェック
- `src/app/api/user/change-password/route.ts` — `password_changed_at` を更新

---

## ログアウトフロー

```
ユーザーがログアウトボタンをクリック
  ↓
`signOut()`（`next-auth/react`）→ POST /api/auth/signout
  ※ `/api/auth/logout` というルートは無い
  ↓
サーバー処理:
  - JWT方式: セッションCookieを削除
  ↓
クライアント処理:
  - トークン削除
  - ユーザー状態クリア
  - ログイン画面に遷移
```

---

## 認証状態の保持

### ページ遷移時の認証チェック
```
ページアクセス
  ↓
Middleware/Guard
  ↓
トークン/セッション存在チェック
  ↓
  有効 → コンテンツ表示
  無効 → ログイン画面にリダイレクト
```

### APIリクエスト時の認証
```
クライアント
  ↓
API Request
  Header: Authorization: Bearer <token>
  or
  Cookie: session_id=<session>
  ↓
サーバー Middleware
  ↓
トークン/セッション検証
  ↓
  有効 → 処理続行
  無効 → 401 Unauthorized
```

---

## OTP仕様

| 項目 | 値 |
|------|-----|
| 桁数 | 6桁（数字のみ） |
| 有効期限 | 30分（`OTP_CONFIG.EXPIRY_MINUTES`。#1258 で10分から延長） |
| 検証試行上限（OTP行のattempts） | 5回 |
| 検証エンドポイントのレート制限（email単位） | 10回/10分（超過後ロック、検証成功でリセット） |
| 再送間隔 | 1分 |
| メール送信 | Resend（無料枠） |

### Resend無料枠の制約

| 項目 | 制限値 |
|------|--------|
| 月間送信数 | 3,000通/月 |
| 日間送信数 | 100通/日 |
| APIレート制限 | 2リクエスト/秒 |
| ドメイン数 | 1ドメイン/チーム |
| Batch API | 最大100通/リクエスト |

**運用上の考慮事項:**
- 1日100通の制限があるため、OTP再送の乱用防止が重要（再送間隔1分 + rate_limitsテーブル）
- APIレート制限が2req/sのため、OTP送信処理でリトライ時は間隔を空ける
- 月3,000通を超える場合はProプラン（$20/月、50,000通/月）への移行を検討

**OTPメールテンプレート:**
```
件名: [Movie App] 確認コード

本文:
Movie Appの確認コードです。

確認コード: 123456

このコードは30分間有効です。
心当たりがない場合は、このメールを無視してください。
```

**OTPアクション種別:**
| action | 用途 | 備考 |
|--------|------|------|
| registration | 新規登録時のメール認証 | is_verified = false → true |
| ~~login~~ | ~~メールOTPログイン~~ | **#1361 で削除。** DB の CHECK 制約には残している（保持期間内の既存行のため） |
| password_change | パスワード変更の本人確認 | ログイン済みユーザーのみ |

---

## セキュリティ対策

### パスワード
- **ハッシュ化アルゴリズム**: bcrypt（コスト12）
- **最小文字数**: 12文字以上
- **最大バイト数**: 72バイト（UTF-8）。bcrypt が72バイトで黙って切り詰めるため、利用者の認識と実態が乖離しないよう明示的に拒否する（#652）
- **複雑性**: 英字（大文字・小文字）+ 数字必須
- **漏洩パスワード照合**: HIBP Pwned Passwords API を k-anonymity モデルで利用（SHA-1 の先頭5文字のみ送信）。登録・パスワード変更・パスワード再設定の3経路に適用。API 障害時は照合をスキップして通す（fail-open、タイムアウト3秒）
- **ソルト**: 自動生成

### OTPセキュリティ
- **ブルートフォース対策**: 5回失敗で該当OTP無効化
- **検証エンドポイントのレート制限**: email単位で10回/10分（OTP行のattemptsとは独立した多層防御、超過後ロック、検証成功でリセット）
- **再送制限**: 1分間隔
- **有効期限**: 30分で自動失効（`OTP_CONFIG.EXPIRY_MINUTES`）
- **ワンタイム**: 検証成功後に即座に削除
- **暗号的に安全な乱数**: `crypto.randomInt()` で生成

### セッション/トークン（NextAuth.js）
- **非アクティブ有効期限**: 24時間（`SESSION_CONFIG.IDLE_MAX_AGE_S`）
- **絶対有効期限**: 7日間（`SESSION_CONFIG.ABSOLUTE_MAX_AGE_MS`）— アクティブでも強制ログアウト
- **セッションストレージ**: ブラウザメモリ（JWT方式）
- **Cookie設定**（HttpOnly: true, Secure: true（本番）, SameSite: 'lax'）
  - HttpOnly: JavaScriptからアクセス不可
  - Secure: HTTPS必須（本番環境）
  - SameSite: 'lax' - CSRF対策

### OAuth セキュリティ
- **state パラメータ**: CSRF対策（NextAuth.js自動管理）
- **PKCE**: Authorization Code Flow with PKCE（NextAuth.js自動管理）
- **スコープ最小化**: email, profile のみ取得

### その他
- **Rate Limiting**: ログインはアカウント単位 5回/30分（`LOGIN_ACCOUNT`）＋
  送信元IP単位 20回/15分（`LOGIN_IP`）の2層。値は
  `src/constants/rateLimit.ts` の `RATE_LIMIT_CONFIG` が正
- **CSRF対策**: NextAuth.jsで自動対応
- **XSS対策**: 入力サニタイズ、CSP設定

---

## NextAuth.js設定

### Providers設定

```typescript
// src/lib/auth/auth.ts
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import GitHub from 'next-auth/providers/github'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // メール+パスワード認証（#1361 でメールOTPログインの分岐を削除）
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        totpCode: { label: 'TOTP Code', type: 'text' },
      },
      async authorize(credentials) {
        // ⛔ `loginMethod` / `verificationToken` は受け付けない。
        //    宣言を残すと「API を直接叩けばパスワード無しで入れるのでは」と
        //    読めてしまう（`auth.test.ts` が宣言の不在まで検査する）
        // パスワードログイン: パスワードハッシュ照合
        // is_verified チェック必須（照合の後）

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar_url,
          role: user.role,
          passwordChangedAt: user.password_changed_at || null,
        }
      }
    }),

    // Google OAuth
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),

    // GitHub OAuth
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
    }),
  ],

  callbacks: {
    // signInコールバック: アカウントリンク処理
    async signIn({ user, account }) {
      if (account?.provider === 'credentials') {
        // last_login_at を更新して通す
        return true
      }
      // OAuthログイン: 既存ユーザーとアカウントリンク or 新規作成
      return true
    },

    // JWTコールバック: トークンにユーザー情報を追加
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        token.picture = user.image
        token.role = user.role
        token.passwordChangedAt = user.passwordChangedAt
        token.lastPasswordCheck = Date.now()
        token.lastLoginUpdate = Date.now()
        token.issuedAt = Date.now()
      }

      // 絶対有効期限チェック（ログインから7日間）
      if (!token.invalidated && isSessionExpired(token.issuedAt)) {
        token.invalidated = true
        return token
      }

      // パスワード変更によるセッション無効化チェック（5分間隔）
      // ...

      return token
    },

    // セッションコールバック: クライアントに返すセッション情報
    async session({ session, token }) {
      if (token.invalidated) {
        // 無効化されたトークン: 空のユーザー情報を返す
        session.user.id = ''
        session.user.email = ''
        session.user.name = null
        session.user.image = null
        session.user.role = ''
        return session
      }

      session.user.id = token.id as string
      session.user.email = token.email as string
      session.user.name = token.name as string | null
      session.user.image = token.picture as string | null
      session.user.role = token.role as string
      return session
    }
  },

  session: {
    strategy: 'jwt',
    maxAge: SESSION_CONFIG.IDLE_MAX_AGE_S, // 24時間（非アクティブ時）
  },

  // ⚠️ 名前も属性も `src/constants/auth.ts` から取る。インラインで書かない。
  // 失効セッションを消す proxy（src/proxy.ts）と同じ定義を使う必要があり、
  // 片方だけずれるとブラウザは別のCookieとして扱って削除が効かない（#1174）
  cookies: {
    sessionToken: {
      name: getSessionCookieName(),
      options: getSessionCookieOptions(),
    },
  },
})
```

```typescript
// src/constants/auth.ts — 発行側と削除側で共有する定義
export const getSessionCookieName = (): string =>
  process.env.NODE_ENV === 'production'
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

export const getSessionCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
});
```

> ⚠️ 本番の Cookie 名に付く `__Secure-` 接頭辞は、**`Secure` 属性の無い
> `Set-Cookie` をブラウザが拒否する**（CookiePrefixes）。削除するときも
> 属性を省けない。`response.cookies.delete(name)` は文字列を渡すと
> options が undefined になり属性が一切付かないため、**使ってはいけない**。
> 空値 + `maxAge: 0` を同じ属性で `set` する（`src/proxy.ts`）。

### セッションオブジェクト構造
```typescript
// クライアント側で取得できるセッション
{
  user: {
    id: "uuid",
    email: "user@example.com",
    name: "ユーザー名",
    image: "https://...",  // アバター画像URL（null の場合あり）
    role: "user"           // ユーザーロール
  },
  expires: "2026-04-12T00:00:00.000Z"
}
```

---

## 確定事項

### NextAuth.js設定
- [x] **セッションストレージ**: ブラウザメモリ（JWT方式）
- [x] **セッション有効期限**: 非アクティブ24時間 / 絶対有効期限7日間
- [x] **セッション無効化**: パスワード変更時（5分間隔チェック）
- [x] **Credentials Provider**: メールアドレス + パスワード認証
- [x] **Google Provider**: Google OAuth
- [x] **GitHub Provider**: GitHub OAuth
- [x] **Callbacks**: signIn/session/jwt callbacksの設定
- [x] **フォームバリデーション**: react-hook-form + zod

### パスワードポリシー
- [x] **最小文字数**: 12文字以上
- [x] **最大バイト数**: 72バイト（UTF-8）
- [x] **複雑性要件**: 英字（大文字・小文字）+ 数字必須
- [x] **漏洩パスワード照合**: HIBP Pwned Passwords API（k-anonymity、fail-open）
- [x] **パスワードリセット**: OTP検証後にパスワード変更
- [x] **パスワード変更**: 設定画面からOTP検証 + 新パスワード入力

### OTP設定
- [x] **桁数**: 6桁（数字のみ）
- [x] **有効期限**: 30分（`OTP_CONFIG.EXPIRY_MINUTES`）
- [x] **検証試行上限**: 5回
- [x] **再送間隔**: 1分
- [x] **メール送信**: Resend

### UX
- [x] **自動遷移**: ホーム画面（ログイン成功後）
- [x] **エラーメッセージ**: ユーザーフレンドリーで具体的
- [x] **ローディング状態**: ローディングサークル表示 + 画面操作不可（全画面オーバーレイ）

**エラーメッセージポリシー:**
- ユーザーが問題を理解し、解決できる具体的なメッセージ
- セキュリティを損なわない範囲で詳細に
- 例:
  - ✅ 「メールアドレスの形式が正しくありません」
  - ✅ 「パスワードは12文字以上、英字（大文字・小文字）と数字を含む必要があります」
  - ✅ 「パスワードは72バイト以内で入力してください（日本語は1文字3バイト）」
  - ✅ 「このパスワードは過去の情報漏洩で確認されています。別のパスワードを設定してください」
  - ✅ 「確認コードが間違っています。残り3回入力できます」
  - ✅ 「確認コードの有効期限が切れました。再送信してください」

### アカウントリンク
- [x] **自動リンク**: 同じメールアドレスのアカウントは自動リンク
- [x] **複数プロバイダー**: 1ユーザーに複数のログイン方法を紐付け可能

### 将来的な拡張
- [x] **ソーシャルログイン**: Google / GitHub
- [ ] ~~**パスワードレス認証**: メールOTPログイン~~（#1361 で削除）
- [x] **二段階認証**: 実装済み（方式は選択制。下記「二段階認証（第2要素）」を参照）

---

## 二段階認証（第2要素）

利用者は第2要素の方式を **TOTP（認証アプリ）** と **メールOTP** から選ぶ（#1261）。
設定は任意で、既定は無効。

| 方式 | コードの出どころ | 届け方 | 有効期限 |
|---|---|---|---|
| TOTP | 端末とサーバーが共有鍵から各自計算（RFC 6238） | 届かない（アプリを見る） | 30秒（前後1ステップ許容） |
| メールOTP | サーバーが生成 | メール | 30分（`OTP_CONFIG.EXPIRY_MINUTES`。#1258 で10分から延長） |

**リカバリーコードは方式を問わず使える。** 入力形式で振り分けるため、利用者は
どちらを入れるか選ぶ必要がない（`RECOVERY_CODE_PATTERN` は
`[2-9A-HJKMNP-TWXYZ]{10}` で、6桁の数字とは長さも文字種も交わらない）。

### ⚠️ メールOTP を選んだ場合の強度の限界

**実効強度は受信箱と同等になる。** パスワード再設定が同じ受信箱を通るため、
受信箱を奪取した攻撃者はパスワードをリセットしたうえで第2要素も突破できる。

これは一般論ではない。`src/app/api/auth/password-reset/confirm/route.ts` は
「受信箱を押さえただけで第2要素を外せる」のを防ぐため**意図的に第2要素へ
触れない**設計になっている。方式にメールOTP を選ぶことは、そのコードが
塞いでいる穴を利用者自身の選択で開けることに等しい（外す必要がなくなるため）。

実装では解消できないため、設定画面で明示して利用者の判断に委ねる。
TOTP を選んだ利用者の強度は変わらず、既定も `'totp'` なので既存ユーザーの
安全性は下がらない。

### データモデル

`user_totp` の1行（`user_id` が主キー）で表す。1ユーザー1件なので**方式は
DB側で排他**になる。

| 列 | 意味 |
|---|---|
| `method` | `totp` / `email_otp` |
| `encrypted_secret` | TOTP の共有鍵（AES-256-GCM）。`email_otp` では NULL |
| `confirmed_at` | 初回コードの入力で所持確認が取れた日時。NULL は設定途中で**無効** |
| `last_used_counter` | TOTP の使い回し拒否用。`email_otp` では使わない |

`chk_secret_matches_method` が `method` と鍵の有無の整合を保つ。

> ⚠️ テーブル名が `user_totp` / `totp_recovery_codes` のままなのは、リネームすると
> 旧コードが動いている本番DBに先に当たって**全ログインが落ちる**ため。
> `getSecondFactorMethod` は二段階認証を設定していない利用者も含め全ログインで
> 呼ばれ、DBエラーで fail-closed に throw する。

メールOTP のコードは `otp_codes` を `action_type = 'two_factor'` で使う。

### コードを送れる経路は5本だけ

| # | 経路 | 送信する場所 | 宛先 |
|---|---|---|---|
| 1 | パスワードログイン | `authorize` 内。パスワード照合の**後** | `user.email` |
| 2 | OAuth ログイン | `jwt` コールバック | `users` から取得 |
| 3 | 設定画面での有効化 | `POST /api/user/totp/setup` | セッションのユーザー |
| 4 | 設定変更の本人確認 | `POST /api/user/totp/send-challenge` | セッションのユーザー |
| 5 | **設定前の再認証**（#1368） | `POST /api/user/totp/reauth-code` | セッションのユーザー |

いずれも**宛先がリクエストボディから来ない**。1〜4 の実体は
`src/lib/auth/sendSecondFactorCode.ts` の1か所に集約してある。

> ⚠️ 経路5 だけ送るものが違う。1〜4 は**第2要素のコード**（`two_factor`）だが、
> 5 は**第2要素を設定してよいか確かめるコード**（`second_factor_setup`）。
> 第2要素をまだ持っていない利用者に送るので、`sendSecondFactorCode` では
> なく `src/lib/auth/userBoundOtp.ts` を通る。
>
> `userBoundOtp.ts` は**退会の確認コード（#1362）と共通の実装**。どちらも
> 「宛先は登録アドレス」「`user_id` と `action_type` の両方で照合」「公開
> ルートからは到達しない」という同じ性質を持つ。`accountDeleteCode.ts` は
> 用途を固定して渡すだけの薄い層になっている。

> ⚠️ **`OTP_ACTION` に `two_factor` を足してはいけない。** `src/schema/otp.ts` の
> `PUBLIC_OTP_ACTIONS` が公開ルートの受け口で、かつては `OTP_ACTION` から
> 機械的に導出していた。足すと `/api/auth/otp/send` が受理し、宛先固定も
> 存在チェックも通らないまま**未認証で任意のアドレスへ送信できる**（#641 の再発）。

### 設定には再認証が要る（#1368）

**セッションだけで第2要素を登録できてはいけない。** `totp/setup` も
`totp/enable` も `getAuthSession()` 以外に何も要求していなかったため、
セッションを奪った第三者が**被害者のアカウントに自分の第2要素を登録**できた。

登録された第2要素は**乗っ取りの固定手段**になる。以降のログインには攻撃者の
コードが要り、被害者が後からパスワードを変えても残る。リカバリーコードも
攻撃者の手元にしか無い。

`src/helpers/reauthGuard.ts` の `requireReauth` が、持っているものに応じて
**1つだけ**要求する。

| 利用者 | 要求するもの |
|---|---|
| パスワードを持つ | 現在のパスワード（`currentPassword`） |
| パスワードを持たない（OAuth のみ） | 登録アドレスへ送る使い捨てコード（`reauthCode`） |

> ⛔ **「第2要素を持っていること」を再認証として数えない。** 第2要素は
> まさにこの経路で登録できるので、攻撃者が自分で設定して自分で通せる。
> 同じ理由で `DELETE /api/user` も第2要素では免除しない（#1362 / #1366）。

#### 掛けるのは `setup` だけ

`enable` には掛けない。`enable` は `setup` が作った**未確認の行と共有鍵**が
無いと到達できないため、`setup` を塞げば入口は1つになる。両方に掛けると、
パスワードを持たない利用者は1回の設定で確認コードを2通要求されることになる。

> ⚠️ `requireReauth` は **`startSecondFactorSetup` より前**に呼ぶ。後ろに置くと、
> 再認証で落ちたときにはもう `user_totp` の行が作り直されている。

#### 設定途中の行は60分で無効になる

`enable` は `setup` が作った**未確認の行**（`user_totp.confirmed_at IS NULL`）
だけを見る。保留行が無期限に生きると、**再認証を通り抜けた行を後から
いつでも有効化できる**（再認証を入れる前にセッションを奪って `setup` を1回
叩いていれば、修正後もそのまま通る）。

`TOTP_SETUP_PENDING_TTL_MINUTES`（60分）を過ぎた保留行は `confirmSecondFactorSetup`
が**行ごと消して**拒否する。再認証を入れる前から残っていた行は
`20261121090000_cleanup_unconfirmed_user_totp.sql` で1回だけ掃除した。

⚠️ **TTL を知らない経路を残さない。** `send-challenge` は保留行があるかどうか
しか見ないため、期限切れを無視すると**使えないコードを送り続ける**。
届いたばかりの正しいコードが「認証コードが正しくありません」になり、利用者は
再送と入力を繰り返して `totp_settings_verify`（5回/15分）を使い切る。
`getSecondFactorSetupState` が期限切れの保留行を「無い」ものとして返すことで
塞いでいる（確認済みの行には当てない。当てると設定から60分経った利用者の
二段階認証が「未設定」に化ける）。

⚠️ **期限切れからの出口は2つある。** 利用者が押せるのは「有効にする」と
「確認コードを再送信する」で、どちらも `TOTP_ERROR_MESSAGES.SETUP_EXPIRED` を
返し、画面は方式の選択へ戻す。片方だけ直すと、もう片方で画面に留まったまま
同じ操作を繰り返させることになる（コードが来ないとき利用者がまず押すのは
**再送**のほう）。

⚠️ 期限切れは「コードが違う」とは**文言を分ける**。同じにすると、届いた
ばかりの正しいコードを入れた利用者が自分の入力を疑う。

#### 有効化したら登録アドレスへ知らせる

再認証で入口は塞いだが、**塞ぎ漏れがあったときに気づける手段が要る**。
`enable` の成功時に `sendSecondFactorEnabledNotice` が方式と問い合わせ先を
添えて1通送る。

> ⚠️ この送信の結果で有効化を止めない。有効化はもう確定しており、ここで
> 500 にすると**リカバリーコードを一度も表示できない**まま終わる
> （平文はあの応答にしか出ない）。
>
> ⛔ 同じ理由で、**有効化が確定した後ろに throw しうる処理を増やさない。**
> 通知の方式は `confirmSecondFactorSetup` が返す（`getSecondFactorMethod` を
> 呼び直すと DB エラーで投げる）。

### 経路4（`send-challenge`）が必要な理由

無効化とリカバリーコード再発行は `requireSecondFactor` でコードを要求する。
TOTP なら手元の認証アプリで作れるが、**メールOTP では作れない**。

この経路が無いと、メールOTP を有効にした利用者は二度と無効化できなくなる。
再セットアップは `TotpAlreadyEnabledError` で弾かれ、パスワードリセットは
第2要素に触れないため、リカバリーコードを使い切った時点で詰む。

### レート制限

| カウンタ | 上限 | 識別子 | 用途 |
|---|---|---|---|
| `two_factor_send` | 10回 / 60分アイドルで解除 | ユーザーID | コードの送信 |
| `totp_settings_verify` | 5回/15分 | ユーザーID | 設定変更の検証 |
| `totp_verify` | 5回/15分 | ユーザーID | ログイン時の検証 |
| `second_factor_setup_code_send` | 5回/60分 | ユーザーID | **再認証コードの送信**（#1368） |

**送信系と検証系でカウンタを重ねない。** 重ねると、メールOTP の利用者は
無効化のたびに2枠使い、2回しくじるだけで15分間すべての二段階認証操作が
429 になる。

> ⚠️ `maxAttempts` は「◯回 / windowMinutes」という**レートではない**。
> `consume_rate_limit` がカウンタを戻すのは、その窓のあいだ一度もアクセスが
> 無かったときだけ（`src/constants/rateLimit.ts` の #934 の説明）。
> 窓を24時間にすると通常利用で単調増加し、1日2回ログインする利用者は
> 10日ほどで24時間ロックされる。

送信に失敗したら枠を戻す（`release_rate_limit` RPC）。戻さないと、
数回の送信失敗でログインそのものができなくなる。

### admin 発行アカウントはメールOTP を選べない

`users.email` が `generateSyntheticEmail()` の `.invalid` TLD（RFC 2606、
絶対に名前解決されない）なので、選ばせるとコードが永久に届かない。
画面に選択肢を出さず、`setup` ルートでも拒否する（画面だけの制限にしない）。

### パスワードレスOTPログインとの関係（#1361 で解消）

かつては二段階認証が有効なユーザーだけ「メールでログイン」を使えない
（`OTP_LOGIN_DISABLED`）という形で対処していた。

- パスワードレスOTPログイン = 「メールのコードのみ」
- 第2要素がメールOTP = 「パスワード + メールのコード」

後者のほうが確実に強く、両方開けると前者が実効強度を決めてしまう。
**#1361 で前者そのものを消した**ので、この分岐は無くなった
（#642 の判断を全利用者へ広げた形）。
