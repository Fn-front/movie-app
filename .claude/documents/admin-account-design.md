# 管理者発行アカウント設計

メールアドレスを保存せず、管理者が発行するアカウントの設計。

- 作成日: 2026-10-26
- 状態: **実装完了**（PR 1〜3 すべてマージ待ち / 2026-10-30）

---

## 1. 目的

特定の相手にアカウントを配りたいが、**相手のメールアドレスを保存したくない**（プライバシー最小化）。

メールアドレスは「配送路」としてのみ使い、DB には残さない。

---

## 2. 確定した設計

```
アカウント    ユーザー名 + パスワード（メールアドレスを持たない）
機能範囲      既存ユーザーと同等（ウォッチリスト・お気に入り・レコメンド・2FA 等）

users.email   NOT NULL のまま。合成値 <ランダム>@<ランダム>.invalid を格納
              → 内部識別子のみ。本人には教えない。復旧にも使わない

作成          admin 画面で宛先メールを入力
              → ユーザー名を自動生成し、password_hash = null で作成
              → リセットトークンを発行し、設定リンクをメール送信
              → 受信者がリンクを開いて自分でパスワードを設定

復旧          admin による再発行のみ（リカバリーコードは作らない）
              admin 画面でアカウントを選び、宛先メールを入力して再送

2FA           admin 再発行でも解除しない
              → 2FA 有効なアカウントは admin でも乗っ取れない
```

### メール本文（作成・再発行で共通）

```
アカウント名: tanuki-3847
設定リンク  : https://<domain>/auth/reset-password?token=<256bit乱数>
              ※24時間以内・1回のみ有効
```

---

## 3. 却下した案と理由

**次のセッションで蒸し返さないために残す。**

| 案 | 却下理由 |
|---|---|
| パスワードをメール本文に書く | Resend のダッシュボードに有効な認証情報が残る / 受信箱に残り続ける / 失効できない / **誤送信すると永久に有効**。メールを保存しない設計では誤送信の追跡も取り消しもできないため、「時間で自動的に無効になる」ことが唯一の安全弁になる |
| 一時パスワード + 初回ログインで変更強制 | `change-password` がメールOTP必須のため**OTP迂回経路の新設が必要**（認証の根幹）。さらに有効期限も要るので、真面目に作るとリンク方式とほぼ同じ実装に収束する。再発行がリンク方式である以上、二重実装になる |
| 合成メールアドレスを復旧の鍵にする | `users.email` に**平文保存**になる（リカバリーコードは鍵付きHMACで保存しており明確な後退）/ ユーザー名から導出可能な形式だと**ユーザー名を知る者が誰でも再発行できる** / `password-reset/request` が実送信を試みて失敗し、500 応答で**存在判定が漏れる** |
| リカバリーコード | admin 再発行と機能的に重複。復旧経路が2つになり、#642 の「最も弱い経路が全体の強度を決める」が効く |
| `users.email` を NULL 許容にする | 既存のメール系クエリ（`authorize` / OAuth リンク / `otp_codes` 突合）すべてを NULL 安全か確認する必要がある。合成アドレス案でこの作業が丸ごと不要になる |

### 合成アドレスのドメインは `.invalid` 固定

RFC 2606 の予約TLDで**絶対に名前解決されない**。`@example.com` のような実在ドメインだと、何かの拍子に赤の他人へ配送される事故が起きる。

---

## 4. 検証済みの事実

実測・コード確認済み。実装時の前提。

### 流用できる（無改修）

| 対象 | 根拠 |
|---|---|
| `src/app/api/auth/password-reset/confirm/route.ts` | **email への依存ゼロ**（grep 確認済み）。トークンから `user_id` を引く |
| 同上の「新旧同一チェック」 | `if (user.password_hash)` で囲まれており、`null` なら素通り → **初回設定にそのまま使える** |
| `src/app/auth/reset-password/page.tsx` | `token` クエリのみ。`robots: noindex` 設定済み |
| `issuePasswordResetToken(supabase, userId)` | `user_id` 起点。メール不要 |
| `sendPasswordResetEmail(email, url)` | メールは単なる配送先引数 |
| `rejectPwnedPassword` | confirm 内で呼ばれるため、初回設定でも漏洩パスワードを弾ける |
| 2FA を解除しない挙動 | `confirm/route.ts:154` に明示。**この挙動を変えないこと** |

