# 二段階認証の第2要素を選択制にする 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 二段階認証の第2要素を、TOTP 固定から「TOTP / メールOTP のどちらかをユーザーが選ぶ」方式に変える。

**Architecture:** `user_totp` に `method` 列を足すだけでテーブルはリネームしない（リネームは本番の全ログインを落とす窓を作るため）。第2要素のコードは `otp_codes` を `action_type='two_factor'` で再利用し、**コードを送れる経路を認証済みの4本に限定**する。判定の入口は `isTotpEnabled`（真偽値）から `getSecondFactorMethod`（方式）に置き換える。

**Tech Stack:** Next.js App Router / NextAuth.js (Auth.js v5) / Supabase (PostgREST + service_role) / zod / Jest + React Testing Library / Playwright / Resend

**Spec:** `docs/superpowers/specs/2026-11-18-second-factor-method-choice-design.md`

## Global Constraints

- **テーブル名・API ルートのパスを変更しない。** `user_totp` / `totp_recovery_codes` / `/api/user/totp/**` は据え置き。TypeScript 内部の識別子・ファイル名のみ変更する
- **ENUM 型を作らない。** `VARCHAR + CHECK` を使う（既存マイグレーションに `CREATE TYPE` は0件）
- **`OTP_ACTION` に `two_factor` を足さない。** `src/schema/otp.ts` が `Object.values(OTP_ACTION)` から公開ルートの zod enum を導出しているため、足すと公開2ルートが受理する
- **第2要素のメール宛先は必ず `user.email`。** `authorize` スコープの `email` ローカル変数はユーザー名ログインで空文字になる（`src/lib/auth/auth.ts:86-90`）
- **DBエラーを握り潰さない。** `getSecondFactorMethod` は `throw toDbError(...)` を維持する（fail-closed。`null` に倒すと第2要素が飛んだセッションが7日間発行される）
- **レート制限と検証の順序**は `.claude/rules/api-route.md` に従う。`TOTP_SETTINGS_VERIFY` は検証より前（原則）、`TWO_FACTOR_SEND` は送信の直前（例外2）
- コンポーネントは `React.memo` + `useCallback` + `displayName` 必須（`.claude/rules/react-component.md`）
- SCSS Modules。HTML要素を直接セレクタにしない。デザインシステム変数を使う（`.claude/rules/scss-styling.md`）
- テストは対象ファイルと同階層。カバレッジは全指標80%以上（`.claude/rules/testing.md`）
- コマンド: テスト `npx jest <path>` / lint `npm run lint` / 整形 `npm run prettier` → **その後 `npm run lint` を再実行**（disable コメントの位置がずれて CI だけ落ちる）

### 用語

| 語 | 意味 |
|---|---|
| **TOTP** | 認証アプリが生成する6桁。RFC 6238。通信しない |
| **メールOTP（第2要素）** | `otp_codes.action_type='two_factor'` の6桁。本計画で追加 |
| **メールOTPログイン** | 既存のパスワードレス経路（`OTP_ACTION.LOGIN`）。**第2要素とは別物。本計画では塞いだまま** |

---

## File Structure

| ファイル | 責務 |
|---|---|
| `supabase/migrations/<ts>_add_second_factor_method.sql` | `method` 列・CHECK 2本・`action_type` 許可リスト2本・COMMENT |
| `src/constants/secondFactor.ts`（新規） | 方式の定数、`TWO_FACTOR_OTP_ACTION`、第2要素用の文言 |
| `src/lib/auth/secondFactor.ts`（`totpVerification.ts` をリネーム） | 方式の取得と検証。TOTP / メールOTP / リカバリーコードの分岐 |
| `src/lib/auth/sendSecondFactorCode.ts`（新規） | 第2要素コードの生成・保存・送信。枠の消費と後始末を内包 |
| `src/helpers/secondFactorGuard.ts`（`totpGuard.ts` をリネーム） | 設定変更のガード |
| `src/lib/auth/totpSetup.ts` | 方式ごとの開始・確定。ファイル名は据え置き |
| `src/app/api/user/totp/send-challenge/route.ts`（新規） | 設定変更のためのコード送信（経路4） |
| `src/features/settings/twoFactorSettings/**` | 方式選択・コード送信ボタン |
| `src/features/auth/loginForm/**` | 方式別の入力欄と再送 |
| `src/features/auth/twoFactorChallenge/**` | OAuth 経路の方式別表示と再送 |

### 依存の順序

```
Task 1 (DB) → Task 2 (定数) → Task 3 (公開ルートを閉じる)
                                    ↓
            Task 4 (検証層) → Task 5 (ガード) → Task 6 (送信)
                                    ↓
            Task 7 (setup) → Task 8 (API) → Task 9/10 (auth.ts)
                                    ↓
            Task 11/12/13 (UI) → Task 14 (E2E・ドキュメント)
```

---

## Task 1: マイグレーションと型生成

**Files:**
- Create: `supabase/migrations/<timestamp>_add_second_factor_method.sql`
- Modify: `src/types/database.types.ts`（再生成）

**Interfaces:**
- Produces: `user_totp.method`（`'totp' | 'email_otp'`）、`otp_codes.action_type` が `'two_factor'` を受理、`rate_limits.action_type` が `'two_factor_send'` を受理

- [ ] **Step 1: マイグレーションファイルを作る**

```bash
npx supabase migration new add_second_factor_method
```

- [ ] **Step 2: SQL を書く**

```sql
-- 二段階認証の第2要素を選択制にする
--
-- ⚠️ テーブルはリネームしない。`getSecondFactorMethod` は2FA未設定の利用者も
-- 含め全ログインで呼ばれ、DBエラーで意図的に throw する（fail-closed、
-- src/lib/auth/secondFactor.ts）。DBが1つしかなくスキーマ変更をリモートへ
-- 先行適用する運用のため、RENAME は旧コードが動いている本番DBに先に当たり、
-- パスワード・メール・OAuth の全経路でログインできなくなる。
--
-- ENUM も作らない。既存マイグレーションに CREATE TYPE は0件で、
-- 区分値はすべて VARCHAR + CHECK（chk_user_role 等）で表現している。

ALTER TABLE user_totp
  ADD COLUMN method VARCHAR(20) NOT NULL DEFAULT 'totp';

ALTER TABLE user_totp
  ALTER COLUMN encrypted_secret DROP NOT NULL;

ALTER TABLE user_totp
  ADD CONSTRAINT chk_second_factor_method
    CHECK (method IN ('totp', 'email_otp'));

-- method と共有鍵の有無を一致させる。
-- email_otp に鍵は無く、totp に鍵が無いと検証できない。
ALTER TABLE user_totp
  ADD CONSTRAINT chk_secret_matches_method CHECK (
    (method = 'totp'      AND encrypted_secret IS NOT NULL)
 OR (method = 'email_otp' AND encrypted_secret IS NULL)
  );

COMMENT ON TABLE user_totp IS
  '二段階認証の設定。1ユーザー1件（user_id が主キー）なので、方式は排他になる。
   method=totp なら encrypted_secret に共有鍵、email_otp ならコードは otp_codes
   （action_type=two_factor）側に持つ。Data APIには公開せず service_role 経由でのみ扱う';

COMMENT ON COLUMN user_totp.method IS
  '第2要素の方式。totp=認証アプリ / email_otp=メールのワンタイムコード';

COMMENT ON COLUMN user_totp.encrypted_secret IS
  'AES-256-GCM で暗号化した共有鍵。形式は iv:authTag:暗号文（base64）。
   method=email_otp のときは NULL';

COMMENT ON COLUMN user_totp.last_used_counter IS
  '最後に検証を通した時間ステップ。同じコードの使い回しを拒否するために使う。
   method=email_otp では使わない（消費は otp_codes 行の削除で表す）';

-- --------------------------------------------
-- otp_codes.action_type に two_factor を足す
-- --------------------------------------------
-- ⚠️ src/constants/secondFactor.ts の TWO_FACTOR_OTP_ACTION と一致させること。
-- OTP_ACTION（src/constants/otp.ts）には**足さない** — そちらは
-- src/schema/otp.ts 経由で公開ルートの zod enum になるため、足すと
-- /api/auth/otp/send と /verify が two_factor を受理してしまう。
ALTER TABLE otp_codes
  DROP CONSTRAINT IF EXISTS chk_otp_action_type;

ALTER TABLE otp_codes
  ADD CONSTRAINT chk_otp_action_type CHECK (
    action_type IN (
      -- OTP_ACTION（src/constants/otp.ts）＝公開ルートが受け付ける用途
      'registration',
      'login',
      'password_change',
      -- 第2要素（src/constants/secondFactor.ts）。公開ルートからは到達しない
      'two_factor'
    )
  );

COMMENT ON CONSTRAINT chk_otp_action_type ON otp_codes IS
  'two_factor は第2要素専用で、公開ルート（/api/auth/otp/send, /verify）は受理しない。
   OTP_ACTION に足すと src/schema/otp.ts 経由で公開されるため足さないこと。';

-- --------------------------------------------
-- rate_limits.chk_action_type に two_factor_send を足す
-- --------------------------------------------
-- ⚠️ 許可リストは src/constants/rateLimit.ts の RateLimitActionType と
-- 必ず一致させること。漏れるとその制限が無言で無効化される（#546 / #659）。
ALTER TABLE rate_limits
  DROP CONSTRAINT IF EXISTS chk_action_type;

ALTER TABLE rate_limits
  ADD CONSTRAINT chk_action_type CHECK (
    action_type IN (
      'registration',
      'login',
      'password_change',
      'write_api_favorites',
      'write_api_watchlist',
      'write_api_dismissed_movies',
      'write_api_profile',
      'write_api_settings',
      'read_api_theaters',
      'read_api_theater_detail',
      'awards_fetch',
      'suggest_title',
      'register',
      'change_password',
      'recommendation_refresh',
      'write_api_recommendation_events',
      'otp_send_daily',
      'otp_verify',
      'login_ip',
      'totp_verify',
      'totp_settings_verify',
      'password_reset_request',
      'password_reset_confirm',
      'admin_role_check',
      'admin_account_issue',
      'admin_award_sync',
      'admin_award_sync_status',
      'two_factor_send',  -- 本マイグレーションで追加（#1261）
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'src/constants/rateLimit.ts の RateLimitActionType と必ず一致させること。許可リストから漏れると該当の制限が無言で無効化される（#546 / #659）。';
```

⚠️ **`rate_limits` の許可リストは上書きなので、現行の35値を全部書き写すこと。**
書き漏らすとその制限が無言で死ぬ。現行の定義は
`supabase/migrations/20261106095759_add_admin_role_check_rate_limit_action.sql:22-71`。
**上の一覧をそのまま信用せず、必ず現行ファイルと突き合わせてから書く。**

- [ ] **Step 3: 既存行を壊さないことを適用前に確認する**