### 変更が必要

| 対象 | 現状 | 必要な変更 |
|---|---|---|
| `src/lib/auth/auth.ts:116` | `.eq('email', email)` 固定 | ユーザー名で引く分岐を追加 |
| `src/lib/auth/auth.ts` authorize | `if (!user.is_verified) throw EMAIL_NOT_VERIFIED` | 発行アカウントは `is_verified = true` で作成して回避 |
| `src/schema/auth.ts:89` `loginSchema` | `email: normalizedEmailSchema` | ユーザー名を受け付けられない |
| `src/constants/auth.ts:179` `USER_ROLE` | `USER: 'user'` のみ | `ADMIN: 'admin'` を追加 |
| `src/lib/auth/auth.ts` jwt コールバック | `role` を**ログイン時にしか取得しない** | **admin を剥奪しても最長7日間 admin のまま**。`lastPasswordCheck` と同じ間隔で追従させる |
| ロール判定 | **コード上ゼロ件** | `withAdminAuth` を新設 |
| `src/app/api/auth/password-reset/request/route.ts:113` | email でユーザーを引き、実送信する | 合成アドレスでは使えない。**admin 用の専用ルートを別に立てる** |

### そのまま使える（変更不要）

- `buildLoginIdentifier(email, clientIp)` — 単純な文字列連結。**ユーザー名をそのまま渡せる**。ユーザー名に `@` が入らない限り識別子の衝突も起きない
- `src/proxy.ts:76-88` の `totpPending` パターン — admin 画面の保護で同じ構造を使える

### DB の現状（本番実測）

```
users.email            character varying(255)  NOT NULL
                       UNIQUE (email), UNIQUE (lower(email))
users.role             character varying(20)   NOT NULL DEFAULT 'user'
chk_user_role          CHECK (role IN ('user','admin'))   ← admin は既に許可済み

本番のロール分布: admin 1件 / user 5件
```

---

## 5. セキュリティ上の不変条件

実装中に崩してはいけないもの。

1. **admin 再発行で `user_totp` に触れない** — 触ると2FAが admin から外せるようになり、バックドアの範囲が全アカウントに広がる（#642）
2. **合成アドレスを本人に教えない・復旧に使わない** — 教えた時点で「平文保存された復旧の鍵」になる
3. **ユーザー名はサーバー側でランダム生成** — 人間が決めると列挙が容易になり、ログイン総当たりの入口が広がる
4. **`password-reset/request`（公開エンドポイント）に合成アドレスを通さない** — 存在判定が漏れる
5. **admin 操作の監査ログを残す** — admin によるパスワード再発行はシステム内で最も強い操作。記録が無いと、admin セッションを奪った攻撃者が静かに任意のアカウントを乗っ取れて痕跡も残らない
6. **レート制限のアクションを `FAIL_CLOSED_ACTIONS` に追加する**（PR #835 で導入）— 認証系は判定不能時に拒否側へ倒す

### admin がバックドアであることの明示

この設計では **admin は 2FA 未設定の全アカウントに対して恒久的なバックドア**になる。

- **admin アカウント自身の 2FA は必須**（推奨ではなく前提条件）
- 本人は気づける: `password_changed_at` の更新で `jwt` コールバックが既存セッションを無効化するため、不正な再発行が起きれば正規利用者は全端末からログアウトされる

---

## 6. タスク分割

共有地点（`authorize` / `jwt` / `proxy` / `withAuth`）を一度に触らないため3つに分ける。各段階で停止可能。

### PR 1 — スキーマとユーザー名ログイン

`feature/username-login`

- [x] マイグレーション: `users.username` 追加（`VARCHAR`, UNIQUE, NULL 許容）
- [x] ユーザー名のランダム生成（`src/lib/auth/` に新規）
  - `src/lib/totp/recoveryCodes.ts` の `ALPHABET`（紛らわしい文字を除いた29文字）を流用する
  - `randomInt` を使う（`Math.random` は不可）
- [x] 合成メールアドレスの生成（`<ランダム>@<ランダム>.invalid`）
- [x] `src/lib/auth/auth.ts` の `authorize()` にユーザー名分岐を追加
  - レート制限・`bcrypt.compare`・TOTP 検証は**既存の共有パスをそのまま通す**