トランザクション内で実行 → 確認 → `ROLLBACK`。`.claude/rules/supabase-db.md` の
「権限は REVOKE 文を読むだけでは確認できない。実測すること」と同じ方針。

```sql
BEGIN;
-- マイグレーションの内容を貼って実行
SELECT count(*) FROM user_totp WHERE method = 'totp' AND encrypted_secret IS NULL;
-- 期待: 0（1件でもあれば chk_secret_matches_method で落ちる）
ROLLBACK;
```

- [ ] **Step 4: 適用する**

```bash
set -a; . ./.env.local; set +a
npx supabase db push --dry-run   # 対象が自分の1件だけか確認
npx supabase db push
```

「リモートにあるがローカルに無い」で拒否されたら `.claude/rules/supabase-db.md` の
「安全な回避手順」に従う。**`migration repair --status reverted` は実行しない。**

- [ ] **Step 5: GRANT が増えていないことを実測する**

`user_totp` の防御の本体は `20261017160000_revoke_totp_table_grants.sql` の REVOKE。
`ALTER TABLE` で権限が復活していないことを確かめる。

```sql
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_name IN ('user_totp', 'totp_recovery_codes')
   AND grantee IN ('anon', 'authenticated');
-- 期待: 0行
```

- [ ] **Step 6: 型を再生成する**

```bash
set -a; . ./.env.local; set +a
npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" > src/types/database.types.ts
```

`user_totp` の `Row` に `method: string` が増え、`encrypted_secret` が
`string | null` になっていることを確認する。

- [ ] **Step 7: コミット**

```bash
git add supabase/migrations src/types/database.types.ts
git commit -m "feat(auth): 二段階認証に method 列を足す

テーブルはリネームしない。getSecondFactorMethod は全ログインで呼ばれ
DBエラーで fail-closed に throw するため、RENAME を先行適用すると
旧コードが動いている間ログインが全滅する。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 定数を足す

**Files:**
- Create: `src/constants/secondFactor.ts`
- Modify: `src/constants/rateLimit.ts`、`src/constants/email.ts`、`src/constants/auth.ts`、`src/constants/index.ts`
- Test: `src/constants/secondFactor.test.ts`

**Interfaces:**
- Produces:
  - `SECOND_FACTOR_METHOD = { TOTP: 'totp', EMAIL_OTP: 'email_otp' }` / `type SecondFactorMethod`
  - `TWO_FACTOR_OTP_ACTION = 'two_factor'` / `type TwoFactorOtpAction`
  - `SECOND_FACTOR_MESSAGES`
  - `RATE_LIMIT_ACTION.TWO_FACTOR_SEND = 'two_factor_send'`
  - `RATE_LIMIT_CONFIG.TWO_FACTOR_SEND = { maxAttempts: 20, windowMinutes: 1440 }`
  - `AUTH_ERROR_CODE.EMAIL_OTP_REQUIRED` / `AUTH_ERROR_CODE.SECOND_FACTOR_SEND_FAILED`

- [ ] **Step 1: 失敗するテストを書く**

`src/constants/secondFactor.test.ts`:

```ts
import { TWO_FACTOR_OTP_ACTION, SECOND_FACTOR_METHOD } from './secondFactor';
import { OTP_ACTION } from './otp';
import { FAIL_CLOSED_ACTIONS, RATE_LIMIT_ACTION } from './rateLimit';