- [x] `loginSchema` をユーザー名入力に対応
- [x] 単体テスト（`auth.test.ts` に追加）
- [x] **完了条件**: アカウントを作る手段がまだ無いため、既存4経路（メール+パスワード / メールOTP / Google / GitHub）が無傷であることを E2E で確認できる

### PR 2 — admin 認可の土台

`feature/admin-authorization`

- [x] `USER_ROLE` に `ADMIN: 'admin'` を追加
- [x] `withAdminAuth` ヘルパー（`src/helpers/`）
- [x] `jwt` コールバックで `role` を定期的に DB から追従（現状はログイン時のみ）
- [x] `proxy.ts` で admin 画面を保護
- [x] 単体テスト
- [x] **完了条件**: admin 画面がまだ無いため、既存ユーザーへの影響がゼロであることを確認できる

### PR 3 — アカウント管理画面

`feature/admin-account-management`

- [x] 一覧画面（ユーザー名・作成日時・最終ログイン）
- [x] 作成: 宛先メール入力 → ユーザー名生成 → `password_hash = null` / `is_verified = true` で作成 → トークン発行 → メール送信
- [x] 再発行: アカウント選択 → 宛先メール入力 → トークン発行 → メール送信
  - **確定前にアカウント名を確認表示する**（誤発行防止）
  - 有効期限は作成時より短く（1時間程度）
- [x] メール文面（`sendPasswordResetEmail.ts` が雛形）
- [x] レート制限（admin 単位）+ `chk_action_type` マイグレーション + `FAIL_CLOSED_ACTIONS` 追加
- [ ] 監査ログ（admin の user_id / 対象 user_id / 操作種別 / 日時）
- [x] E2E
- [x] **完了条件**: 作成 → リンク設定 → ログイン → 再発行 の一連が通る

---

## 7. 決定事項（2026-10-30 確定）

### 7-1. ユーザー名の形式

**紛らわしい文字を除いた29文字 × 12文字を `XXXX-XXXX-XXXX` で区切る。**

```
K7M2-QXPT-9WFN
```

- `src/lib/totp/recoveryCodes.ts` の `ALPHABET`（`23456789ABCDEFGHJKMNPQRSTWXYZ`）をそのまま流用する。
  `0/O`・`1/I/L`・`U/V` を除いてあるため、書き写しの読み違いが起きない
- 29^12 ≈ 2^58。列挙されても推測できない
- 生成は `randomInt`（CSPRNG・剰余の偏りなし）を使う。`Math.random` は不可
- **`@` を含めない**こと。ログインフォームの判定に使う（7-2）

### 7-2. ログインフォームでの受け方

**既存のメールアドレス欄で兼用し、`@` の有無で判定する。**

- ラベルを「メールアドレスまたはアカウント名」に変更する
- `@` を含めばメール、含まなければユーザー名として扱う。ユーザー名の文字種に `@` が
  無いため曖昧さは生じない
- `loginSchema`（`src/schema/auth.ts:89`）が `normalizedEmailSchema` 固定のため、
  両方を受け付ける形に変える
- 画面・スキーマの追加が不要で、E2E の増加も最小で済む

### 7-3. 監査ログ

**新規テーブル `admin_audit_logs` を作る。**

```sql
admin_audit_logs
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
  actor_user_id  UUID NOT NULL REFERENCES users(id)  -- 実行した admin
  target_user_id UUID NOT NULL REFERENCES users(id)  -- 対象アカウント
  action         TEXT NOT NULL                       -- 'create' / 'reissue'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```

- **宛先メールアドレスは記録しない**（保存しない方針を維持する）
- 検索でき、保持期間を自分で決められる。将来 admin 操作が増えても同じ場所に載せられる
- GRANT は `service_role` のみ（`anon` / `authenticated` には付与しない）

---

## 8. 関連

- 既存のセキュリティ原則: `.claude/rules/supabase-db.md` / `.claude/rules/api-route.md`
- レート制限の fail-closed 化: PR #835（本設計はこれに依存）
- 関連する過去の修正: #640（OTP平文保存）/ #641（メール踏み台）/ #642（最も弱い経路）/ #644（識別子によるロック）/ #645（未検証ユーザー上書き）