describe('第2要素の定数', () => {
  it('方式は totp と email_otp の2つ', () => {
    expect(Object.values(SECOND_FACTOR_METHOD)).toEqual(['totp', 'email_otp']);
  });

  // ⚠️ この2件は設計の前提そのもの。OTP_ACTION に two_factor を足すと
  // src/schema/otp.ts の Object.values 経由で公開2ルートが受理してしまう
  it('two_factor は OTP_ACTION に含まれない', () => {
    expect(Object.values(OTP_ACTION)).not.toContain(TWO_FACTOR_OTP_ACTION);
  });

  it('OTP_ACTION は公開ルートが受け付ける3つだけ', () => {
    expect(Object.values(OTP_ACTION).sort()).toEqual([
      'login',
      'password_change',
      'registration',
    ]);
  });

  it('TWO_FACTOR_SEND は fail-closed（DB不調時に通さない）', () => {
    expect(FAIL_CLOSED_ACTIONS.has(RATE_LIMIT_ACTION.TWO_FACTOR_SEND)).toBe(
      true,
    );
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx jest src/constants/secondFactor.test.ts
```

期待: `Cannot find module './secondFactor'`

- [ ] **Step 3: `src/constants/secondFactor.ts` を作る**

```ts
/**
 * 二段階認証の第2要素に関する定数
 *
 * TOTP 固有の値（桁数・時間ステップ等）は `src/constants/totp.ts` に置く。
 * ここには**方式によらない**ものだけを置く。
 */

/**
 * 第2要素の方式
 *
 * `user_totp.method` の値。1ユーザー1件なので排他になる。
 */
export const SECOND_FACTOR_METHOD = {
  /** 認証アプリ（RFC 6238）。通信しない */
  TOTP: 'totp',
  /** メールのワンタイムコード */
  EMAIL_OTP: 'email_otp',
} as const;

export type SecondFactorMethod =
  (typeof SECOND_FACTOR_METHOD)[keyof typeof SECOND_FACTOR_METHOD];

/**
 * 第2要素コードの `otp_codes.action_type`
 *
 * ⚠️ **`OTP_ACTION`（src/constants/otp.ts）に足してはいけない。**
 * `src/schema/otp.ts` が `Object.values(OTP_ACTION)` から
 * `otpSendSchema` / `otpVerifySchema` の zod enum を導出しているため、
 * 足すと公開ルート `/api/auth/otp/send` と `/api/auth/otp/verify` が
 * `action: 'two_factor'` を受理する。
 *
 * `send` の action 分岐には `else` が無く、宛先固定は `password_change` の
 * ときだけ（route.ts:69）。したがって未認証のまま任意のアドレスへ
 * 自サービス名義の確認コードを送れる状態になる（#641 の穴の再発）。
 *
 * 第2要素のコードは認証済みの4経路からしか作らない。
 */
export const TWO_FACTOR_OTP_ACTION = 'two_factor' as const;

export type TwoFactorOtpAction = typeof TWO_FACTOR_OTP_ACTION;

/**
 * 第2要素の利用者向け文言
 */
export const SECOND_FACTOR_MESSAGES = {
  /** 方式の説明（設定画面） */
  TOTP_DESCRIPTION:
    '認証アプリ（Google Authenticator など）に表示される6桁のコードを使います。',
  EMAIL_OTP_DESCRIPTION:
    'ログインのたびに、登録しているメールアドレスへ6桁のコードを送ります。',
  /**
   * メールOTP を選ぶ利用者への警告
   *
   * パスワード再設定が同じ受信箱を通るため、メールOTP は
   * 「受信箱とは独立した第2の要素」にならない。
   * `src/app/api/auth/password-reset/confirm/route.ts:219` が意図的に
   * 塞いでいる穴を、利用者自身の選択で開けることになる。
   */
  EMAIL_OTP_WARNING:
    'メールのコードは認証アプリより安全性が下がります。パスワードの再設定も同じメールアドレスに届くため、メールアカウントを乗っ取られると、このアカウントも乗っ取られます。認証アプリを使える場合はそちらをおすすめします。',
  /** コードを送った */
  CODE_SENT: '確認コードをメールに送信しました。',
  /** 送信に失敗した（「コードが違う」と区別する） */
  SEND_FAILED:
    '確認コードを送信できませんでした。しばらく待ってからお試しください。',
  /** 送信の日次上限 */
  SEND_LIMIT_EXCEEDED:
    '本日の送信上限に達しました。リカバリーコードでログインしてください。',
  /** admin 発行アカウントはメールOTP を選べない */
  EMAIL_OTP_UNAVAILABLE:
    'このアカウントにはメールアドレスが登録されていないため、メールのコードは利用できません。',
} as const;
```

- [ ] **Step 4: `src/constants/rateLimit.ts` に追記する**

`RATE_LIMIT_ACTION` に足す:

```ts
  /**
   * 第2要素コードのメール送信の上限（ユーザー単位）
   *
   * `OTP_SEND_DAILY` とカウンタを分ける。共有すると、ログインの多さが
   * 新規登録のメール確認（auth/register:159）とパスワード変更の本人確認
   * （auth/otp/send:228）を巻き添えにする。#940 と同じ発想。
   */
  TWO_FACTOR_SEND: 'two_factor_send',
```

`FAIL_CLOSED_ACTIONS` の「メールのワンタイムコード」ブロックに足す:

```ts
  RATE_LIMIT_ACTION.OTP_SEND_DAILY,
  // 第2要素の送信。通さないとログインできないが、通すと上限が無言で消える。
  // 第2要素は「送れないこと」より「無制限に送れること」のほうが危険
  RATE_LIMIT_ACTION.TWO_FACTOR_SEND,
```

`RATE_LIMIT_CONFIG` に足す:

```ts
  /**
   * 第2要素コードのメール送信。
   *
   * 複数端末・複数ブラウザを使う利用者を詰ませない範囲で、メールボックスへの
   * 連投を止める。Resend の無料枠（100通/日・アカウント全体）に対しても
   * 1ユーザーが食い潰さない値にする。
   */
  TWO_FACTOR_SEND: { maxAttempts: 20, windowMinutes: 1440 },
```

- [ ] **Step 5: `src/constants/email.ts` を第2要素に対応させる**

`OTP_PURPOSE_LABEL` のキーを広げる。`Record` が網羅的なので、型を広げないと
コンパイルエラーになる。

```ts
import { TWO_FACTOR_OTP_ACTION, type TwoFactorOtpAction } from './secondFactor';

/** メール本文に用途を書くための種別 */
export type OtpEmailAction = OtpAction | TwoFactorOtpAction;

const OTP_PURPOSE_LABEL: Record<OtpEmailAction, string> = {
  [OTP_ACTION.REGISTRATION]: 'メールアドレスの確認',
  [OTP_ACTION.LOGIN]: 'ログイン',
  [OTP_ACTION.PASSWORD_CHANGE]: 'パスワード変更',
  // 「ログイン」と区別する。利用者が「頼んでいないログイン確認」を見分けられないと、
  // 第三者がパスワードを破った事実に気づけない（#648 と同じ理由）
  [TWO_FACTOR_OTP_ACTION]: '二段階認証',
};
```

`buildOtpEmailSubject` / `buildOtpEmailText` の引数型を `OtpAction` から
`OtpEmailAction` に広げる。

- [ ] **Step 6: `src/constants/auth.ts` にエラーコードを足す**

`AUTH_ERROR_CODE` に:

```ts
  /** 第2要素（メールOTP）の入力が必要。パスワードは正しい */
  EMAIL_OTP_REQUIRED: 'email_otp_required',
  /** 第2要素のコードを送信できなかった。打ち直しても直らない */
  SECOND_FACTOR_SEND_FAILED: 'second_factor_send_failed',
```

`AUTH_ERROR_MESSAGES` に:

```ts
  /** 第2要素の送信に失敗（「コードが違う」と必ず区別する。#1148 と同じ理由） */
  SECOND_FACTOR_SEND_FAILED:
    '確認コードを送信できませんでした。しばらく待ってからお試しください。',
```

- [ ] **Step 7: `src/constants/index.ts` から再エクスポートする**

既存の並びに合わせて `export * from './secondFactor';` を足す。

- [ ] **Step 8: テストが通ることを確認する**

```bash
npx jest src/constants/
```

期待: PASS

- [ ] **Step 9: コミット**

```bash
npm run prettier && npm run lint
git add src/constants
git commit -m "feat(auth): 第2要素の方式と送信上限の定数を足す

two_factor は OTP_ACTION に入れない。schema/otp.ts が Object.values から
公開ルートの zod enum を導出しているため、足すと /api/auth/otp/send が
未認証で任意アドレスへ送れるようになる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 公開2ルートが `two_factor` を拒否することを固定する

**このタスクは単独で価値がある。** Task 4 以降が無くても、公開ルートの受け口を
明示的な許可リストにして `else` を足すのは正しい。先にやることで、以降の作業中に
穴が開いた状態を一瞬も作らない。

**Files:**
- Modify: `src/schema/otp.ts`
- Modify: `src/app/api/auth/otp/send/route.ts`
- Test: `src/app/api/auth/otp/send/route.test.ts`、`src/app/api/auth/otp/verify/route.test.ts`、`src/schema/otp.test.ts`

**Interfaces:**
- Consumes: `TWO_FACTOR_OTP_ACTION`（Task 2）
- Produces: `PUBLIC_OTP_ACTIONS`（`src/schema/otp.ts`）

- [ ] **Step 1: 失敗するテストを書く**

`src/schema/otp.test.ts` に足す:

```ts
import { TWO_FACTOR_OTP_ACTION } from '@/constants/secondFactor';
import { otpSendSchema, otpVerifySchema, PUBLIC_OTP_ACTIONS } from './otp';

describe('公開ルートの action 許可リスト', () => {
  it('公開するのは registration / login / password_change の3つだけ', () => {
    expect([...PUBLIC_OTP_ACTIONS].sort()).toEqual([
      'login',
      'password_change',
      'registration',
    ]);
  });

  it('otpSendSchema は two_factor を拒否する', () => {
    const result = otpSendSchema.safeParse({
      email: 'user@example.com',
      action: TWO_FACTOR_OTP_ACTION,
    });
    expect(result.success).toBe(false);
  });

  it('otpVerifySchema は two_factor を拒否する', () => {
    const result = otpVerifySchema.safeParse({
      email: 'user@example.com',
      code: '123456',
      action: TWO_FACTOR_OTP_ACTION,
    });
    expect(result.success).toBe(false);
  });
});
```

`src/app/api/auth/otp/send/route.test.ts` に足す（既存のモック構成に合わせる）:

```ts
describe('第2要素の action を公開ルートから使えない', () => {
  it('action=two_factor は 400 で、メールを送らない', async () => {
    const response = await POST(
      createRequest({ email: 'victim@example.com', action: 'two_factor' }),
    );

    expect(response.status).toBe(400);
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  // ⚠️ zod を通り抜けた場合の二重の歯止め。
  // 将来 OTP_ACTION に値が足されたとき、分岐に else が無いと
  // 存在チェックも宛先固定も通らずに送信まで素通りする
  it('未知の action は分岐を素通りしない', async () => {
    const response = await POST(
      createRequest({ email: 'victim@example.com', action: 'unknown_action' }),
    );

    expect(response.status).toBe(400);
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx jest src/schema/otp.test.ts src/app/api/auth/otp/send/route.test.ts
```

期待: `PUBLIC_OTP_ACTIONS` が未定義で FAIL

- [ ] **Step 3: `src/schema/otp.ts` を許可リスト方式に変える**

```ts
/**
 * 公開ルートが受け付ける OTP の用途
 *
 * ⚠️ **`Object.values(OTP_ACTION)` を使ってはいけない。**
 * 以前はそう書いていたため、`OTP_ACTION` に値を足すと
 * `/api/auth/otp/send` と `/api/auth/otp/verify` が自動的にそれを受理した。
 * 第2要素（`two_factor`）を足したときは、未認証のまま任意のアドレスへ
 * 自サービス名義の確認コードを送れる状態になる（#641 の穴の再発）。
 *
 * ここは「公開してよい用途」を**人が明示する**場所に保つ。
 * 新しい用途を足すときは、未認証で任意の宛先に送られても問題ないかを
 * 判断したうえで、このリストに書くこと。
 */
export const PUBLIC_OTP_ACTIONS = [
  OTP_ACTION.REGISTRATION,
  OTP_ACTION.LOGIN,
  OTP_ACTION.PASSWORD_CHANGE,
] as const satisfies readonly OtpAction[];

const publicOtpActionValues = PUBLIC_OTP_ACTIONS as unknown as [
  OtpAction,
  ...OtpAction[],
];
```

`otpSendSchema` / `otpVerifySchema` の `z.enum(otpActionValues, ...)` を
`z.enum(publicOtpActionValues, ...)` に差し替え、`otpActionValues` を削除する。

- [ ] **Step 4: `send/route.ts` の分岐末尾に `else` を足す**

`else if (action === OTP_ACTION.LOGIN) { ... }` の直後（現 :168 付近、
`// password_change の認証・宛先解決は上部で済ませている` のコメントの前）に:

```ts
    } else if (action !== OTP_ACTION.PASSWORD_CHANGE) {
      // ⚠️ 二重の歯止め。zod（PUBLIC_OTP_ACTIONS）で弾くのが一次防御で、
      // ここは「将来 action が増えたとき」の保険。
      //
      // この分岐チェーンに else が無かった頃は、未知の action が
      // ユーザー存在チェックも宛先固定（:69 の password_change 分岐）も
      // 通らないまま、再送間隔 → 日次上限 → INSERT → sendOtpEmail へ
      // 素通りした。公開ルートなので未認証で到達できる。
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx jest src/schema/otp.test.ts src/app/api/auth/otp/
```

期待: PASS。既存テストも全て緑であること（公開3用途の挙動は変えていない）

- [ ] **Step 6: コミット**

```bash
npm run prettier && npm run lint
git add src/schema/otp.ts src/app/api/auth/otp src/schema/otp.test.ts
git commit -m "fix(auth): 公開OTPルートの action を明示的な許可リストにする

Object.values(OTP_ACTION) から導出していたため、OTP_ACTION に用途を
足すと公開ルートが自動的に受理していた。分岐に else が無く、未知の
action は宛先固定も存在チェックも通らずに送信まで到達する。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 検証層を方式対応にする

**Files:**
- Rename: `src/lib/auth/totpVerification.ts` → `src/lib/auth/secondFactor.ts`
- Rename: `src/lib/auth/totpVerification.test.ts` → `src/lib/auth/secondFactor.test.ts`
- Modify: 呼び出し元5か所（import パスのみ。ロジックは Task 5/9/10 で変える）

**Interfaces:**
- Consumes: `SECOND_FACTOR_METHOD`、`TWO_FACTOR_OTP_ACTION`（Task 2）
- Produces:
  - `getSecondFactorMethod(supabase, userId): Promise<SecondFactorMethod | null>`
  - `verifySecondFactor(supabase, userId, code): Promise<SecondFactorVerifyResult>`
  - `SECOND_FACTOR_VERIFY_RESULT`（旧 `TOTP_VERIFY_RESULT`。値は不変）
  - `countUnusedRecoveryCodes(supabase, userId): Promise<number>`（変更なし）

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/auth/secondFactor.test.ts`（既存テストは `isTotpEnabled` →
`getSecondFactorMethod` に読み替えて移植。以下は**追加分**）:

```ts
describe('getSecondFactorMethod', () => {
  it('confirmed_at がある totp 行なら totp を返す', async () => {
    mockUserTotpRow({ method: 'totp', confirmed_at: '2026-11-01T00:00:00Z' });
    await expect(getSecondFactorMethod(supabase, 'u1')).resolves.toBe('totp');
  });

  it('confirmed_at がある email_otp 行なら email_otp を返す', async () => {
    mockUserTotpRow({ method: 'email_otp', confirmed_at: '2026-11-01T00:00:00Z' });
    await expect(getSecondFactorMethod(supabase, 'u1')).resolves.toBe('email_otp');
  });

  it('設定途中（confirmed_at が NULL）なら null を返す', async () => {
    mockUserTotpRow(null);
    await expect(getSecondFactorMethod(supabase, 'u1')).resolves.toBeNull();
  });

  // ⚠️ fail-closed。null に倒すと第2要素が飛んだセッションが7日間発行される
  it('DB エラーは握り潰さず throw する', async () => {
    mockUserTotpError({ message: 'connection reset' });
    await expect(getSecondFactorMethod(supabase, 'u1')).rejects.toThrow();
  });
});

describe('verifySecondFactor（method=email_otp）', () => {
  it('期限内の一致するコードで SUCCESS を返し、行を消す', async () => {
    mockUserTotpRow({ method: 'email_otp', confirmed_at: '2026-11-01T00:00:00Z' });
    mockOtpDelete({ deletedRows: 1 });

    await expect(verifySecondFactor(supabase, 'u1', '123456')).resolves.toBe(
      SECOND_FACTOR_VERIFY_RESULT.SUCCESS,
    );
  });

  it('一致しない / 期限切れは INVALID（削除行数が0）', async () => {
    mockUserTotpRow({ method: 'email_otp', confirmed_at: '2026-11-01T00:00:00Z' });
    mockOtpDelete({ deletedRows: 0 });

    await expect(verifySecondFactor(supabase, 'u1', '999999')).resolves.toBe(
      SECOND_FACTOR_VERIFY_RESULT.INVALID,
    );
  });

  // 同時に2回投げられても片方しか通らない（削除できた側だけが勝つ）
  it('同じコードの2回目は INVALID', async () => {
    mockUserTotpRow({ method: 'email_otp', confirmed_at: '2026-11-01T00:00:00Z' });
    mockOtpDelete({ deletedRows: 0 });

    await expect(verifySecondFactor(supabase, 'u1', '123456')).resolves.toBe(
      SECOND_FACTOR_VERIFY_RESULT.INVALID,
    );
  });

  it('リカバリーコードは方式によらず通る', async () => {
    mockUserTotpRow({ method: 'email_otp', confirmed_at: '2026-11-01T00:00:00Z' });
    mockRecoveryCodeMatch();

    await expect(
      verifySecondFactor(supabase, 'u1', 'ABCDE-FGHJK'),
    ).resolves.toBe(SECOND_FACTOR_VERIFY_RESULT.SUCCESS);
  });

  it('試行上限を超えていたら照合せずに INVALID', async () => {
    mockUserTotpRow({ method: 'email_otp', confirmed_at: '2026-11-01T00:00:00Z' });
    mockOtpRowAttempts(5);

    await expect(verifySecondFactor(supabase, 'u1', '123456')).resolves.toBe(
      SECOND_FACTOR_VERIFY_RESULT.INVALID,
    );
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx jest src/lib/auth/secondFactor.test.ts
```

期待: モジュールが無くて FAIL

- [ ] **Step 3: ファイルをリネームして `getSecondFactorMethod` を実装する**

```bash
git mv src/lib/auth/totpVerification.ts src/lib/auth/secondFactor.ts
git mv src/lib/auth/totpVerification.test.ts src/lib/auth/secondFactor.test.ts
```

`isTotpEnabled` を置き換える:

```ts
/**
 * 有効な第2要素の方式を返す
 *
 * `confirmed_at` が入っているものだけを「有効」とみなす。設定途中（QRを表示した
 * だけで初回コードを入れていない）状態でログインを止めてしまうと、
 * 認証アプリに登録できなかった利用者がそのままロックアウトされる。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @returns 有効な方式。未設定なら null
 */
export async function getSecondFactorMethod(
  supabase: SupabaseClient,
  userId: string,
): Promise<SecondFactorMethod | null> {
  const { data, error } = await supabase
    .from('user_totp')
    .select('method')
    .eq('user_id', userId)
    .not('confirmed_at', 'is', null)
    .maybeSingle();

  // ⚠️ **error を握り潰して null に倒してはいけない。**
  //
  // `Error` でラップするのは、素の PostgREST オブジェクトのまま投げると
  // NextAuth が原因を保存せず、ログイン経路で診断情報が消えるため
  // （理由は dbError.ts）。
  // Supabase は「行が無い」ときも「接続断・タイムアウト・PostgREST エラー」の
  // ときも data: null を返す。区別できるのは error だけ。
  //
  // 呼び出し元（auth.ts のログイン3経路）はいずれも「有効なら止める」側の
  // ガードなので、null は**第2要素を飛ばす**ことを意味する。DB の不調だけで
  // パスワードのみのログインが成立し、7日間有効なセッションが発行されてしまう。
  // 判定できないなら拒否側へ倒す（rateLimit.ts の undeterminedResult と同じ方針）
  if (error) throw toDbError(error, 'read user_totp');

  return (data?.method as SecondFactorMethod | undefined) ?? null;
}
```

- [ ] **Step 4: `verifyEmailOtpCode` を実装する**

```ts
/**
 * メールで送った第2要素のコードを検証する
 *
 * ⚠️ **有効期限と試行回数はDB制約では強制されていない。**
 * `chk_otp_attempts`（0〜5）は列のドメイン制約にすぎず、実際の判定は
 * `/api/auth/otp/verify` の**ルートコード側**にある（:118-132 が期限、
 * :137 と :166 が試行回数）。第2要素はそのルートを通らないため、
 * ここで自前で書かないと多層防御が1枚減ったことに誰も気づけない。
 *
 * 消費は**条件付き DELETE の削除行数**で判定する。先に読んでから消すと、
 * 同じコードを同時に2回投げられたときに両方とも通る。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @param code - 利用者が入力した6桁のコード
 * @returns 検証結果
 */
async function verifyEmailOtpCode(
  supabase: SupabaseClient,
  userId: string,
  code: string,
): Promise<SecondFactorVerifyResult> {
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('email')
    .eq('id', userId)
    .single();

  if (userError) throw toDbError(userError, 'read users for second factor');
  if (!user?.email) return SECOND_FACTOR_VERIFY_RESULT.NOT_ENABLED;

  const email = normalizeEmail(user.email);

  // 試行回数の確認。上限に達していたら照合せずに弾く。
  // 素の UPDATE で加算すると6回目に 23514 で失敗し、エラーを見ないと
  // 静かにカウントが止まる
  const { data: row, error: rowError } = await supabase
    .from('otp_codes')
    .select('id, attempts')
    .eq('email', email)
    .eq('action_type', TWO_FACTOR_OTP_ACTION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rowError) throw toDbError(rowError, 'read otp_codes for second factor');
  if (!row) return SECOND_FACTOR_VERIFY_RESULT.INVALID;

  if (row.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
    return SECOND_FACTOR_VERIFY_RESULT.INVALID;
  }

  // 「一致して・期限内の行だけを消す」を1文で行う。
  // 消せた行数が1なら、この呼び出しがそのコードを消費したことが確定する
  const { data: deleted, error: deleteError } = await supabase
    .from('otp_codes')
    .delete()
    .eq('email', email)
    .eq('action_type', TWO_FACTOR_OTP_ACTION)
    .eq('code_hash', hashOtpCode(code.trim(), email))
    .gt('expires_at', new Date().toISOString())
    .select('id');

  if (deleteError) {
    throw toDbError(deleteError, 'consume otp_codes for second factor');
  }

  if (!deleted || deleted.length === 0) {
    // 不一致・期限切れのどちらでも attempts を増やす。
    // 区別して返さないので、区別して数える意味もない
    await supabase
      .from('otp_codes')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id);

    return SECOND_FACTOR_VERIFY_RESULT.INVALID;
  }

  return SECOND_FACTOR_VERIFY_RESULT.SUCCESS;
}
```

- [ ] **Step 5: `verifySecondFactor` を方式で分岐させる**

```ts
/**
 * 第2要素を検証する
 *
 * リカバリーコードはどちらの方式でも受け付ける。入力形式で振り分けるため、
 * 利用者はどちらを入れるか選ぶ必要がない。
 *
 * `RECOVERY_CODE_PATTERN` は `[2-9A-HJKMNP-TWXYZ]{10}` で、6桁の数字コードとは
 * 長さも文字種も交わらないため、方式が増えても取り違えは起きない。
 */
export async function verifySecondFactor(
  supabase: SupabaseClient,
  userId: string,
  code: string,
): Promise<SecondFactorVerifyResult> {
  const normalized = normalizeRecoveryCode(code);

  if (RECOVERY_CODE_PATTERN.test(normalized)) {
    return verifyRecoveryCode(supabase, userId, code);
  }

  const method = await getSecondFactorMethod(supabase, userId);

  if (method === null) {
    return SECOND_FACTOR_VERIFY_RESULT.NOT_ENABLED;
  }

  if (method === SECOND_FACTOR_METHOD.EMAIL_OTP) {
    return verifyEmailOtpCode(supabase, userId, code);
  }

  return verifyAuthenticatorCode(supabase, userId, code.trim());
}
```

`TOTP_VERIFY_RESULT` → `SECOND_FACTOR_VERIFY_RESULT` にリネームし、
後方互換の別名は**作らない**（残すと呼び出し元が両方使い始める）。

- [ ] **Step 6: 呼び出し元の import を直す**

`src/lib/auth/auth.ts`、`src/helpers/totpGuard.ts`、
`src/app/api/user/totp/route.ts` の import パスと識別子を更新する。
この時点では `getSecondFactorMethod(...) !== null` に置き換えるだけでよい
（方式ごとの挙動は Task 9/10 で足す）。

- [ ] **Step 7: テストが通ることを確認する**

```bash
npx jest src/lib/auth/secondFactor.test.ts src/lib/auth/auth.test.ts src/app/api/user/totp/
```

期待: PASS

- [ ] **Step 8: コミット**

```bash
npm run prettier && npm run lint
git add -A
git commit -m "feat(auth): 第2要素の検証を方式対応にする

isTotpEnabled（真偽値）を getSecondFactorMethod（方式）に置き換え、
メールOTP の検証を足した。期限と試行回数はDB制約では強制されていない
（判定はルートコード側）ため自前で実装している。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: ガードをリネームして方式非依存にする

**Files:**
- Rename: `src/helpers/totpGuard.ts` → `src/helpers/secondFactorGuard.ts`
- Rename: `src/helpers/totpGuard.test.ts` → `src/helpers/secondFactorGuard.test.ts`
- Modify: `src/app/api/user/totp/disable/route.ts`、`recovery-codes/route.ts`

**Interfaces:**
- Consumes: `getSecondFactorMethod`、`verifySecondFactor`、`SECOND_FACTOR_VERIFY_RESULT`（Task 4）
- Produces: `checkSecondFactorRateLimit(supabase, userId)`、`requireSecondFactor(supabase, userId, code)`（シグネチャ不変）

- [ ] **Step 1: テストを移植して方式のケースを足す**

```ts
it('method=email_otp でも、正しいコードなら通る', async () => {
  mockSecondFactorMethod('email_otp');
  mockVerifyResult(SECOND_FACTOR_VERIFY_RESULT.SUCCESS);

  await expect(
    requireSecondFactor(supabase, 'u1', '123456'),
  ).resolves.toBeNull();
});

it('第2要素が未設定なら 400 を返す', async () => {
  mockSecondFactorMethod(null);

  const response = await requireSecondFactor(supabase, 'u1', '123456');
  expect(response?.status).toBe(400);
});
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx jest src/helpers/secondFactorGuard.test.ts
```

- [ ] **Step 3: リネームして `isTotpEnabled` の呼び出しを置き換える**

```bash
git mv src/helpers/totpGuard.ts src/helpers/secondFactorGuard.ts
git mv src/helpers/totpGuard.test.ts src/helpers/secondFactorGuard.test.ts
```

`requireSecondFactor` の先頭を:

```ts
  if ((await getSecondFactorMethod(supabase, userId)) === null) {
    return errorResponse(
      ERROR_CODE.BAD_REQUEST,
      TOTP_ERROR_MESSAGES.NOT_CONFIGURED,
      HTTP_STATUS.BAD_REQUEST,
    );
  }
```

`checkSecondFactorRateLimit` は変更不要（方式に依存しない）。
ファイル冒頭の JSDoc に「TOTP とメールOTP の両方を扱う」と追記する。

- [ ] **Step 4: import 元2ルートを直す**

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx jest src/helpers/secondFactorGuard.test.ts src/app/api/user/totp/
```

- [ ] **Step 6: コミット**

```bash
npm run prettier && npm run lint
git add -A
git commit -m "refactor(auth): totpGuard を secondFactorGuard にリネームする

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 第2要素コードの送信ヘルパー

**送信を1か所に集める。** ここを経由しない送信経路を作らないことで、
レート制限・再送間隔・失敗時の後始末の抜けを防ぐ。

**Files:**
- Create: `src/lib/auth/sendSecondFactorCode.ts`
- Test: `src/lib/auth/sendSecondFactorCode.test.ts`

**Interfaces:**
- Consumes: `TWO_FACTOR_OTP_ACTION`、`RATE_LIMIT_ACTION.TWO_FACTOR_SEND`、`RATE_LIMIT_CONFIG.TWO_FACTOR_SEND`（Task 2）、`generateOtpCode()`、`hashOtpCode(code, email)`、`sendOtpEmail(email, code, action)`
- Produces:
  ```ts
  export const SEND_SECOND_FACTOR_RESULT = {
    SENT: 'sent',
    THROTTLED: 'throttled',      // 再送間隔（60秒）内
    LIMIT_EXCEEDED: 'limit_exceeded',
    SEND_FAILED: 'send_failed',
  } as const;
  export type SendSecondFactorResult = ...;
  export async function sendSecondFactorCode(
    supabase: SupabaseClient,
    userId: string,
    email: string,
  ): Promise<SendSecondFactorResult>;
  ```

- [ ] **Step 1: 失敗するテストを書く**

```ts
describe('sendSecondFactorCode', () => {
  it('コードを保存してメールを送り SENT を返す', async () => {
    mockNoRecentSend();
    mockRateLimit({ allowed: true });
    mockSendOtpEmail(true);

    await expect(
      sendSecondFactorCode(supabase, 'u1', 'user@example.com'),
    ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.SENT);

    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      'user@example.com',
      expect.stringMatching(/^\d{6}$/),
      'two_factor',
    );
  });

  it('60秒以内の再送は THROTTLED で、メールを送らない', async () => {
    mockRecentSend({ secondsAgo: 10 });

    await expect(
      sendSecondFactorCode(supabase, 'u1', 'user@example.com'),
    ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.THROTTLED);
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  it('日次上限を超えたら LIMIT_EXCEEDED で、メールを送らない', async () => {
    mockNoRecentSend();
    mockRateLimit({ allowed: false });

    await expect(
      sendSecondFactorCode(supabase, 'u1', 'user@example.com'),
    ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED);
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  // ⚠️ #1260: 現行の /api/auth/otp/send は送信失敗でも枠を戻さない。
  // 第2要素では数回の失敗で24時間ログイン不能になるため、ここでは戻す
  it('送信に失敗したら消費した枠を戻し、行も残さない', async () => {
    mockNoRecentSend();
    mockRateLimit({ allowed: true });
    mockSendOtpEmail(false);

    await expect(
      sendSecondFactorCode(supabase, 'u1', 'user@example.com'),
    ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.SEND_FAILED);

    expect(mockReleaseRateLimit).toHaveBeenCalledWith(
      supabase,
      'u1',
      'two_factor_send',
    );
    expect(mockOtpDelete).toHaveBeenCalled();
  });

  it('前のコードは消してから新しいコードを入れる', async () => {
    mockNoRecentSend();
    mockRateLimit({ allowed: true });
    mockSendOtpEmail(true);

    await sendSecondFactorCode(supabase, 'u1', 'user@example.com');

    expect(mockOtpDelete).toHaveBeenCalledBefore(mockOtpInsert);
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx jest src/lib/auth/sendSecondFactorCode.test.ts
```

- [ ] **Step 3: 実装する**

```ts
/**
 * 第2要素のコードを生成してメールで送る
 *
 * **第2要素のコードを作る唯一の場所。** 送信経路は4本あるが、いずれもここを通す。
 *
 *   1. パスワードログイン（`auth.ts` の `authorize`）
 *   2. OAuth ログイン（`auth.ts` の `jwt` コールバック）
 *   3. 設定画面での有効化（`/api/user/totp/setup`）
 *   4. 設定変更の本人確認（`/api/user/totp/send-challenge`）
 *
 * ⚠️ **宛先を引数で受けるが、呼び出し側はリクエストボディから渡してはいけない。**
 * 必ずセッションまたは `users` テーブルから引いた値を渡すこと。ボディを信用すると
 * 任意のアドレスへ自サービス名義のコードメールを送れる（#641）。
 *
 * ⚠️ **日次上限は送信の直前に消費し、失敗したら戻す。**
 * `.claude/rules/api-route.md` の例外2（守る資源がメールボックス）。
 * 現行の `/api/auth/otp/send` は失敗でも戻さないが（#1260）、第2要素では
 * 数回の送信失敗でログインそのものができなくなるため、ここでは後始末する。
 */
export async function sendSecondFactorCode(
  supabase: SupabaseClient,
  userId: string,
  email: string,
): Promise<SendSecondFactorResult> {
  const normalizedEmail = normalizeEmail(email);

  // 再送間隔。メールボックスへの連投を止める
  const { data: recent, error: recentError } = await supabase
    .from('otp_codes')
    .select('created_at')
    .eq('email', normalizedEmail)
    .eq('action_type', TWO_FACTOR_OTP_ACTION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 握り潰すと「前回送信なし」に化け、DB が詰まっている間だけ再送間隔が
  // 素通りする（#1164 と同じ理由）
  if (recentError) {
    throw toDbError(recentError, 'read otp_codes for second factor send');
  }

  if (recent) {
    const elapsedSeconds =
      (Date.now() - new Date(recent.created_at).getTime()) / 1000;

    if (elapsedSeconds < OTP_CONFIG.RESEND_INTERVAL_SECONDS) {
      return SEND_SECOND_FACTOR_RESULT.THROTTLED;
    }
  }

  // ここから先は実際に送る。枠を消費する
  const limitResult = await checkRateLimit(
    supabase,
    userId,
    RATE_LIMIT_ACTION.TWO_FACTOR_SEND,
    RATE_LIMIT_CONFIG.TWO_FACTOR_SEND.maxAttempts,
    RATE_LIMIT_CONFIG.TWO_FACTOR_SEND.windowMinutes,
  );

  if (!limitResult.allowed) {
    return SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED;
  }

  const code = generateOtpCode();
  const expiresAt = new Date(
    Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000,
  ).toISOString();

  // 前のコードは無効にする。複数生きていると、古いコードでも通ってしまう
  const { error: deleteError } = await supabase
    .from('otp_codes')
    .delete()
    .eq('email', normalizedEmail)
    .eq('action_type', TWO_FACTOR_OTP_ACTION);

  if (deleteError) {
    throw toDbError(deleteError, 'clear previous second factor codes');
  }

  const { error: insertError } = await supabase.from('otp_codes').insert({
    email: normalizedEmail,
    code_hash: hashOtpCode(code, normalizedEmail),
    action_type: TWO_FACTOR_OTP_ACTION,
    expires_at: expiresAt,
  });

  if (insertError) {
    throw toDbError(insertError, 'insert second factor code');
  }

  const sent = await sendOtpEmail(normalizedEmail, code, TWO_FACTOR_OTP_ACTION);

  if (!sent) {
    // 枠と行の両方を戻す。残すと、届いていないコードを待つ利用者が
    // 再送もできない状態になる
    await releaseRateLimit(
      supabase,
      userId,
      RATE_LIMIT_ACTION.TWO_FACTOR_SEND,
    );
    await supabase
      .from('otp_codes')
      .delete()
      .eq('email', normalizedEmail)
      .eq('action_type', TWO_FACTOR_OTP_ACTION);

    return SEND_SECOND_FACTOR_RESULT.SEND_FAILED;
  }

  return SEND_SECOND_FACTOR_RESULT.SENT;
}
```

- [ ] **Step 4: `releaseRateLimit` を `src/lib/rateLimit/rateLimit.ts` に足す**

既存の `resetRateLimit` は**カウンタを全消去**するので使えない（送信失敗1回で
20通分の枠が戻ってしまう）。1回ぶんだけ戻す関数を足す。

```ts
/**
 * 直近に消費した1回ぶんのカウントを取り消す
 *
 * `resetRateLimit` はカウンタを全消去するため、「消費したが実行できなかった」
 * ケースには強すぎる。メール送信の失敗のように、枠を1つだけ戻したいときに使う。
 *
 * @param supabase - service_role のクライアント
 * @param identifier - レート制限の識別子
 * @param action - 対象のアクション
 */
export async function releaseRateLimit(
  supabase: SupabaseClient,
  identifier: string,
  action: RateLimitActionType,
): Promise<void> {
  // 実装は consume_rate_limit の対になる RPC を使う。
  // 失敗しても呼び出し側の処理は続ける（枠が1つ戻らないだけで、
  // ここで throw すると送信失敗が500に化けて原因が分からなくなる）
}
```

対応する RPC を Task 1 とは別のマイグレーションで足す。
`.claude/rules/supabase-db.md` に従い `SECURITY INVOKER` +
`SET search_path = public, pg_temp` + `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`
+ `GRANT EXECUTE ... TO service_role` を同じマイグレーションに書く。

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx jest src/lib/auth/sendSecondFactorCode.test.ts src/lib/rateLimit/
```

- [ ] **Step 6: コミット**

---

## Task 7: `totpSetup.ts` を方式対応にする

**Files:**
- Modify: `src/lib/auth/totpSetup.ts`
- Test: `src/lib/auth/totpSetup.test.ts`

**Interfaces:**
- Consumes: Task 4 / Task 6
- Produces:
  - `startSecondFactorSetup(supabase, userId, method, accountName, email): Promise<TotpSetupStart | EmailOtpSetupStart>`
  - `confirmSecondFactorSetup(supabase, userId, code): Promise<string[] | null>`
  - `disableTotp` / `regenerateRecoveryCodes` は不変

- [ ] **Step 1: 失敗するテストを書く**

```ts
it('method=email_otp の設定開始は共有鍵を作らず、コードを送る', async () => {
  await startSecondFactorSetup(supabase, 'u1', 'email_otp', 'u@e.com', 'u@e.com');

  expect(mockInsert).toHaveBeenCalledWith(
    expect.objectContaining({
      user_id: 'u1',
      method: 'email_otp',
      encrypted_secret: null,
    }),
  );
  expect(mockSendSecondFactorCode).toHaveBeenCalled();
});

// ⚠️ method を明示しないと DEFAULT 'totp' が入り、encrypted_secret が NULL
// なので chk_secret_matches_method に 23514 で落ちる
it('method=totp の設定開始は method を明示して insert する', async () => {
  await startSecondFactorSetup(supabase, 'u1', 'totp', 'u@e.com', 'u@e.com');

  expect(mockInsert).toHaveBeenCalledWith(
    expect.objectContaining({ method: 'totp' }),
  );
});

it('既に有効なら方式によらず TotpAlreadyEnabledError', async () => {
  mockExistingRow({ confirmed_at: '2026-11-01T00:00:00Z' });

  await expect(
    startSecondFactorSetup(supabase, 'u1', 'email_otp', 'u@e.com', 'u@e.com'),
  ).rejects.toThrow(TotpAlreadyEnabledError);
});

it('method=email_otp の確定はメールのコードで検証する', async () => {
  mockSetupRow({ method: 'email_otp' });
  mockEmailOtpMatch();

  await expect(
    confirmSecondFactorSetup(supabase, 'u1', '123456'),
  ).resolves.toHaveLength(RECOVERY_CODE_CONFIG.COUNT);
});
```

- [ ] **Step 2: 落ちることを確認する**

- [ ] **Step 3: `startTotpSetup` を `startSecondFactorSetup` に拡張する**

既存の「読み取りに失敗したら何も消さずに抜ける」ガード（:63-74）は**そのまま残す**。
`insert` に `method` を必ず渡す:

```ts
  const isTotp = method === SECOND_FACTOR_METHOD.TOTP;
  const secret = isTotp ? generateTotpSecret() : null;

  // ⚠️ method を明示する。省くと DEFAULT 'totp' が入り、email_otp では
  // encrypted_secret が NULL なので chk_secret_matches_method に落ちる
  const { error } = await supabase.from('user_totp').insert({
    user_id: userId,
    method,
    encrypted_secret: secret ? encryptTotpSecret(secret) : null,
  });
```

メールOTP のときは行を作ったあとに `sendSecondFactorCode` を呼び、
その結果を戻り値に含める（送信に失敗したら設定途中の行を消してから返す）。

- [ ] **Step 4: `confirmTotpSetup` を `confirmSecondFactorSetup` に拡張する**

設定途中の行の `method` を読み、TOTP なら `verifyTotpCode`、
メールOTP なら `otp_codes` と照合する。
**リカバリーコードの発行は成功後のみ**という現行の順序（:119-162 の JSDoc 参照）は変えない。

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx jest src/lib/auth/totpSetup.test.ts
```

- [ ] **Step 6: コミット**

---

## Task 8: API ルートを方式対応にする

**Files:**
- Create: `src/app/api/user/totp/send-challenge/route.ts` + `route.test.ts`
- Modify: `setup/route.ts`、`enable/route.ts`、`route.ts`（+ 各テスト）
- Modify: `src/schema/totp.ts`

**Interfaces:**
- Consumes: Task 6 / Task 7
- Produces:
  - `POST /api/user/totp/setup` が `{ method }` を受ける
  - `GET /api/user/totp` が `{ enabled, method, remainingRecoveryCodes }` を返す
  - `POST /api/user/totp/send-challenge` が `{}` を受けてコードを送る

- [ ] **Step 1: 失敗するテストを書く**

`send-challenge/route.test.ts`:

```ts
it('未認証なら 401', async () => {
  mockSession(null);
  expect((await POST(createRequest({}))).status).toBe(401);
});

it('method=totp のユーザーには送らない（アプリで生成できるため）', async () => {
  mockSession({ user: { id: 'u1' } });
  mockSecondFactorMethod('totp');

  expect((await POST(createRequest({}))).status).toBe(400);
  expect(mockSendSecondFactorCode).not.toHaveBeenCalled();
});

it('method=email_otp なら本人のアドレスへ送る', async () => {
  mockSession({ user: { id: 'u1' } });
  mockSecondFactorMethod('email_otp');
  mockUserEmail('owner@example.com');
  mockSendResult('sent');

  expect((await POST(createRequest({}))).status).toBe(200);
  expect(mockSendSecondFactorCode).toHaveBeenCalledWith(
    expect.anything(),
    'u1',
    'owner@example.com',
  );
});

// ⚠️ 宛先をボディから取らないことの回帰テスト
it('ボディの email は無視する', async () => {
  mockSession({ user: { id: 'u1' } });
  mockSecondFactorMethod('email_otp');
  mockUserEmail('owner@example.com');

  await POST(createRequest({ email: 'attacker@example.com' }));

  expect(mockSendSecondFactorCode).toHaveBeenCalledWith(
    expect.anything(),
    'u1',
    'owner@example.com',
  );
});

describe('処理順', () => {
  // TOTP_SETTINGS_VERIFY は原則（検証より前）、TWO_FACTOR_SEND は例外2（送信直前）
  it('レート制限超過なら、方式を読む前に 429', async () => {
    mockSession({ user: { id: 'u1' } });
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, retryAfter: 900 });

    expect((await POST(createRequest({}))).status).toBe(429);
    expect(mockGetSecondFactorMethod).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

- [ ] **Step 3: `send-challenge/route.ts` を作る**

```ts
/**
 * 設定変更のための第2要素コード送信API
 * POST /api/user/totp/send-challenge
 *
 * 無効化とリカバリーコード再発行は `requireSecondFactor` でコードを要求する。
 * TOTP なら手元の認証アプリで作れるが、メールOTP では**コードを取得する経路が
 * 必要**で、これが無いと設定を有効にした利用者は二度と無効化できない
 * （再セットアップも `TotpAlreadyEnabledError` で弾かれ、パスワードリセットは
 * 第2要素に触れないため、リカバリーコードを使い切ると詰む）。
 *
 * ⚠️ 宛先はセッションのユーザーに固定する。ボディの値は一切見ない（#641）。
 */
export async function POST() {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // 原則どおり、識別子が確定した直後に置く
    // （`.claude/rules/api-route.md`「レート制限と検証の順序」）
    const limitResponse = await checkSecondFactorRateLimit(
      supabase,
      session.user.id,
    );
    if (limitResponse) return limitResponse;

    const method = await getSecondFactorMethod(supabase, session.user.id);

    if (method !== SECOND_FACTOR_METHOD.EMAIL_OTP) {
      return errorResponse(
        ERROR_CODE.BAD_REQUEST,
        TOTP_ERROR_MESSAGES.NOT_CONFIGURED,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('id', session.user.id)
      .single();

    if (userError) throw userError;
    if (!user?.email) return unauthorizedResponse();

    // TWO_FACTOR_SEND の消費は sendSecondFactorCode の中（送信の直前＝例外2）
    const result = await sendSecondFactorCode(
      supabase,
      session.user.id,
      user.email,
    );

    // ... result ごとのレスポンス（SENT=200 / THROTTLED=429 /
    //     LIMIT_EXCEEDED=429 / SEND_FAILED=500）
  } catch (error) {
    // ...
  }
}
```

- [ ] **Step 4: `setup/route.ts` に `{ method }` を受けさせる**

`src/schema/totp.ts` に:

```ts
export const secondFactorSetupSchema = z.object({
  method: z.enum([SECOND_FACTOR_METHOD.TOTP, SECOND_FACTOR_METHOD.EMAIL_OTP]),
});
```

⚠️ **admin 発行アカウントのメールOTP をサーバー側で拒否する。**
画面だけの制限にしない。

```ts
    // admin 発行アカウントは users.email が generateSyntheticEmail() の
    // `.invalid` TLD（RFC 2606、絶対に名前解決されない）。選ばせると
    // コードが永久に届かず、設定途中のまま詰む
    if (result.data.method === SECOND_FACTOR_METHOD.EMAIL_OTP) {
      const { data: user } = await supabase
        .from('users')
        .select('username')
        .eq('id', session.user.id)
        .single();

      if (user?.username) {
        return errorResponse(
          ERROR_CODE.BAD_REQUEST,
          SECOND_FACTOR_MESSAGES.EMAIL_OTP_UNAVAILABLE,
          HTTP_STATUS.BAD_REQUEST,
        );
      }
    }
```

- [ ] **Step 5: `route.ts`（GET）に `method` を含める**

```ts
    const method = await getSecondFactorMethod(supabase, session.user.id);

    return NextResponse.json({
      success: true,
      data: {
        enabled: method !== null,
        method,
        // admin 発行アカウントには選択肢を出さないため、画面に伝える
        emailOtpAvailable: !user?.username,
        remainingRecoveryCodes,
      },
    });
```

- [ ] **Step 6: テストが通ることを確認する**

```bash
npx jest src/app/api/user/totp/
```

- [ ] **Step 7: `.claude/rules/api-route.md` の例外一覧表に追記する**

```markdown
| `user/totp/setup` POST（`TWO_FACTOR_SEND`） | 例外2 |
| `user/totp/send-challenge` POST（`TWO_FACTOR_SEND`） | 例外2 |
```

⚠️ 併せて同ファイルの `withAdminAuth` の注意書きの下に、
**この2ルートが「レート制限2本持ち」の初めての例**であることを書く
（`TOTP_SETTINGS_VERIFY` は原則、`TWO_FACTOR_SEND` は例外2）。

- [ ] **Step 8: コミット**

---

## Task 9: パスワードログイン経路

**Files:**
- Modify: `src/lib/auth/auth.ts`（`authorize` 内、現 :170 / :274 付近 と :115 / :131）
- Test: `src/lib/auth/auth.test.ts`

**Interfaces:**
- Consumes: Task 4 / Task 6
- Produces: `AUTH_ERROR_CODE.EMAIL_OTP_REQUIRED` を投げる経路

- [ ] **Step 1: 失敗するテストを書く**

```ts
it('method=email_otp でコード未入力なら EMAIL_OTP_REQUIRED を投げ、コードを送る', async () => {
  mockUser({ id: 'u1', email: 'u@e.com', password_hash: validHash });
  mockSecondFactorMethod('email_otp');

  await expect(authorize({ email: 'u@e.com', password: 'pw' })).rejects.toMatchObject({
    code: AUTH_ERROR_CODE.EMAIL_OTP_REQUIRED,
  });
  expect(mockSendSecondFactorCode).toHaveBeenCalledWith(
    expect.anything(),
    'u1',
    'u@e.com',
  );
});

it('method=totp ではメールを送らない', async () => {
  mockSecondFactorMethod('totp');

  await expect(authorize({ email: 'u@e.com', password: 'pw' })).rejects.toMatchObject({
    code: AUTH_ERROR_CODE.TOTP_REQUIRED,
  });
  expect(mockSendSecondFactorCode).not.toHaveBeenCalled();
});

// ⚠️ ユーザー名ログインでは authorize の email ローカル変数が空文字になる
it('ユーザー名ログインでも user.email を宛先にする', async () => {
  mockUser({ id: 'u1', email: 'owner@example.com', username: 'alice' });
  mockSecondFactorMethod('email_otp');

  await expect(authorize({ email: 'alice', password: 'pw' })).rejects.toThrow();
  expect(mockSendSecondFactorCode).toHaveBeenCalledWith(
    expect.anything(),
    'u1',
    'owner@example.com',
  );
});

it('送信に失敗したら SECOND_FACTOR_SEND_FAILED を投げる', async () => {
  mockSecondFactorMethod('email_otp');
  mockSendResult('send_failed');

  await expect(authorize({ email: 'u@e.com', password: 'pw' })).rejects.toMatchObject({
    code: AUTH_ERROR_CODE.SECOND_FACTOR_SEND_FAILED,
  });
});

// ⚠️ 再送のたびに login 枠（5回/30分）を食うと、打ち間違え2回で30分ロックされる
it('コード未入力での再呼び出しは login カウンタを消費しない', async () => {
  mockSecondFactorMethod('email_otp');

  await expect(authorize({ email: 'u@e.com', password: 'pw' })).rejects.toThrow();

  expect(mockCheckRateLimit).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    'login',
    expect.anything(),
    expect.anything(),
  );
});

it('login の上限超過は RATE_LIMITED コードで返す（「パスワードが違う」にしない）', async () => {
  mockCheckRateLimit.mockResolvedValueOnce({ allowed: false });

  await expect(authorize({ email: 'u@e.com', password: 'pw' })).rejects.toMatchObject({
    code: AUTH_ERROR_CODE.RATE_LIMITED,
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

- [ ] **Step 3: 第2要素の分岐を方式対応にする**

現 :274 の `if (await isTotpEnabled(...))` を:

```ts
        // 第2要素。パスワードが正しいことを確かめてからでないと、
        // 「二段階認証を使っているアカウントかどうか」を第三者に教えてしまう
        const secondFactorMethod = await getSecondFactorMethod(
          supabase,
          user.id,
        );

        if (secondFactorMethod !== null) {
          const totpCode = (
            credentials.totpCode as string | undefined
          )?.trim();

          if (!totpCode) {
            if (secondFactorMethod === SECOND_FACTOR_METHOD.EMAIL_OTP) {
              // ⚠️ 宛先は user.email。`email` ローカル変数はユーザー名
              // ログインで空文字になり、全ユーザー名アカウントが
              // otp_codes.email='' の1行を共有してコードが混線する
              const sendResult = await sendSecondFactorCode(
                supabase,
                user.id,
                user.email,
              );

              if (sendResult === SEND_SECOND_FACTOR_RESULT.SEND_FAILED) {
                // 「コードが違う」と区別する。打ち直しても直らない（#1148）
                throw new CredentialsSignInError(
                  AUTH_ERROR_CODE.SECOND_FACTOR_SEND_FAILED,
                );
              }

              // THROTTLED / LIMIT_EXCEEDED でも入力欄は出す。
              // 直前に送ったコードがまだ生きている可能性があり、
              // リカバリーコードも使える
              throw new CredentialsSignInError(
                AUTH_ERROR_CODE.EMAIL_OTP_REQUIRED,
              );
            }

            // クライアントはこれを受けて認証コードの入力欄を出す
            throw new CredentialsSignInError(AUTH_ERROR_CODE.TOTP_REQUIRED);
          }

          // 以降の TOTP_VERIFY レート制限と verifySecondFactor は方式共通
        }
```

- [ ] **Step 4: 再送で `login` カウンタを消費しないようにする**

`authorize` の冒頭、`login` レート制限（現 :122-132）の前に判定を置く。
「コード未指定かつ第2要素が有効」のときは第2要素の提示フェーズなので、
ログイン試行としては数えない。

⚠️ ただし**パスワード照合の前に第2要素の有無を読んではいけない**
（アカウント列挙になる）。`credentials.totpCode` の有無だけで判定し、
枠の消費を**成功判定の後にずらす**形にする。

- [ ] **Step 5: :115 / :131 を `CredentialsSignInError(RATE_LIMITED)` に揃える**

プレーンな `new Error` では Auth.js が `code` を載せず
（`auth.ts:254-259` のコメント参照）、`loginForm.tsx` の `resolveErrorMessage` が
default に落ちて「メールアドレスまたはパスワードが正しくありません」と出る。
パスワードは正しいのに30分間そう言われ続ける（#1247 と同じ形）。

識別子にIPが入り照合前に消費されるため、`rate_limited` を返してもアカウント列挙にはならない。

- [ ] **Step 6: テストが通ることを確認する**

```bash
npx jest src/lib/auth/auth.test.ts
```

- [ ] **Step 7: コミット**

---

## Task 10: OAuth 経路とセッション

**Files:**
- Modify: `src/lib/auth/auth.ts`（`jwt` 現 :575 / :602-640、`session` 現 :824-837）
- Modify: `src/types/next-auth.d.ts`
- Test: `src/lib/auth/auth.test.ts`

**Interfaces:**
- Produces: `session.secondFactorMethod`、`session.secondFactorSendFailed`、`update({ resend: true })`

- [ ] **Step 1: 失敗するテストを書く**

```ts
it('OAuth で method=email_otp なら totpPending を立ててコードを送る', async () => {
  mockSecondFactorMethod('email_otp');

  const token = await jwt({ token: {}, user: { id: 'u1' }, account: { provider: 'google' } });

  expect(token.totpPending).toBe(true);
  expect(mockSendSecondFactorCode).toHaveBeenCalled();
});

it('session に方式を載せる（画面が出し分けるため）', async () => {
  const result = await session({
    session: baseSession,
    token: { totpPending: true, secondFactorMethod: 'email_otp' },
  });

  expect(result.secondFactorMethod).toBe('email_otp');
  expect(result.user.id).toBe('');  // 第2要素が未了なので空のまま
});

it('update({ resend: true }) はコードを送り直し、totpPending を維持する', async () => {
  const token = await jwt({
    token: { id: 'u1', totpPending: true, secondFactorMethod: 'email_otp' },
    trigger: 'update',
    session: { resend: true },
  });

  expect(mockSendSecondFactorCode).toHaveBeenCalled();
  expect(token.totpPending).toBe(true);
});

// ⚠️ jwt コールバックからは例外を出せない（#1148）。フラグで伝える
it('送信に失敗したらトークンにフラグを立てる', async () => {
  mockSendResult('send_failed');

  const token = await jwt({
    token: { id: 'u1', totpPending: true, secondFactorMethod: 'email_otp' },
    trigger: 'update',
    session: { resend: true },
  });

  expect(token.secondFactorSendFailed).toBe(true);
});
```

- [ ] **Step 2: 落ちることを確認する**

- [ ] **Step 3: `jwt` コールバックを方式対応にする**

現 :575 の `token.totpPending = await isTotpEnabled(...)` を:

```ts
              // OAuth は Credentials と違い authorize を通らないため、
              // 第2要素はここで要求する。プロバイダ側の2FA設定に依存せず、
              // このアプリ独自の第2要素を必ず挟む
              const method = await getSecondFactorMethod(supabase, user.id);
              token.totpPending = method !== null;
              token.secondFactorMethod = method ?? undefined;

              if (method === SECOND_FACTOR_METHOD.EMAIL_OTP && user.email) {
                const sendResult = await sendSecondFactorCode(
                  supabase,
                  user.id,
                  user.email,
                );
                token.secondFactorSendFailed =
                  sendResult === SEND_SECOND_FACTOR_RESULT.SEND_FAILED;
              }
```

- [ ] **Step 4: `update({ resend: true })` を扱う**

現 :602 の `if (trigger === 'update' && token.totpPending && ...)` ブロックに、
`totpCode` が無く `resend` が true のときの分岐を足す。

```ts
          // ⚠️ 再送と検証は同じ `update()` 経路を共有する。NextAuth の JWT は
          // ステートレスで、`update()` は「Cookie を読む → jwt → 書き戻す」を
          // 独立に行うため、再送（Resend の往復で遅い）と検証（速い）が
          // 並行すると再送が後から totpPending:true を書き戻し、
          // 成功した検証が巻き戻る。
          // クライアント側で相互排他にすること（useTwoFactorChallenge）
```

- [ ] **Step 5: `session` コールバックで方式を渡す**

現 :824 の `if (token.totpPending)` ブロックに:

```ts
        session.secondFactorMethod = token.secondFactorMethod;
        session.secondFactorSendFailed = Boolean(token.secondFactorSendFailed);
```

`user` を空にする現行の扱いは変えない（第2要素が未了なのでログイン済みとして扱わない）。

- [ ] **Step 6: `src/types/next-auth.d.ts` を更新する**

- [ ] **Step 7: テストが通ることを確認する**

- [ ] **Step 8: コミット**

---

## Task 11: 設定画面

**Files:**
- Modify: `src/features/settings/twoFactorSettings/hooks/useTwoFactorSettings.ts`
- Modify: `src/features/settings/twoFactorSettings/twoFactorSettings.tsx`、`.module.scss`
- Test: `src/features/settings/twoFactorSettings/twoFactorSettings.test.tsx`

**Interfaces:**
- Consumes: `GET /api/user/totp`（`method` / `emailOtpAvailable`）、`POST /api/user/totp/setup`（`{ method }`）、`POST /api/user/totp/send-challenge`
- Produces: `TWO_FACTOR_VIEW.METHOD_SELECT` / `TWO_FACTOR_VIEW.SETUP_EMAIL`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
it('無効のとき、方式を選ぶボタンが2つ出る', async () => {
  mockStatus({ enabled: false, emailOtpAvailable: true });
  render(<TwoFactorSettings />);

  expect(await screen.findByRole('button', { name: /認証アプリ/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /メール/ })).toBeInTheDocument();
});

it('メールOTP を選ぶと安全性の注意が出る', async () => {
  mockStatus({ enabled: false, emailOtpAvailable: true });
  render(<TwoFactorSettings />);

  await userEvent.click(await screen.findByRole('button', { name: /メール/ }));

  expect(screen.getByText(/認証アプリより安全性が下がります/)).toBeInTheDocument();
});

// admin 発行アカウント（users.username あり）は宛先が .invalid
it('emailOtpAvailable が false ならメールの選択肢を出さない', async () => {
  mockStatus({ enabled: false, emailOtpAvailable: false });
  render(<TwoFactorSettings />);

  expect(await screen.findByRole('button', { name: /認証アプリ/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /メール/ })).not.toBeInTheDocument();
});

// ⚠️ これが無いと、メールOTP 利用者は無効化のコードを取得できない
it('method=email_otp で有効なとき、コード送信ボタンが出る', async () => {
  mockStatus({ enabled: true, method: 'email_otp' });
  render(<TwoFactorSettings />);

  expect(
    await screen.findByRole('button', { name: /コードを送信/ }),
  ).toBeInTheDocument();
});

it('method=totp で有効なとき、コード送信ボタンは出ない', async () => {
  mockStatus({ enabled: true, method: 'totp' });
  render(<TwoFactorSettings />);

  await screen.findByRole('button', { name: /無効にする/ });
  expect(screen.queryByRole('button', { name: /コードを送信/ })).not.toBeInTheDocument();
});

it('キーボードだけで方式を選べる', async () => {
  mockStatus({ enabled: false, emailOtpAvailable: true });
  render(<TwoFactorSettings />);

  await userEvent.tab();
  expect(screen.getByRole('button', { name: /認証アプリ/ })).toHaveFocus();
});
```

- [ ] **Step 2: 落ちることを確認する**

- [ ] **Step 3: フックに方式の状態を足す**

`TWO_FACTOR_VIEW` に `METHOD_SELECT` と `SETUP_EMAIL` を足し、
`startSetup` を `startSetup(method)` に変える。
`sendChallenge()` を足す。すべて `useCallback` で包む。

- [ ] **Step 4: コンポーネントを更新する**

`React.memo` + `displayName` を維持。クラス名は `cn()` と
`c_two_factor_settings__*` の既存規則に合わせる。
警告文は `role='alert'` ではなく通常の説明文にする
（選択前の説明であり、エラーではないため）。

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx jest src/features/settings/twoFactorSettings/
```

- [ ] **Step 6: コミット**

---

## Task 12: ログイン画面

**Files:**
- Modify: `src/features/auth/loginForm/loginForm.tsx`、`.module.scss`
- Test: `src/features/auth/loginForm/loginForm.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
it('EMAIL_OTP_REQUIRED ならメール向けの文言と再送ボタンを出す', async () => {
  mockSignIn({ error: 'x', code: AUTH_ERROR_CODE.EMAIL_OTP_REQUIRED });
  render(<LoginForm />);

  await submitCredentials();

  expect(screen.getByText(/メールに送った/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /再送/ })).toBeInTheDocument();
});

it('TOTP_REQUIRED では再送ボタンを出さない', async () => {
  mockSignIn({ error: 'x', code: AUTH_ERROR_CODE.TOTP_REQUIRED });
  render(<LoginForm />);

  await submitCredentials();

  expect(screen.queryByRole('button', { name: /再送/ })).not.toBeInTheDocument();
});

// ⚠️ 打ち間違えた状態で再送を押すと、そのコードが検証されて
// TOTP_VERIFY の枠（5回/15分）を1つ失う
it('再送はコードを空にしてから送る', async () => {
  mockSignIn({ error: 'x', code: AUTH_ERROR_CODE.EMAIL_OTP_REQUIRED });
  render(<LoginForm />);
  await submitCredentials();

  await userEvent.type(screen.getByLabelText('認証コード'), '000000');
  await userEvent.click(screen.getByRole('button', { name: /再送/ }));

  expect(mockSignIn).toHaveBeenLastCalledWith(
    'credentials',
    expect.not.objectContaining({ totpCode: '000000' }),
  );
});

it('再送の直後は60秒のカウントダウンで押せない', async () => {
  // ...
});

it('SECOND_FACTOR_SEND_FAILED は「コードが違う」と別の文言で出す', async () => {
  mockSignIn({ error: 'x', code: AUTH_ERROR_CODE.SECOND_FACTOR_SEND_FAILED });
  render(<LoginForm />);

  await submitCredentials();

  expect(screen.getByText(/送信できませんでした/)).toBeInTheDocument();
});
```

- [ ] **Step 2〜6**: 落ちることの確認 → 実装 → 通ることの確認 → コミット

実装の要点:
- `totpRequired` を `secondFactorMode: null | 'totp' | 'email_otp'` に変える
- 再送ハンドラは `setTotpCode('')` してから `signIn` を呼ぶ
- カウントダウンは `useOtpVerification` と同じ `OTP_CONFIG.RESEND_INTERVAL_SECONDS`
- カウントダウンの残り秒数は `aria-live='polite'` で読み上げる

---

## Task 13: OAuth の第2要素画面

**Files:**
- Modify: `src/features/auth/twoFactorChallenge/hooks/useTwoFactorChallenge.ts`、`twoFactorChallenge.tsx`
- Test: 同階層のテスト

- [ ] **Step 1: 失敗するテストを書く**

```tsx
it('method=email_otp なら再送ボタンを出す', async () => {
  mockSession({ totpPending: true, secondFactorMethod: 'email_otp' });
  render(<TwoFactorChallenge />);

  expect(screen.getByRole('button', { name: /再送/ })).toBeInTheDocument();
});

// ⚠️ 再送（遅い）と検証（速い）が並行すると、再送が後から
// totpPending:true を書き戻して成功した検証が巻き戻る
it('検証中は再送を押せない', async () => {
  mockSession({ totpPending: true, secondFactorMethod: 'email_otp' });
  mockUpdateNeverResolves();
  render(<TwoFactorChallenge />);

  await userEvent.type(screen.getByLabelText(/コード/), '123456');
  await userEvent.click(screen.getByRole('button', { name: '確認' }));

  expect(screen.getByRole('button', { name: /再送/ })).toBeDisabled();
});

it('再送中は確認を押せない', async () => {
  // ...
});
```

- [ ] **Step 2〜6**: 落ちることの確認 → 実装 → 通ることの確認 → コミット

実装の要点: `isResending` を足し、`isSubmitting` / `isCancelling` と同じ
相互排他に入れる（`useTwoFactorChallenge.ts:71` / `:124` の既存パターンに揃える）。

---

## Task 14: E2E とドキュメント

**Files:**
- Modify: `e2e/auth/twoFactor.spec.ts`、`e2e/helpers/api.ts`（`action` の union 拡張）、`e2e/helpers/totp.ts`
- Modify: `.claude/documents/authentication-flow.md`

- [ ] **Step 1: E2E ヘルパーの型を広げる**

`e2e/helpers/api.ts:1113-1115` の `action` 引数のリテラル union に
`'two_factor'` を足す。`findOtpCodeByHash`（:1137-1160）はそのまま使える
（`code_hash` から 000000〜999999 を総当たりしてコードを復元する）。

- [ ] **Step 2: 方式メールOTP のログインシナリオを足す**

```ts
test('メールOTP を第2要素にしてログインできる', async ({ page }) => {
  // 設定画面でメールOTP を有効化 → ログアウト → ログイン →
  // otp_codes から two_factor のコードを引いて入力 → ホームに入れる
});

test('メールOTP から TOTP に切り替えられる', async ({ page }) => {
  // 有効時ビューで「コードを送信」→ コード入力で無効化 →
  // 認証アプリを選んで再度有効化
});
```

⚠️ `E2E_TEST_MODE=true` + `OTP_EMAIL_TEST_BYPASS=true` で実送信は飛ぶ。
バイパスは `sendOtpEmail`（`src/lib/otp/sendOtpEmail.ts:40-49`）の内部にあり
`action` を見ないため、第2要素でも自動的に効く。

⚠️ E2E は3ブラウザが同じユーザーを共有する。「初期値はこう」というアサーションは
フレークするので、各シナリオで方式を明示的に設定してから検証する。

⚠️ ローカルで流すときは**1ブラウザずつ**。3ブラウザ同時は信号にならない。
終了コードは件数行で判定する（`echo` で潰さない）。

- [ ] **Step 3: E2E を流す**

```bash
npx playwright test e2e/auth/twoFactor.spec.ts --project=chromium
```

実行後、コミット前に `git checkout -- docs/e2e-screenshots/` で
E2E が書き換えたコミット済みスクショを戻す。

- [ ] **Step 4: `.claude/documents/authentication-flow.md` を更新する**

現在 TOTP の記述は :846 の「二要素認証（TOTP）: 不要（対象外）」の1行だけで、
実装と乖離している。以下を新規に書く。

- 第2要素の方式（TOTP / メールOTP）と選び方
- 方式ごとのログインフロー（パスワード経路・OAuth 経路）
- メールOTP を選んだ場合の強度の限界（パスワードリセットと同じ受信箱）
- 設定変更に第2要素が要ること、`send-challenge` の位置づけ
- リカバリーコードが方式を問わず使えること
- admin 発行アカウントでメールOTP が使えないこと

- [ ] **Step 5: カバレッジを確認する**

```bash
npx jest --coverage --collectCoverageFrom='src/lib/auth/**' --collectCoverageFrom='src/features/auth/**' --collectCoverageFrom='src/app/api/user/totp/**'
```

全指標80%以上であること。

- [ ] **Step 6: 最終チェックとコミット**

```bash
npm run prettier
npm run lint          # prettier の後に再実行（disable コメントの位置がずれる）
npx prettier --check .
git add -A
git commit -m "test(auth): 第2要素の方式別 E2E とドキュメントを足す

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## PR

```bash
gh pr create --assignee Fn-front \
  --title "feat(auth): 二段階認証の第2要素を TOTP / メールOTP から選べるようにする"
```

本文は `.claude/CLAUDE.md` の構成（概要 / ロードマップ / レビューポイント / テスト）に従い、
`Closes #1261` を入れる。画面に変化があるので
`.claude/rules/visual-evidence.md` に従い Before/After と動作動画を添付する。

**レビューポイントに必ず書くこと:**
- `src/schema/otp.ts` を許可リスト方式に変えた理由（`OTP_ACTION` への追加が
  公開ルートを開く結合があった）
- テーブルをリネームしなかった理由（先行適用でログインが全滅する）
- `send-challenge` を足した理由（無ければメールOTP 利用者が無効化できない）

PR 作成後は**マージ承認を待つ**。`gh pr merge` を自動で実行しない。

---

## Self-Review

**1. Spec coverage**

| 仕様書の節 | 対応するタスク |
|---|---|
| §1 データモデル | Task 1 |
| §1 許可リスト2本 | Task 1 |
| §2 送信経路4本 | Task 6（集約）、Task 8（経路4）、Task 9（経路1）、Task 10（経路2） |
| §2-1 公開ルートを閉じる | Task 3 |
| §2-2 経路4 | Task 8 |
| §2-3 レート制限・FAIL_CLOSED・送信失敗の後始末 | Task 2、Task 6 |
| §2-4 再送で login を消費しない | Task 9 |
| §3 検証層 | Task 4、Task 5 |
| §4 設定画面 | Task 11 |
| §4 ログイン画面 | Task 12 |
| §4 OAuth 画面 | Task 13 |
| §5 エラー処理 | Task 2（定数）、Task 9、Task 10 |
| §6 テスト | 各タスクに内包、Task 14 で E2E とカバレッジ |
| admin 発行アカウントの除外 | Task 8（サーバー）、Task 11（画面） |

**2. 既知の未解決**

- Task 6 Step 4 の `releaseRateLimit` は RPC の実装が要る。
  `consume_rate_limit` の対になる関数を `.claude/rules/supabase-db.md` の
  権限ルール（`SECURITY INVOKER` / `search_path` / `REVOKE` + `GRANT`）に
  従って別マイグレーションで足すこと
- Task 9 Step 4 の「`login` カウンタを消費しない」は、アカウント列挙を
  起こさない形に収める必要がある。パスワード照合の前に第2要素の有無を
  読んではいけない

**3. 型の一貫性**

`getSecondFactorMethod` / `verifySecondFactor` / `SECOND_FACTOR_VERIFY_RESULT` /
`sendSecondFactorCode` / `SEND_SECOND_FACTOR_RESULT` /
`startSecondFactorSetup` / `confirmSecondFactorSetup` は全タスクで表記を統一した。
`SECOND_FACTOR_METHOD.TOTP` / `.EMAIL_OTP` と DB の `'totp'` / `'email_otp'` も一致。
