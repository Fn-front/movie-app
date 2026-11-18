# 二段階認証の第2要素を選択制にする 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 二段階認証の第2要素を、TOTP 固定から「TOTP / メールOTP のどちらかをユーザーが選ぶ」方式に変える。

**Architecture:** `user_totp` に `method` 列を足すだけでテーブルはリネームしない（リネームは本番の全ログインを落とす窓を作るため）。第2要素のコードは `otp_codes` を `action_type='two_factor'` で再利用し、**コードを送れる経路を認証済みの4本に限定**する。判定の入口は `isTotpEnabled`（真偽値）から `getSecondFactorMethod`（方式）に置き換える。

**Tech Stack:** Next.js App Router / NextAuth.js (Auth.js v5) / Supabase (PostgREST + service_role) / zod v4 / Jest + React Testing Library / Playwright / Resend

**Spec:** `docs/superpowers/specs/2026-11-18-second-factor-method-choice-design.md`

## Global Constraints

- **テーブル名・API ルートのパスを変更しない。** `user_totp` / `totp_recovery_codes` / `/api/user/totp/**` は据え置き。TypeScript 内部の識別子・ファイル名のみ変更する
- **ENUM 型を作らない。** `VARCHAR + CHECK` を使う（既存マイグレーションに `CREATE TYPE` は0件）
- **`OTP_ACTION` に `two_factor` を足さない。** `src/schema/otp.ts:11-14` が `Object.values(OTP_ACTION)` から公開ルートの zod enum を導出しているため、足すと公開2ルートが受理する
- **第2要素のメール宛先は必ず `user.email`。** `authorize` スコープの `email` ローカル変数はユーザー名ログインで空文字（`src/lib/auth/auth.ts:89`）
- **DBエラーを握り潰さない。** `getSecondFactorMethod` は `throw toDbError(...)` を維持（fail-closed）
- **新しい RPC を作らない。** 枠の戻しは既存の `resetRateLimit` を使う（理由は Task 6）
- **レート制限は送信系と検証系で重ねない。** 送信は `TWO_FACTOR_SEND` のみ、検証は `TOTP_SETTINGS_VERIFY` のみ
- コンポーネントは `React.memo` + `useCallback` + `displayName` 必須
- SCSS Modules。HTML要素を直接セレクタにしない。デザインシステム変数を使う
- テストは対象ファイルと同階層。カバレッジは全指標80%以上
- コマンド: `npx jest <path>` / `npm run lint` / `npm run prettier` → **その後 `npm run lint` を再実行**（disable コメントの位置がずれて CI だけ落ちる）

### ⚠️ レート制限の上限は「レート」ではない

`consume_rate_limit`（`supabase/migrations/20261019013008_make_consume_rate_limit_sliding_window.sql:65-66`）が
`attempts` をリセットするのは **`last_attempt_at <= now() - windowMinutes`**、つまり
「その窓のあいだ一度もアクセスが無い」ときだけ。`src/constants/rateLimit.ts:238-241` が
明記しているとおり、`maxAttempts` は**アイドルを挟むまでの通算回数**。

窓を長くすると、通常利用でカウンタが単調増加して必ず到達する。本機能の最悪の失敗は
「ログインできない」なので、**窓は短く取る**。

### 用語

| 語                       | 意味                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| **TOTP**                 | 認証アプリが生成する6桁。RFC 6238。通信しない                                             |
| **メールOTP（第2要素）** | `otp_codes.action_type='two_factor'` の6桁。本計画で追加                                  |
| **メールOTPログイン**    | 既存のパスワードレス経路（`OTP_ACTION.LOGIN`）。**第2要素とは別物。本計画では塞いだまま** |

---

## File Structure

| ファイル                                                           | 責務                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------ |
| `supabase/migrations/<ts>_add_second_factor_method.sql`            | `method` 列・CHECK 2本・`action_type` 許可リスト2本・COMMENT |
| `src/constants/secondFactor.ts`（新規）                            | 方式の定数、`TWO_FACTOR_OTP_ACTION`、第2要素用の文言         |
| `src/lib/auth/secondFactor.ts`（`totpVerification.ts` をリネーム） | 方式の取得と検証                                             |
| `src/lib/auth/sendSecondFactorCode.ts`（新規）                     | 第2要素コードの生成・保存・送信。枠の消費と後始末を内包      |
| `src/helpers/secondFactorGuard.ts`（`totpGuard.ts` をリネーム）    | 設定変更のガード                                             |
| `src/lib/auth/totpSetup.ts`                                        | 方式ごとの開始・確定。ファイル名は据え置き                   |
| `src/app/api/user/totp/send-challenge/route.ts`（新規）            | 設定変更のためのコード送信（経路4）                          |
| `src/features/auth/hooks/useResendCountdown.ts`（新規）            | 60秒カウントダウン。ログイン画面と第2要素画面で共用          |

### 依存の順序

```
Task 0 (環境) → Task 1 (DB) → Task 2 (定数)
                                  ↓
     Task 3 (公開ルート)  Task 3.5 (RATE_LIMITED)   ← どちらも独立。先に単独で入る
                                  ↓
     Task 4a (リネーム) → Task 4b (方式分岐) → Task 5 (ガード) → Task 6 (送信)
                                  ↓
     Task 7 (setup) → Task 8 (API) → Task 9 (パスワード経路) → Task 10 (OAuth)
                                  ↓
     Task 11 (設定) → Task 12 (ログイン) → Task 13 (第2要素画面) → Task 14 (E2E)
```

---

## Task 0: worktree をセットアップする

この worktree には `node_modules` も `.env.local` も無い。**Task 1 以降が即座に詰まる。**

- [ ] **Step 1: 依存をインストールする**

```bash
npm install
```

⚠️ シンボリックリンクでの共用は不可（Next.js のビルドが壊れる）。実体を入れる。

- [ ] **Step 2: `.env.local` を元のチェックアウトからコピーする**

```bash
cp ../../../.env.local .env.local
```

`.gitignore` 対象なのでコミットされない。

- [ ] **Step 3: 動くことを確認する**

```bash
npx jest src/constants/ --silent
```

期待: PASS

---

## Task 1: マイグレーションと型生成

**Files:**

- Create: `supabase/migrations/<timestamp>_add_second_factor_method.sql`
- Modify: `src/types/database.types.ts`（再生成）

**Interfaces:**

- Produces: `user_totp.method`（`'totp' | 'email_otp'`）、`otp_codes.action_type` が `'two_factor'` を、`rate_limits.action_type` が `'two_factor_send'` を受理

- [ ] **Step 1: マイグレーションファイルを作る**

```bash
npx supabase migration new add_second_factor_method
```

- [ ] **Step 2: `user_totp` の変更を書く**

```sql
-- 二段階認証の第2要素を選択制にする
--
-- ⚠️ テーブルはリネームしない。`getSecondFactorMethod` は2FA未設定の利用者も
-- 含め全ログインで呼ばれ、DBエラーで意図的に throw する（fail-closed）。
-- DBが1つしかなくスキーマ変更をリモートへ先行適用する運用のため、RENAME は
-- 旧コードが動いている本番DBに先に当たり、全経路でログインできなくなる。
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
  '二段階認証の設定。1ユーザー1件（user_id が主キー）なので方式は排他になる。
   method=totp なら encrypted_secret に共有鍵、email_otp ならコードは otp_codes
   （action_type=two_factor）側に持つ。Data APIには公開せず service_role 経由でのみ扱う。
   ※ 名前は TOTP 専用だった頃の名残。リネームすると旧コードが動いている間
   ログインが全滅するため据え置いている';

COMMENT ON COLUMN user_totp.method IS
  '第2要素の方式。totp=認証アプリ / email_otp=メールのワンタイムコード';

COMMENT ON COLUMN user_totp.encrypted_secret IS
  'AES-256-GCM で暗号化した共有鍵。形式は iv:authTag:暗号文（base64）。
   method=email_otp のときは NULL';

COMMENT ON COLUMN user_totp.last_used_counter IS
  '最後に検証を通した時間ステップ。同じコードの使い回しを拒否するために使う。
   method=email_otp では使わない（消費は otp_codes 行の削除で表す）';
```

- [ ] **Step 3: `otp_codes` の許可リストを書く**

```sql
-- ⚠️ src/constants/secondFactor.ts の TWO_FACTOR_OTP_ACTION と一致させること。
-- OTP_ACTION（src/constants/otp.ts）には**足さない** — そちらは
-- src/schema/otp.ts 経由で公開ルートの zod enum になる。
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
```

現行は `supabase/migrations/20260312000000_phase8_auth_tables.sql:84` の3値のみで、
以後の再定義は無い。上の4値で全部。

- [ ] **Step 4: `rate_limits` の許可リストを書く**

🚫 **この計画に値の一覧を書かない。** 許可リストは DROP → ADD の**上書き**で、
1つでも書き漏らすとそのレート制限が無言で死ぬ（#546 / #659 で2度発生）。
計画や記憶から写すのではなく、**現行ファイルから機械的にコピーする。**

```bash
# 現行の定義（35値）をそのまま開く
sed -n '18,71p' supabase/migrations/20261106095759_add_admin_role_check_rate_limit_action.sql
```

この `ALTER TABLE ... ADD CONSTRAINT chk_action_type CHECK (...)` を丸ごとコピーし、
末尾の `'otp_resend'` の**直前**に以下を挿入する。既存の値は1つも消さない。

```sql
      -- 第2要素コードのメール送信（#1261 で追加）
      'two_factor_send',
```

- [ ] **Step 5: 許可リストに漏れが無いことを機械的に確かめる**

目視では必ず取りこぼす。差分を取る。

```bash
# 新マイグレーションの値
grep -oE "'[a-z_]+'" supabase/migrations/<新ファイル>.sql \
  | tr -d "'" | sort -u > /tmp/new.txt
# 現行の値
grep -oE "'[a-z_]+'" supabase/migrations/20261106095759_add_admin_role_check_rate_limit_action.sql \
  | tr -d "'" | sort -u > /tmp/old.txt
# 期待: two_factor_send（と user_totp 側で使う totp/email_otp）だけが増えている
comm -13 /tmp/old.txt /tmp/new.txt
# 期待: 空（1行でも出たら消してしまっている）
comm -23 /tmp/old.txt /tmp/new.txt
```

さらに TS 側との突き合わせ:

```bash
grep -oE ": '[a-z_]+'" src/constants/rateLimit.ts | grep -oE "'[a-z_]+'" | tr -d "'" | sort -u
```

- [ ] **Step 6: 既存行を壊さないことを適用前に確認する**

```sql
BEGIN;
-- マイグレーションの内容を貼って実行
SELECT count(*) FROM user_totp WHERE encrypted_secret IS NULL;
-- 期待: 0（1件でもあれば chk_secret_matches_method で落ちる）
SELECT DISTINCT action_type FROM rate_limits;
-- 期待: すべて新しい許可リストに含まれている
ROLLBACK;
```

- [ ] **Step 7: 適用する（⏸ ユーザーの指示待ち。2026-11-18 時点で未実行）**

⚠️ シェルから `.env.local` を source できない（worktree 隔離で拒否される）。
node 経由で環境変数を読み込んでから CLI を起動する。トークンはコマンドラインに出さない。

```bash
node --env-file=.env.local -e "
const r = require('child_process').spawnSync('npx',['supabase','db','push','--dry-run'],{encoding:'utf8'});
console.log(r.stdout, r.stderr);"
```

初回は `LegacyProjectNotLinkedError` になる。worktree は未リンクなのでリンクする
（ref は `npx supabase projects list` で引く。movie-app = `ffadavddxvpijvizsznk`）。

「リモートにあるがローカルに無い」（`LegacyDbPushMissingLocalError`）で拒否されたら
`.claude/rules/supabase-db.md` の「安全な回避手順」に従い、先行分を一時的に置いてから
push し、終わったら消す。**`migration repair --status reverted` は実行しない。**

2026-11-18 時点では `20261118061430_release_rate_limit_rpc.sql`（#1260 のブランチ）が
先行している。

- [ ] **Step 7b: 適用後に型を再生成する（⏸ Step 7 とセット）**

⚠️ **適用前でも実装は進められる。** `createServiceRoleClient`
（`src/helpers/supabase.ts:24`）は `createClient` に `Database` ジェネリクスを
渡していないため、`database.types.ts` は `from('user_totp')` のクエリを型で縛らない。

- [ ] **Step 8: GRANT が増えていないことを実測する**

`user_totp` の防御の本体は `20261017160000_revoke_totp_table_grants.sql` の REVOKE。

```sql
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_name IN ('user_totp', 'totp_recovery_codes')
   AND grantee IN ('anon', 'authenticated');
-- 期待: 0行
```

- [ ] **Step 9: 型を再生成する**

⚠️ `SUPABASE_PROJECT_ID` という環境変数は `.env.local` に**存在しない**。
ref を CLI から引く。

```bash
set -a; . ./.env.local; set +a
npx supabase projects list        # movie-app の REFERENCE ID を確認
npx supabase gen types typescript --project-id <ref> > src/types/database.types.ts
```

`user_totp` の `Row` に `method: string` が増え、`encrypted_secret` が
`string | null` になっていることを確認する。

- [ ] **Step 10: コミット**

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

- Create: `src/constants/secondFactor.ts` + `.test.ts`
- Modify: `src/constants/rateLimit.ts`、`email.ts`、`auth.ts`、`apiEndpoints.ts`、`index.ts`
- Modify: `src/lib/otp/sendOtpEmail.ts`（引数型を広げる）

**Interfaces:**

- Produces:
  - `SECOND_FACTOR_METHOD = { TOTP: 'totp', EMAIL_OTP: 'email_otp' }` / `type SecondFactorMethod`
  - `TWO_FACTOR_OTP_ACTION = 'two_factor'` / `type TwoFactorOtpAction`
  - `SECOND_FACTOR_MESSAGES`
  - `RATE_LIMIT_ACTION.TWO_FACTOR_SEND = 'two_factor_send'`
  - `RATE_LIMIT_CONFIG.TWO_FACTOR_SEND = { maxAttempts: 10, windowMinutes: 60 }`
  - `AUTH_ERROR_CODE.EMAIL_OTP_REQUIRED` / `.SECOND_FACTOR_SEND_FAILED` / `.SECOND_FACTOR_SEND_LIMITED`
  - `API_ENDPOINTS.USER_TOTP_SEND_CHALLENGE`
  - `OtpEmailAction = OtpAction | TwoFactorOtpAction`

- [ ] **Step 1: 失敗するテストを書く**

`src/constants/secondFactor.test.ts`:

```ts
import { TWO_FACTOR_OTP_ACTION, SECOND_FACTOR_METHOD } from './secondFactor';
import { OTP_ACTION } from './otp';
import {
  FAIL_CLOSED_ACTIONS,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from './rateLimit';

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

  // ⚠️ consume_rate_limit は窓のあいだアイドルが無いとリセットしない。
  // 窓が長いと通常利用でカウンタが単調増加して必ず到達し、
  // しかも超過時のロックがその窓の長さだけ続く（rateLimit.ts:238-241）
  it('送信上限の窓は1時間以内（長いと通常利用でロックアウトする）', () => {
    expect(RATE_LIMIT_CONFIG.TWO_FACTOR_SEND.windowMinutes).toBeLessThanOrEqual(
      60,
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
 * 第2要素のコードは認証済みの4経路（`sendSecondFactorCode`）からしか作らない。
 */
export const TWO_FACTOR_OTP_ACTION = 'two_factor' as const;

export type TwoFactorOtpAction = typeof TWO_FACTOR_OTP_ACTION;

/**
 * 第2要素の利用者向け文言
 */
export const SECOND_FACTOR_MESSAGES = {
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
  CODE_SENT: '確認コードをメールに送信しました。',
  /** 送信に失敗した（「コードが違う」と区別する） */
  SEND_FAILED:
    '確認コードを送信できませんでした。しばらく待ってからお試しください。',
  /**
   * 送信上限に達した
   *
   * ⚠️ 「メールに送りました」と同じ画面にしてはいけない。1通も送っていないのに
   * コードを待たせることになる。この状態の出口はリカバリーコードだけなので、
   * そこへ誘導する
   */
  SEND_LIMIT_EXCEEDED:
    '確認コードの送信回数が上限に達しました。リカバリーコードを入力してログインしてください。',
  /** admin 発行アカウントはメールOTP を選べない */
  EMAIL_OTP_UNAVAILABLE:
    'このアカウントにはメールアドレスが登録されていないため、メールのコードは利用できません。',
} as const;
```

- [ ] **Step 4: `src/constants/rateLimit.ts` に追記する**

`RATE_LIMIT_ACTION` に:

```ts
  /**
   * 第2要素コードのメール送信（ユーザー単位）
   *
   * `OTP_SEND_DAILY` とカウンタを分ける。共有すると、ログインの多さが
   * 新規登録のメール確認（auth/register:159）とパスワード変更の本人確認
   * （auth/otp/send:228）を巻き添えにする。#940 と同じ発想。
   */
  TWO_FACTOR_SEND: 'two_factor_send',
```

`FAIL_CLOSED_ACTIONS` の「メールのワンタイムコード」ブロックに:

```ts
  // 第2要素の送信。通さないとログインできないが、通すと上限が無言で消える。
  // 第2要素は「送れないこと」より「無制限に送れること」のほうが危険
  RATE_LIMIT_ACTION.TWO_FACTOR_SEND,
```

`RATE_LIMIT_CONFIG` に:

```ts
  /**
   * 第2要素コードのメール送信。
   *
   * ⚠️ **窓を長くしてはいけない。** `consume_rate_limit` がリセットするのは
   * 「窓のあいだ一度もアクセスが無い」ときだけで、`maxAttempts` は
   * レートではなく**アイドルを挟むまでの通算回数**（上の #934 の説明を参照）。
   *
   * 当初案の `{ 20, 1440 }` は「20通/日」にならない。24時間まるごと送信が
   * 無い日を挟まない限りカウンタが単調増加し、1日2回ログインする利用者は
   * 10日ほどで到達して**24時間ログイン不能**になる。
   *
   * 1時間窓なら1時間のアイドルで戻り、超過してもロックは1時間で済む。
   * 持続レートは60秒の再送間隔（最大60通/時）が別途抑える。
   */
  TWO_FACTOR_SEND: { maxAttempts: 10, windowMinutes: 60 },
```

- [ ] **Step 5: `src/constants/email.ts` を第2要素に対応させる**

`OTP_PURPOSE_LABEL`（:20）は網羅的 `Record` なので、型を広げないとコンパイルエラーになる。

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

`buildOtpEmailSubject` / `buildOtpEmailText` の引数型を `OtpEmailAction` に広げる。

- [ ] **Step 6: `src/lib/otp/sendOtpEmail.ts` の引数型を広げる**

現在 `action: OtpAction`（:29）。`OtpEmailAction` に変える。
これを忘れると Task 6 が **TS2345** で落ちる。

- [ ] **Step 7: `src/constants/auth.ts` にエラーコードを足す**

```ts
  /** 第2要素（メールOTP）の入力が必要。パスワードは正しい */
  EMAIL_OTP_REQUIRED: 'email_otp_required',
  /** 第2要素のコードを送信できなかった。打ち直しても直らない */
  SECOND_FACTOR_SEND_FAILED: 'second_factor_send_failed',
  /** 送信上限。1通も送っていないので、リカバリーコードへ誘導する */
  SECOND_FACTOR_SEND_LIMITED: 'second_factor_send_limited',
```

`AUTH_ERROR_MESSAGES` にも対応する文言を足す（`SECOND_FACTOR_MESSAGES` を再利用してよい）。

- [ ] **Step 8: `src/constants/apiEndpoints.ts` に足す**

```ts
  USER_TOTP_SEND_CHALLENGE: '/api/user/totp/send-challenge',
```

- [ ] **Step 9: `src/constants/index.ts` から再エクスポートする**

- [ ] **Step 10: テストが通ることを確認する**

```bash
npx jest src/constants/
```

- [ ] **Step 11: コミット**

```bash
npm run prettier && npm run lint
git add src/constants src/lib/otp/sendOtpEmail.ts
git commit -m "feat(auth): 第2要素の方式と送信上限の定数を足す

two_factor は OTP_ACTION に入れない。schema/otp.ts が Object.values から
公開ルートの zod enum を導出しているため、足すと /api/auth/otp/send が
未認証で任意アドレスへ送れるようになる。

送信上限の窓は60分。consume_rate_limit は窓のあいだアイドルが無いと
リセットしないため、1440分窓では通常利用でカウンタが単調増加する。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 公開2ルートが `two_factor` を拒否することを固定する

**このタスクは単独で価値がある。** 先に入れることで、以降の作業中に穴が開いた状態を作らない。

**Files:**

- Modify: `src/schema/otp.ts` + `.test.ts`
- Modify: `src/app/api/auth/otp/send/route.ts` + `.test.ts`

**Interfaces:**

- Consumes: `TWO_FACTOR_OTP_ACTION`（Task 2）
- Produces: `PUBLIC_OTP_ACTIONS`

- [ ] **Step 1: 失敗するテストを書く**

`src/schema/otp.test.ts` に:

```ts
describe('公開ルートの action 許可リスト', () => {
  it('公開するのは registration / login / password_change の3つだけ', () => {
    expect([...PUBLIC_OTP_ACTIONS].sort()).toEqual([
      'login',
      'password_change',
      'registration',
    ]);
  });

  it('otpSendSchema は two_factor を拒否する', () => {
    expect(
      otpSendSchema.safeParse({
        email: 'user@example.com',
        action: TWO_FACTOR_OTP_ACTION,
      }).success,
    ).toBe(false);
  });

  it('otpVerifySchema は two_factor を拒否する', () => {
    expect(
      otpVerifySchema.safeParse({
        email: 'user@example.com',
        code: '123456',
        action: TWO_FACTOR_OTP_ACTION,
      }).success,
    ).toBe(false);
  });
});
```

⚠️ **ルート側の「`two_factor` で400」テストは、現状でも既にパスする**
（`z.enum(Object.values(OTP_ACTION))` が既に弾くため）。落ちるのは
`PUBLIC_OTP_ACTIONS` が未定義であることだけ。これは**回帰テストとして置く**
もので、TDD の「赤→緑」にはならない。その旨をテストのコメントに書く。

- [ ] **Step 2: 落ちることを確認する**

```bash
npx jest src/schema/otp.test.ts
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
```

`otpSendSchema` / `otpVerifySchema` の `z.enum` をこれに差し替え、
`otpActionValues` を削除する。

- [ ] **Step 4: `send/route.ts` の分岐末尾に `else` を足す**

`else if (action === OTP_ACTION.LOGIN) { ... }` の直後（現 :168 付近）に:

```ts
    } else if (action !== OTP_ACTION.PASSWORD_CHANGE) {
      // ⚠️ 二重の歯止め。一次防御は zod（PUBLIC_OTP_ACTIONS）で、
      // **現時点ではこの分岐に到達しない**。将来 PUBLIC_OTP_ACTIONS に
      // 用途が足されたときのための保険として置く。
      //
      // この分岐チェーンに else が無かった頃は、未知の action が
      // ユーザー存在チェックも宛先固定（:69 の password_change 分岐）も
      // 通らないまま、再送間隔 → 日次上限 → INSERT → sendOtpEmail へ
      // 素通りした。公開ルートなので未認証で到達できる。
      //
      // 到達不能なのでカバレッジには出ない。消さないこと。
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

既存テストも全て緑であること（公開3用途の挙動は変えていない）。

- [ ] **Step 6: コミット**

---

## Task 3.5: ログインのレート制限超過を `RATE_LIMITED` で返す

**本機能と独立した既存バグの修正。** 先に単独で入れる。

**Files:**

- Modify: `src/lib/auth/auth.ts:115`、`:131`
- Test: `src/lib/auth/auth.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
it('LOGIN_IP の上限超過は RATE_LIMITED コードで返す', async () => {
  mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, retryAfter: 900 });

  await expect(authorize(validCredentials)).rejects.toMatchObject({
    code: AUTH_ERROR_CODE.RATE_LIMITED,
  });
});

it('login（アカウント×IP）の上限超過も RATE_LIMITED', async () => {
  // ⚠️ 1層目（LOGIN_IP）を明示的に通してから2層目を落とす。
  // mockResolvedValueOnce を1つだけ積むと1層目が消費して、
  // 固定したい2層目を何も検証しないまま緑になる
  mockCheckRateLimit
    .mockResolvedValueOnce({ allowed: true })
    .mockResolvedValueOnce({ allowed: false, retryAfter: 1800 });

  await expect(authorize(validCredentials)).rejects.toMatchObject({
    code: AUTH_ERROR_CODE.RATE_LIMITED,
  });
  expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
    2,
    expect.anything(),
    expect.anything(),
    'login',
    expect.anything(),
    expect.anything(),
  );
});
```

- [ ] **Step 2: 落ちることを確認する**

- [ ] **Step 3: 実装する**

`auth.ts:115` と `:131` の `throw new Error(AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED)` を
`throw new CredentialsSignInError(AUTH_ERROR_CODE.RATE_LIMITED)` に変える。

コメントを添える:

```ts
// プレーンな Error だと Auth.js が code を載せず（:254-259）、
// クライアントの resolveErrorMessage が default に落ちて
// 「メールアドレスまたはパスワードが正しくありません」と出る。
// パスワードが正しくてもそう言われ続ける（#1247 と同じ形）。
//
// 識別子にIPが入り、照合より前に消費されるので、
// rate_limited を返してもアカウント列挙にはならない
```

- [ ] **Step 4: ログイン画面に文言があることを確認する**

`loginForm.tsx` の `resolveErrorMessage` が `RATE_LIMITED` を扱っているか見る。
無ければ足す。

- [ ] **Step 5: テスト → コミット**

---

## Task 4a: 検証層をリネームする（ロジックは変えない）

**リネームと方式分岐を分ける。** 一度に両方やると、テストが落ちたときに
「名前の直し漏れ」か「ロジックの誤り」かを切り分けられない。

**Files:**

- Rename: `src/lib/auth/totpVerification.ts` → `secondFactor.ts`（+ `.test.ts`）
- Modify: `src/lib/auth/auth.ts`、`src/helpers/totpGuard.ts`、`src/app/api/user/totp/route.ts`
- Modify: `src/lib/auth/auth.test.ts`、`src/helpers/totpGuard.test.ts`、`src/app/api/user/totp/route.test.ts`

**Interfaces:**

- Produces: `getSecondFactorMethod(supabase, userId): Promise<SecondFactorMethod | null>`、`SECOND_FACTOR_VERIFY_RESULT`

- [ ] **Step 1: ファイルをリネームする**

```bash
git mv src/lib/auth/totpVerification.ts src/lib/auth/secondFactor.ts
git mv src/lib/auth/totpVerification.test.ts src/lib/auth/secondFactor.test.ts
```

- [ ] **Step 2: `isTotpEnabled` を `getSecondFactorMethod` にする**

```ts
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

  // ⚠️ **error を握り潰して null に倒してはいけない。**（以下、元の長い
  // コメントをそのまま維持する。理由は方式が増えても変わらない）
  if (error) throw toDbError(error, 'read user_totp');

  return (data?.method as SecondFactorMethod | undefined) ?? null;
}
```

`TOTP_VERIFY_RESULT` → `SECOND_FACTOR_VERIFY_RESULT` にリネーム。
**後方互換の別名は作らない**（残すと呼び出し元が両方使い始める）。

- [ ] **Step 3: 呼び出し元のソース3ファイルを直す**

`isTotpEnabled` の呼び出しは5か所:
`auth.ts:170` / `:274` / `:575`、`totpGuard.ts:89`、`api/user/totp/route.ts:48`。

真偽値が要る箇所は `Boolean(await getSecondFactorMethod(...))` にする。

⚠️ **`!== null` ではなく `Boolean(...)` を使う。** モックが未設定で `undefined` を
返したとき、`undefined !== null` は **true**（第2要素が有効）に倒れる。
テストの取り違えが「2FA が有効」側に転ぶのは危険なほうへの誤りなので、
`Boolean()` で `undefined` も false に落とす。

- [ ] **Step 4: テスト3ファイルの `jest.mock` パスを直す**

`jest.mock('@/lib/auth/totpVerification')` が3か所:
`auth.test.ts:119`、`totpGuard.test.ts:15`、`api/user/totp/route.test.ts:28`。
パスを変えないと即座に `Cannot find module` で落ちる。

- [ ] **Step 5: モックの戻り値を全置換する**

`mockIsTotpEnabled` は **42箇所**（`auth.test.ts` 29 / `user/totp/route.test.ts` 8 /
`totpGuard.test.ts` 5）。すべて boolean を返す前提。

```
mockResolvedValue(false) → mockResolvedValue(null)
mockResolvedValue(true)  → mockResolvedValue('totp')
```

⚠️ `auth.test.ts:187` の `beforeEach` 既定値を直し忘れると、2FA と無関係な
ログインテスト約20本が「第2要素が有効」扱いになって落ちる。

- [ ] **Step 6: 既存のフェイクDBに `method` を足す**

`secondFactor.test.ts:26-30` の `FakeDb.totp` に `method` フィールドが無い。
Task 4b で `verifySecondFactor` が `getSecondFactorMethod` を呼ぶと
`data.method === undefined` → `null` → `NOT_ENABLED` になり、TOTP 系のテストが全滅する。
**このタスクのうちに足しておく。**

- [ ] **Step 7: テストが通ることを確認する**

```bash
npx jest src/lib/auth/ src/helpers/ src/app/api/user/totp/
```

期待: PASS。**ここが緑にならないままタスクを閉じない。**

- [ ] **Step 8: コミット**

```bash
git commit -m "refactor(auth): isTotpEnabled を getSecondFactorMethod にする

リネームのみ。方式ごとの分岐は次のコミット。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4b: メールOTP の検証を足す

**Files:**

- Modify: `src/lib/auth/secondFactor.ts` + `.test.ts`

**Interfaces:**

- Produces: `verifySecondFactor` が `method` で分岐

- [ ] **Step 1: フェイクDBを拡張する**

`secondFactor.test.ts:45-140` の `createSupabaseMock` が持つのは
`select` / `eq` / `not` / `is` / `or` / `update` / `maybeSingle` のみ。
`verifyEmailOtpCode` には `delete` / `gt` / `order` / `limit` / `single` / `insert` と、
`users` / `otp_codes` テーブルの模擬が要る。

⚠️ **フィルタを評価する形にする。** `mockOtpDelete({ deletedRows: 0 })` のように
結果だけ差し込むと、実装から `.gt('expires_at', now)` を消してもテストが通る。
仕様書が最も念を押した「期限と試行回数は自前で書く」が、まったく検証されない。

- [ ] **Step 2: 失敗するテストを書く**

```ts
describe('verifySecondFactor（method=email_otp）', () => {
  it('期限内の一致するコードで SUCCESS を返し、行を消す', async () => {
    const db = fakeDb({
      totp: { method: 'email_otp', confirmed_at: '2026-11-01T00:00:00Z' },
      users: { id: 'u1', email: 'u@e.com' },
      otpCodes: [validTwoFactorCode('123456', 'u@e.com')],
    });

    await expect(verifySecondFactor(mock(db), 'u1', '123456')).resolves.toBe(
      SECOND_FACTOR_VERIFY_RESULT.SUCCESS,
    );
    expect(db.otpCodes).toHaveLength(0);
  });

  // ⚠️ 期限判定が実装されているかを、結果ではなくデータで確かめる
  it('期限切れのコードは通らず、行も消えない', async () => {
    const db = fakeDb({
      totp: { method: 'email_otp', confirmed_at: '2026-11-01T00:00:00Z' },
      users: { id: 'u1', email: 'u@e.com' },
      otpCodes: [expiredTwoFactorCode('123456', 'u@e.com')],
    });

    await expect(verifySecondFactor(mock(db), 'u1', '123456')).resolves.toBe(
      SECOND_FACTOR_VERIFY_RESULT.INVALID,
    );
    expect(db.otpCodes).toHaveLength(1);
  });

  it('不一致なら attempts が1増える', async () => {
    const db = fakeDb({
      /* attempts: 0 の行 */
    });

    await verifySecondFactor(mock(db), 'u1', '999999');

    expect(db.otpCodes[0].attempts).toBe(1);
  });

  // ⚠️ 5回上限が効いているか。attempts を直接与えるのではなく、
  // 5回失敗させてから6回目を見る
  it('5回失敗した後の6回目は照合に進まない', async () => {
    const db = fakeDb({
      /* attempts: 0 の行 */
    });

    for (let i = 0; i < 5; i += 1) {
      await verifySecondFactor(mock(db), 'u1', '999999');
    }
    const callsBefore = db.deleteCalls;
    await verifySecondFactor(mock(db), 'u1', '123456'); // 正解コード

    expect(db.deleteCalls).toBe(callsBefore); // 照合していない
    expect(db.otpCodes[0].attempts).toBe(5); // 23514 を避けて加算も止まる
  });

  it('同じコードの2回目は INVALID（削除行数で判定）', async () => {
    const db = fakeDb({
      /* 有効な行1件 */
    });

    await verifySecondFactor(mock(db), 'u1', '123456');
    await expect(verifySecondFactor(mock(db), 'u1', '123456')).resolves.toBe(
      SECOND_FACTOR_VERIFY_RESULT.INVALID,
    );
  });

  it('リカバリーコードは方式によらず通る', async () => {
    // RECOVERY_CODE_PATTERN は [2-9A-HJKMNP-TWXYZ]{10} で
    // 6桁の数字とは長さも文字種も交わらない
  });
});
```

- [ ] **Step 3: 落ちることを確認する**

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

  // 試行回数。上限に達していたら照合せずに弾く。
  // 素の UPDATE で加算すると6回目に 23514 で失敗し、
  // エラーを見ないと静かにカウントが止まる
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

  // 「一致して・期限内の行だけを消す」を1文で行う
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
    // 不一致・期限切れのどちらでも加算する。
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

- [ ] **Step 5: `verifySecondFactor` を分岐させる**

```ts
export async function verifySecondFactor(
  supabase: SupabaseClient,
  userId: string,
  code: string,
): Promise<SecondFactorVerifyResult> {
  const normalized = normalizeRecoveryCode(code);

  // リカバリーコードは方式に依存しない。
  // パターンが [2-9A-HJKMNP-TWXYZ]{10} なので6桁の数字と交わらない
  if (RECOVERY_CODE_PATTERN.test(normalized)) {
    return verifyRecoveryCode(supabase, userId, code);
  }

  const method = await getSecondFactorMethod(supabase, userId);

  if (method === null) return SECOND_FACTOR_VERIFY_RESULT.NOT_ENABLED;
  if (method === SECOND_FACTOR_METHOD.EMAIL_OTP) {
    return verifyEmailOtpCode(supabase, userId, code);
  }
  return verifyAuthenticatorCode(supabase, userId, code.trim());
}
```

- [ ] **Step 6: テスト → コミット**

---

## Task 5: ガードをリネームして方式非依存にする

**Files:**

- Rename: `src/helpers/totpGuard.ts` → `secondFactorGuard.ts`（+ `.test.ts`）
- Modify: `src/app/api/user/totp/disable/route.ts`、`recovery-codes/route.ts`（+ テスト2本の `jest.mock` パス）

- [ ] **Step 1: テストに方式のケースを足す**

```ts
it('method=email_otp でも、正しいコードなら通る', async () => {
  mockSecondFactorMethod('email_otp');
  mockVerifyResult(SECOND_FACTOR_VERIFY_RESULT.SUCCESS);
  await expect(
    requireSecondFactor(supabase, 'u1', '123456'),
  ).resolves.toBeNull();
});

it('第2要素が未設定なら 400', async () => {
  mockSecondFactorMethod(null);
  expect((await requireSecondFactor(supabase, 'u1', '123456'))?.status).toBe(
    400,
  );
});
```

- [ ] **Step 2: 落ちることを確認する**

- [ ] **Step 3: リネームして実装する**

```bash
git mv src/helpers/totpGuard.ts src/helpers/secondFactorGuard.ts
git mv src/helpers/totpGuard.test.ts src/helpers/secondFactorGuard.test.ts
```

`requireSecondFactor:89` を `if (!(await getSecondFactorMethod(supabase, userId)))` に。
ファイル冒頭の JSDoc に「TOTP とメールOTP の両方を扱う」と追記。

⚠️ `errorResponse`（:22）は**モジュールローカルの未 export 定数**。
Task 8 の新ルートから使うので、ここで `export` する。

- [ ] **Step 4: import 元2ルートとそのテストの `jest.mock` パスを直す**

`disable/route.test.ts:30`、`recovery-codes/route.test.ts:30`。

- [ ] **Step 5: テスト → コミット**

---

## Task 6: 第2要素コードの送信ヘルパー

**送信を1か所に集める。** ここを経由しない送信経路を作らない。

**Files:**

- Create: `src/lib/auth/sendSecondFactorCode.ts` + `.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export const SEND_SECOND_FACTOR_RESULT = {
    SENT: 'sent',
    THROTTLED: 'throttled', // 再送間隔（60秒）内
    LIMIT_EXCEEDED: 'limit_exceeded',
    SEND_FAILED: 'send_failed',
  } as const;
  export async function sendSecondFactorCode(
    supabase: SupabaseClient,
    userId: string,
    email: string,
  ): Promise<SendSecondFactorResult>;
  ```

### 枠の戻しは `release_rate_limit` RPC を使う（マイグレーションは作らない）

当初案は「`resetRateLimit`（行ごと削除）で代用し、専用 RPC を作らない」だったが、
**別ブランチ（#1260 / `aecdd432`）が `release_rate_limit` RPC を既に作り、
本番にも適用済み**であることが判明したため、それを使う。

```sql
-- 20261118061430_release_rate_limit_rpc.sql（#1260 のブランチ。本番適用済み）
UPDATE rate_limits
SET attempts = GREATEST(attempts - 1, 0),
    locked_until = NULL      -- ← ロックも解除する
WHERE identifier = p_identifier AND action_type = p_action_type;
```

専用 RPC を避けた理由（`attempts` を1戻しても `locked_until` が残る）は、
この実装では `locked_until = NULL` で解決済み。

`resetRateLimit` を使ってはいけない。行ごと削除するため、**別の正当な送信で
積んだ分まで消える**（RPC のコメントにも同じ指摘がある）。

#### このブランチでやること

- **マイグレーションは作らない。** 重複定義になる
- **`src/lib/rateLimit/rateLimit.ts` に TS ラッパー `releaseRateLimit` を自分で書く。**
  #1260 のブランチにも同名のラッパーがあるため、**マージ時にコンフリクトしうる**。
  PR のレビューポイントに書くこと
- Task 9（ログイン枠の解放）は引き続き **`resetRateLimit`** を使う。
  あちらは「パスワードが正しいと確認できたので全部チャラ」の意味で、
  `auth.ts:324` の成功時リセットと同じ扱いが正しい

- [ ] **Step 1: 失敗するテストを書く**

```ts
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

// ⚠️ 識別子はユーザーID。メールにすると #641 / #644 と同じ
// 「カウンタが割れて掛け算できる」問題になる
it('レート制限の識別子はユーザーID', async () => {
  mockNoRecentSend();
  mockRateLimit({ allowed: true });
  mockSendOtpEmail(true);

  await sendSecondFactorCode(supabase, 'u1', 'user@example.com');

  expect(mockCheckRateLimit).toHaveBeenCalledWith(
    supabase,
    'u1',
    'two_factor_send',
    10,
    60,
  );
});

it('60秒以内の再送は THROTTLED で、枠も消費しない', async () => {
  mockRecentSend({ secondsAgo: 10 });

  await expect(
    sendSecondFactorCode(supabase, 'u1', 'user@example.com'),
  ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.THROTTLED);
  expect(mockSendOtpEmail).not.toHaveBeenCalled();
  expect(mockCheckRateLimit).not.toHaveBeenCalled();
});

it('上限超過は LIMIT_EXCEEDED で、メールを送らない', async () => {
  mockNoRecentSend();
  mockRateLimit({ allowed: false });

  await expect(
    sendSecondFactorCode(supabase, 'u1', 'user@example.com'),
  ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED);
  expect(mockSendOtpEmail).not.toHaveBeenCalled();
});

// ⚠️ #1260: 現行の /api/auth/otp/send は送信失敗でも枠を戻さない。
// 第2要素では数回の失敗でログイン不能になるため、ここでは戻す
it('送信に失敗したら枠を戻し、行も残さない', async () => {
  mockNoRecentSend();
  mockRateLimit({ allowed: true });
  mockSendOtpEmail(false);

  await expect(
    sendSecondFactorCode(supabase, 'u1', 'user@example.com'),
  ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.SEND_FAILED);

  expect(mockResetRateLimit).toHaveBeenCalledWith(
    supabase,
    'u1',
    'two_factor_send',
  );
  expect(mockOtpDelete).toHaveBeenCalledTimes(2); // 事前クリア + 後始末
});

it('前のコードを消してから新しいコードを入れる', async () => {
  // ⚠️ jest-extended（toHaveBeenCalledBefore）は未インストール。
  // 依存を増やさず invocationCallOrder で比べる
  expect(mockOtpDelete.mock.invocationCallOrder[0]).toBeLessThan(
    mockOtpInsert.mock.invocationCallOrder[0],
  );
});
```

- [ ] **Step 2: 落ちることを確認する**

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
 * 必ずセッションまたは `users` テーブルから引いた値を渡すこと（#641）。
 *
 * ⚠️ 枠は**送信の直前**に消費する（`.claude/rules/api-route.md` の例外2）。
 * 再送間隔に当たったパスでは消費しない —— ボタンの二度押しで枠が減ると、
 * 上限に達して24時間ログインできなくなる。
 */
export async function sendSecondFactorCode(
  supabase: SupabaseClient,
  userId: string,
  email: string,
): Promise<SendSecondFactorResult> {
  const normalizedEmail = normalizeEmail(email);

  // 再送間隔。枠の消費より前に判定する
  const { data: recent, error: recentError } = await supabase
    .from('otp_codes')
    .select('created_at')
    .eq('email', normalizedEmail)
    .eq('action_type', TWO_FACTOR_OTP_ACTION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 握り潰すと「前回送信なし」に化け、DB が詰まっている間だけ
  // 再送間隔が素通りする（#1164 と同じ理由）
  if (recentError) {
    throw toDbError(recentError, 'read otp_codes for second factor send');
  }

  if (recent) {
    const elapsed = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
    if (elapsed < OTP_CONFIG.RESEND_INTERVAL_SECONDS) {
      return SEND_SECOND_FACTOR_RESULT.THROTTLED;
    }
  }

  const limitResult = await checkRateLimit(
    supabase,
    userId,
    RATE_LIMIT_ACTION.TWO_FACTOR_SEND,
    RATE_LIMIT_CONFIG.TWO_FACTOR_SEND.maxAttempts,
    RATE_LIMIT_CONFIG.TWO_FACTOR_SEND.windowMinutes,
  );

  if (!limitResult.allowed) return SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED;

  const code = generateOtpCode();

  // 前のコードは無効にする。複数生きていると古いコードでも通る
  const { error: clearError } = await supabase
    .from('otp_codes')
    .delete()
    .eq('email', normalizedEmail)
    .eq('action_type', TWO_FACTOR_OTP_ACTION);

  if (clearError) throw toDbError(clearError, 'clear second factor codes');

  const { error: insertError } = await supabase.from('otp_codes').insert({
    email: normalizedEmail,
    code_hash: hashOtpCode(code, normalizedEmail),
    action_type: TWO_FACTOR_OTP_ACTION,
    expires_at: new Date(
      Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000,
    ).toISOString(),
  });

  if (insertError) throw toDbError(insertError, 'insert second factor code');

  const sent = await sendOtpEmail(normalizedEmail, code, TWO_FACTOR_OTP_ACTION);

  if (!sent) {
    // 枠と行の両方を戻す。残すと、届いていないコードを待つ利用者が
    // 再送もできない状態になる
    await resetRateLimit(supabase, userId, RATE_LIMIT_ACTION.TWO_FACTOR_SEND);
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

- [ ] **Step 4: `auth.test.ts` のレート制限モックに `resetRateLimit` があることを確認する**

`auth.test.ts:111-114` は `@/lib/rateLimit/rateLimit` を `checkRateLimit` /
`resetRateLimit` の2キーだけ返すファクトリでモックしている。
今回は新しい関数を足さないので、このままでよい（**新 RPC を作らない利点**）。

- [ ] **Step 5: テスト → コミット**

---

## Task 7: `totpSetup.ts` を方式対応にする（呼び出し側も同時に直す）

⚠️ シグネチャが変わるので、**呼び出し側を同じタスクで直さないと型チェックが通らない。**

**Files:**

- Modify: `src/lib/auth/totpSetup.ts` + `.test.ts`
- Modify: `src/app/api/user/totp/setup/route.ts`、`enable/route.ts`（型を合わせるだけ。挙動は Task 8）

**Interfaces:**

- Produces:
  - `startSecondFactorSetup(supabase, userId, method, accountName, email)`
  - `confirmSecondFactorSetup(supabase, userId, code)`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// ⚠️ method を明示しないと DEFAULT 'totp' が入り、encrypted_secret が NULL
// なので chk_secret_matches_method に 23514 で落ちる
it('method=totp の設定開始は method を明示して insert する', async () => {
  await startSecondFactorSetup(supabase, 'u1', 'totp', 'u@e.com', 'u@e.com');
  expect(mockInsert).toHaveBeenCalledWith(
    expect.objectContaining({ method: 'totp' }),
  );
});

it('method=email_otp は共有鍵を作らず、コードを送る', async () => {
  await startSecondFactorSetup(
    supabase,
    'u1',
    'email_otp',
    'u@e.com',
    'u@e.com',
  );
  expect(mockInsert).toHaveBeenCalledWith(
    expect.objectContaining({ method: 'email_otp', encrypted_secret: null }),
  );
  expect(mockSendSecondFactorCode).toHaveBeenCalled();
});

it('既に有効なら方式によらず TotpAlreadyEnabledError', async () => {
  mockExistingRow({ confirmed_at: '2026-11-01T00:00:00Z' });
  await expect(
    startSecondFactorSetup(supabase, 'u1', 'email_otp', 'u@e.com', 'u@e.com'),
  ).rejects.toThrow(TotpAlreadyEnabledError);
});

// ⚠️ 送信できていないのに設定途中の行だけ残ると、
// 「コード入力画面に来たのにコードが来ない」状態になる
it('送信に失敗したら設定途中の行を消して SEND_FAILED を返す', async () => {
  mockSendResult('send_failed');
  const result = await startSecondFactorSetup(
    supabase,
    'u1',
    'email_otp',
    'u@e.com',
    'u@e.com',
  );
  expect(result.sendResult).toBe('send_failed');
  expect(mockDelete).toHaveBeenCalledTimes(2); // 事前クリア + 後始末
});

it('再送間隔に当たった場合も行を残さない（THROTTLED）', async () => {
  mockSendResult('throttled');
  const result = await startSecondFactorSetup(
    supabase,
    'u1',
    'email_otp',
    'u@e.com',
    'u@e.com',
  );
  expect(result.sendResult).toBe('throttled');
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

- [ ] **Step 3: `startSecondFactorSetup` を実装する**

既存の「読み取りに失敗したら何も消さずに抜ける」ガード（`totpSetup.ts:61-74`）は
**そのまま残す**。`insert` に `method` を必ず渡す。

メールOTP のときは行を作ったあとに `sendSecondFactorCode` を呼び、
**`SENT` 以外（`THROTTLED` / `LIMIT_EXCEEDED` / `SEND_FAILED`）ではすべて
設定途中の行を消してから返す。** 戻り値に `sendResult` を含めて呼び出し側に伝える。

- [ ] **Step 4: `confirmSecondFactorSetup` を実装する**

設定途中の行の `method` を読み、TOTP なら `verifyTotpCode`、
メールOTP なら `otp_codes` と照合する。
**リカバリーコードの発行は成功後のみ**という現行の順序（`totpSetup.ts:108-118` の
JSDoc が説明）は変えない。

- [ ] **Step 5: 呼び出し側2ルートの型を合わせる**

`setup/route.ts`、`enable/route.ts`。挙動の追加は Task 8。

- [ ] **Step 6: テストが通ることを確認する**

```bash
npx jest src/lib/auth/totpSetup.test.ts src/app/api/user/totp/
npx tsc --noEmit
```

- [ ] **Step 7: コミット**

---

## Task 8: API ルートを方式対応にする

**Files:**

- Create: `src/app/api/user/totp/send-challenge/route.ts` + `.test.ts`
- Modify: `setup/route.ts`、`enable/route.ts`、`route.ts`（+ 各テスト）、`src/schema/totp.ts`
- Modify: `.claude/rules/api-route.md`

**Interfaces:**

- `POST /api/user/totp/setup` が `{ method }` を受ける
- `GET /api/user/totp` が `{ enabled, method, emailOtpAvailable, remainingRecoveryCodes }` を返す
- `POST /api/user/totp/send-challenge`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// send-challenge
it('未認証なら 401', async () => {
  /* ... */
});

it('method=totp には送らない（アプリで生成できるため）', async () => {
  mockSecondFactorMethod('totp');
  expect((await POST(createRequest({}))).status).toBe(400);
  expect(mockSendSecondFactorCode).not.toHaveBeenCalled();
});

it('method=email_otp なら本人のアドレスへ送る', async () => {
  mockSecondFactorMethod('email_otp');
  mockUserEmail('owner@example.com');
  expect((await POST(createRequest({}))).status).toBe(200);
  expect(mockSendSecondFactorCode).toHaveBeenCalledWith(
    expect.anything(),
    'u1',
    'owner@example.com',
  );
});

// ⚠️ 宛先をボディから取らないことの回帰テスト（#641）
it('ボディの email は無視する', async () => {
  mockSecondFactorMethod('email_otp');
  mockUserEmail('owner@example.com');
  await POST(createRequest({ email: 'attacker@example.com' }));
  expect(mockSendSecondFactorCode).toHaveBeenCalledWith(
    expect.anything(),
    'u1',
    'owner@example.com',
  );
});

// ⚠️ 送信系と検証系でカウンタを重ねない。重ねると2回しくじるだけで
// 15分間すべての2FA操作が429になる
it('TOTP_SETTINGS_VERIFY を消費しない', async () => {
  mockSecondFactorMethod('email_otp');
  await POST(createRequest({}));
  expect(mockCheckRateLimit).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    'totp_settings_verify',
    expect.anything(),
    expect.anything(),
  );
});

// setup
// ⚠️ 画面だけの制限にしない
it('admin 発行アカウント（username あり）は email_otp を拒否する', async () => {
  mockSessionUser({ id: 'u1', username: 'alice' });
  const response = await POST(createRequest({ method: 'email_otp' }));
  expect(response.status).toBe(400);
  expect(mockStartSecondFactorSetup).not.toHaveBeenCalled();
});

it('admin 発行アカウントでも totp は選べる', async () => {
  mockSessionUser({ id: 'u1', username: 'alice' });
  expect((await POST(createRequest({ method: 'totp' }))).status).toBe(200);
});

describe('処理順', () => {
  // TWO_FACTOR_SEND は例外2（送信直前＝検証より後ろ）。
  // 「レート制限超過 かつ 入力が不正」で 400 が返ることを固定する
  it('入力が不正なら、レート制限より先に 400', async () => {
    mockRateLimit({ allowed: false });
    expect((await POST(createRequest({ method: 'bogus' }))).status).toBe(400);
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
 *
 * ⚠️ `TOTP_SETTINGS_VERIFY` は消費しない。送信と検証でカウンタを重ねると、
 * メールOTP 利用者は無効化のたびに2枠使い、2回しくじるだけで15分間
 * すべての2FA操作が 429 になる。レート制限は `TWO_FACTOR_SEND` の1本だけ
 * （`sendSecondFactorCode` の中、送信の直前＝例外2）。
 */
export async function POST(request: Request) {
  // 引数を取るが本文は読まない。テストから POST(createRequest({})) で
  // 呼べるようにするため（引数なしだと TS2554）
  ...
}
```

- [ ] **Step 4: `setup/route.ts` に `{ method }` を受けさせる**

`src/schema/totp.ts` に:

```ts
export const secondFactorSetupSchema = z.object({
  method: z.enum([SECOND_FACTOR_METHOD.TOTP, SECOND_FACTOR_METHOD.EMAIL_OTP]),
});
```

⚠️ 現在の `POST`（`setup/route.ts:23`）は**引数なし**。`POST(request: Request)` 化する。

⚠️ **admin 発行アカウントのメールOTP をサーバー側で拒否する。**
`users` の SELECT は既に :53-57 にあるので `select('email, username')` にまとめ、
別クエリを足さない。

```ts
// admin 発行アカウントは users.email が generateSyntheticEmail() の
// `.invalid` TLD（RFC 2606、絶対に名前解決されない）。選ばせると
// コードが永久に届かず、設定途中のまま詰む
if (result.data.method === SECOND_FACTOR_METHOD.EMAIL_OTP && user.username) {
  return errorResponse(
    ERROR_CODE.BAD_REQUEST,
    SECOND_FACTOR_MESSAGES.EMAIL_OTP_UNAVAILABLE,
    HTTP_STATUS.BAD_REQUEST,
  );
}
```

⚠️ **email_otp 分岐では `TOTP_SETTINGS_VERIFY` を消費しない。**
現在 :32-40 で消費しているので、方式で分ける。

- [ ] **Step 5: `route.ts`（GET）に `method` と `emailOtpAvailable` を含める**

`users` の SELECT が現在無いので足す（`username` を見るため）。

- [ ] **Step 6: `.claude/rules/api-route.md` の例外一覧表に追記する**

```markdown
| `user/totp/setup` POST（`TWO_FACTOR_SEND`） | 例外2 |
| `user/totp/send-challenge` POST（`TWO_FACTOR_SEND`） | 例外2 |
```

- [ ] **Step 7: テスト → コミット**

---

## Task 9: パスワードログイン経路

**Files:**

- Modify: `src/lib/auth/auth.ts`（`authorize` 内 :274 付近と :324 付近）
- Test: `src/lib/auth/auth.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
it('method=email_otp でコード未入力なら EMAIL_OTP_REQUIRED を投げ、コードを送る', async () => {
  mockSecondFactorMethod('email_otp');
  await expect(authorize(validCredentials)).rejects.toMatchObject({
    code: AUTH_ERROR_CODE.EMAIL_OTP_REQUIRED,
  });
  expect(mockSendSecondFactorCode).toHaveBeenCalled();
});

it('method=totp ではメールを送らない', async () => {
  mockSecondFactorMethod('totp');
  await expect(authorize(validCredentials)).rejects.toMatchObject({
    code: AUTH_ERROR_CODE.TOTP_REQUIRED,
  });
  expect(mockSendSecondFactorCode).not.toHaveBeenCalled();
});

// ⚠️ ユーザー名ログインでは authorize の email ローカル変数が空文字（:89）
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

it('送信失敗は SECOND_FACTOR_SEND_FAILED', async () => {
  mockSecondFactorMethod('email_otp');
  mockSendResult('send_failed');
  await expect(authorize(validCredentials)).rejects.toMatchObject({
    code: AUTH_ERROR_CODE.SECOND_FACTOR_SEND_FAILED,
  });
});

// ⚠️ 1通も送っていないので「メールを確認してください」と出してはいけない
it('送信上限は SECOND_FACTOR_SEND_LIMITED（リカバリーコードへ誘導）', async () => {
  mockSecondFactorMethod('email_otp');
  mockSendResult('limit_exceeded');
  await expect(authorize(validCredentials)).rejects.toMatchObject({
    code: AUTH_ERROR_CODE.SECOND_FACTOR_SEND_LIMITED,
  });
});

// ⚠️ 消費はそのまま。throw 直前に解放する。
// 「消費しない」にすると判定がパスワード照合の後ろへ動き、
// アカウント単位の5回/30分が消滅する
it('第2要素を要求するときは login 枠を解放する', async () => {
  mockSecondFactorMethod('totp');
  await expect(authorize(validCredentials)).rejects.toThrow();

  expect(mockCheckRateLimit).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    'login',
    expect.anything(),
    expect.anything(),
  );
  expect(mockResetRateLimit).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    'login',
  );
});

it('パスワードが違うときは login 枠を解放しない', async () => {
  mockPasswordMismatch();
  await expect(authorize(validCredentials)).rejects.toThrow();
  expect(mockResetRateLimit).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 落ちることを確認する**

- [ ] **Step 3: 第2要素の分岐を方式対応にする**

`auth.ts:274` の `if (await isTotpEnabled(...))` を:

```ts
// 第2要素。パスワードが正しいことを確かめてからでないと、
// 「二段階認証を使っているアカウントかどうか」を第三者に教えてしまう
const secondFactorMethod = await getSecondFactorMethod(supabase, user.id);

if (secondFactorMethod !== null) {
  const totpCode = (credentials.totpCode as string | undefined)?.trim();

  if (!totpCode) {
    // ここに来た＝パスワードは正しい。ログインの試行回数を
    // 消費したままにすると、コードの入力・打ち間違え・再送で
    // 5回/30分をすぐ使い切る。解放してもパスワードを知らない
    // 相手には枠が減ったままなので安全（:324 の成功時と同じ理屈）
    await resetRateLimit(supabase, loginIdentifier, OTP_ACTION.LOGIN);

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

      if (sendResult === SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED) {
        // 1通も送っていない。コードを待たせず、
        // リカバリーコードへ誘導する
        throw new CredentialsSignInError(
          AUTH_ERROR_CODE.SECOND_FACTOR_SEND_LIMITED,
        );
      }

      // SENT / THROTTLED。THROTTLED は直前のコードがまだ生きている
      throw new CredentialsSignInError(AUTH_ERROR_CODE.EMAIL_OTP_REQUIRED);
    }

    throw new CredentialsSignInError(AUTH_ERROR_CODE.TOTP_REQUIRED);
  }

  // 以降の TOTP_VERIFY レート制限と verifySecondFactor は方式共通
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx jest src/lib/auth/auth.test.ts
```

既存の `auth.test.ts:1527`（「login_ip → login → totp_verify の順」）が
緑のままであることを確認する。

- [ ] **Step 5: コミット**

---

## Task 10: OAuth 経路とセッション

**Files:**

- Modify: `src/lib/auth/auth.ts`（`jwt` :575 / :602-649、`session` :824-837）、`src/types/next-auth.d.ts`
- Test: `src/lib/auth/auth.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
it('OAuth で method=email_otp なら totpPending を立ててコードを送る', async () => {
  mockSecondFactorMethod('email_otp');
  const token = await jwt({
    token: {},
    user: { id: 'u1', email: 'u@e.com' },
    account: { provider: 'google' },
  });
  expect(token.totpPending).toBe(true);
  expect(mockSendSecondFactorCode).toHaveBeenCalled();
});

it('session に方式を載せる（画面が出し分けるため）', async () => {
  const result = await session({
    session: baseSession,
    token: { totpPending: true, secondFactorMethod: 'email_otp' },
  });
  expect(result.secondFactorMethod).toBe('email_otp');
  expect(result.user.id).toBe(''); // 第2要素が未了なので空のまま
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
    /* resend */
  });
  expect(token.secondFactorSendFailed).toBe(true);
});

// ⚠️ :517 が totpUnavailable を消しているのと同じ理由。
// 消さないと「送信できませんでした」が画面に出続ける
it('再送に成功したら前回の失敗フラグが消える', async () => {
  mockSendResult('sent');
  const token = await jwt({
    token: {
      id: 'u1',
      totpPending: true,
      secondFactorMethod: 'email_otp',
      secondFactorSendFailed: true,
    },
    trigger: 'update',
    session: { resend: true },
  });
  expect(token.secondFactorSendFailed).toBeUndefined();
});

// ⚠️ auth.ts:788 の `if (user) throw error` により、otp_codes の一時障害で
// OAuth ログイン全体が失敗する。fail-closed として意図どおりか決める
it('初回 OAuth で送信が DB エラーなら、サインインごと失敗する', async () => {
  mockSendSecondFactorCode.mockRejectedValue(new Error('db down'));
  await expect(
    jwt({ token: {}, user: { id: 'u1' }, account: { provider: 'google' } }),
  ).rejects.toThrow();
});
```

- [ ] **Step 2: 落ちることを確認する**

- [ ] **Step 3〜5: 実装 → テスト → コミット**

実装の要点:

- `:575` で方式を取り、`token.secondFactorMethod` に入れる。email_otp なら送信
- `:517` の `delete token.totpUnavailable` の隣に
  `delete token.secondFactorSendFailed` を足す
- `:602` のブロックに `resend` 分岐を足す
- `session` コールバックで `secondFactorMethod` / `secondFactorSendFailed` を渡す
- `src/types/next-auth.d.ts` に型を足す（`Session` と `JWT` の両方）

---

## Task 11: 設定画面

**Files:**

- Modify: `src/features/settings/twoFactorSettings/hooks/useTwoFactorSettings.ts`、`twoFactorSettings.tsx`、`.module.scss` + テスト

- [ ] **Step 1: 失敗するテストを書く**

```tsx
it('無効のとき、方式を選ぶボタンが2つ出る', async () => {
  /* ... */
});

it('メールOTP を選ぶと安全性の注意が出る', async () => {
  /* ... */
});

// admin 発行アカウント（users.username あり）は宛先が .invalid
it('emailOtpAvailable が false ならメールの選択肢を出さない', async () => {
  /* ... */
});

// ⚠️ これが無いと、メールOTP 利用者は無効化のコードを取得できない
it('method=email_otp で有効なとき、コード送信ボタンが出る', async () => {
  /* ... */
});

it('method=totp で有効なとき、コード送信ボタンは出ない', async () => {
  /* ... */
});

// ⚠️ post（useTwoFactorSettings.ts:101-131）は isSubmitting を持つが
// 早期 return しない。連打すると60秒 throttle と枠に直撃する
it('送信中は「コードを送信」を連打できない', async () => {
  /* ... */
});

it('キーボードだけで方式を選べる', async () => {
  /* ... */
});
```

- [ ] **Step 2〜6**: 落ちることの確認 → 実装 → 確認 → コミット

実装の要点:

- `TWO_FACTOR_VIEW` に `METHOD_SELECT` / `SETUP_EMAIL` を足す
- `startSetup(method)` に変える。`sendChallenge()` を足す
- `post` に `if (isSubmitting) return null;` の再入ガードを足す
  （`useTwoFactorChallenge.ts:71` と同じ形）
- `React.memo` + `useCallback` + `displayName` を維持。クラス名は
  `c_two_factor_settings__*` の既存規則に合わせる

---

## Task 12: ログイン画面

⚠️ **本計画で最大の UI 変更。** `loginForm.tsx` は298行で `hooks/` を持たず
ロジックが全部インライン。

**カウントダウンは共通フックに切り出す。** 既存の実装は
`useOtpVerification.ts:43-69` にあるが、`email` / `action` / OTPエンドポイントと
密結合していて再利用できない。`src/features/auth/hooks/useResendCountdown.ts` に
「秒数を数えるだけ」のフックを作り、ログイン画面と Task 13 の両方から使う。
`useOtpVerification` 側の置き換えは**本計画の範囲外**（触ると既存の3画面に波及する）。

**Files:**

- Create: `src/features/auth/hooks/useResendCountdown.ts` + `.test.ts`
- Modify: `src/features/auth/loginForm/loginForm.tsx`、`.module.scss` + テスト

- [ ] **Step 1: `useResendCountdown` のテストと実装**

```ts
export function useResendCountdown(initialSeconds: number): {
  remaining: number;
  canResend: boolean;
  restart: () => void;
};
```

- [ ] **Step 2: ログイン画面の失敗するテストを書く**

```tsx
it('EMAIL_OTP_REQUIRED ならメール向けの文言と再送ボタンを出す', async () => {
  /* ... */
});
it('TOTP_REQUIRED では再送ボタンを出さない', async () => {
  /* ... */
});

// ⚠️ 打ち間違えた状態で再送を押すと、そのコードが検証されて
// TOTP_VERIFY の枠（5回/15分）を1つ失う
it('再送はコードを空にしてから送る', async () => {
  /* ... */
});

it('再送の直後は60秒のカウントダウンで押せない', async () => {
  /* ... */
});
it('残り秒数が aria-live で読み上げられる', async () => {
  /* ... */
});

it('SECOND_FACTOR_SEND_FAILED は「コードが違う」と別の文言', async () => {
  /* ... */
});

// ⚠️ 1通も送られていないので、コードを待たせない
it('SECOND_FACTOR_SEND_LIMITED はリカバリーコードへ誘導する', async () => {
  /* ... */
});

it('callbackUrl が第2要素を挟んでも保持される', async () => {
  /* ... */
});
```

- [ ] **Step 3〜6**: 落ちることの確認 → 実装 → 確認 → コミット

実装の要点:

- `totpRequired` を `secondFactorMode: null | 'totp' | 'email_otp'` に変える
- 再送ハンドラは `setTotpCode('')` してから `signIn` を呼ぶ
  （`loginForm.tsx:135` が `totpRequired` のとき常に `totpCode` を送るため）

---

## Task 13: OAuth の第2要素画面

**Files:**

- Modify: `src/features/auth/twoFactorChallenge/hooks/useTwoFactorChallenge.ts`、`twoFactorChallenge.tsx` + テスト

- [ ] **Step 1: 失敗するテストを書く**

```tsx
it('method=email_otp なら再送ボタンと、メール向けのリード文を出す', async () => {
  // ⚠️ twoFactorChallenge.tsx:42-45 のリード文は認証アプリ前提で固定されている
});

// ⚠️ 再送（Resend の往復で遅い）と検証（速い）が並行すると、
// 再送が後から totpPending:true を書き戻して成功した検証が巻き戻る
it('検証中は再送を押せない', async () => {
  /* ... */
});
it('再送中は確認を押せない', async () => {
  /* ... */
});

it('送信失敗のフラグが立っていたら専用の文言を出す', async () => {
  /* ... */
});
```

- [ ] **Step 2〜6**: 落ちることの確認 → 実装 → 確認 → コミット

実装の要点: `isResending` を足し、`isSubmitting` / `isCancelling` と同じ
相互排他に入れる（`useTwoFactorChallenge.ts:71` / `:124` の既存パターン）。
`useResendCountdown`（Task 12）を使う。

---

## Task 14: E2E とドキュメント

**Files:**

- Modify: `e2e/auth/twoFactor.spec.ts`、`e2e/helpers/api.ts`、`e2e/helpers/totp.ts`
- Modify: `.claude/documents/authentication-flow.md`

- [ ] **Step 1: E2E ヘルパーの型を広げる**

`'registration' | 'login' | 'password_change'` のリテラル union が**3か所**:
`api.ts:1114`（`getLatestOtpCode`）、`:1185`（`expireOtpCode`）、
`:1197`（`maxOutOtpAttempts`）。異常系を書くなら3つとも要る。

`findOtpCodeByHash`（`:1137-1160`）は `action` に依存しないのでそのまま使える。

- [ ] **Step 2: シナリオを足す**

```ts
test('メールOTP を第2要素にしてログインできる', async ({ page }) => {
  /* ... */
});
test('メールOTP から TOTP に切り替えられる', async ({ page }) => {
  /* ... */
});
// ⚠️ メールOTP 利用者の唯一の自力復旧手段
test('リカバリーコードでログインできる（方式を問わず）', async ({ page }) => {
  /* ... */
});
```

⚠️ 実送信のバイパスには3条件すべてが要る:
`E2E_TEST_MODE=true` + `OTP_EMAIL_TEST_BYPASS=true` + `VERCEL_ENV !== 'production'`
（`src/lib/otp/sendOtpEmail.ts:40-44`）。`action` は見ないので第2要素でも効く。

⚠️ E2E は3ブラウザが同じユーザーを共有する。「初期値はこう」というアサーションは
必ずフレークする。各シナリオで方式を明示的に設定してから検証する。

⚠️ ローカルでは**1ブラウザずつ**流す。終了コードは件数行で判定する。

- [ ] **Step 3: E2E を流す**

```bash
npx playwright test e2e/auth/twoFactor.spec.ts --project=chromium
```

実行後、コミット前に `git checkout -- docs/e2e-screenshots/` で
E2E が書き換えたコミット済みスクショを戻す。

- [ ] **Step 4: `.claude/documents/authentication-flow.md` を更新する**

現在 TOTP の記述は `:846` の「二要素認証（TOTP）: 不要（対象外）」の1行だけで、
**実質ほぼ新規執筆**になる。書くこと:

- 第2要素の方式（TOTP / メールOTP）と選び方
- 方式ごとのログインフロー（パスワード経路・OAuth 経路）
- メールOTP を選んだ場合の強度の限界（パスワードリセットと同じ受信箱）
- 設定変更に第2要素が要ること、`send-challenge` の位置づけ
- リカバリーコードが方式を問わず使えること
- admin 発行アカウントでメールOTP が使えないこと
- レート制限2本（`two_factor_send` / `totp_settings_verify`）の役割分担

- [ ] **Step 5: カバレッジを確認する**

```bash
npx jest --coverage \
  --collectCoverageFrom='src/lib/auth/**' \
  --collectCoverageFrom='src/features/auth/**' \
  --collectCoverageFrom='src/features/settings/twoFactorSettings/**' \
  --collectCoverageFrom='src/app/api/user/totp/**'
```

全指標80%以上であること。

- [ ] **Step 6: 最終チェックとコミット**

```bash
npm run prettier
npm run lint          # prettier の後に再実行
npx prettier --check .
npx tsc --noEmit
```

---

## PR

```bash
gh pr create --assignee Fn-front \
  --title "feat(auth): 二段階認証の第2要素を TOTP / メールOTP から選べるようにする"
```

本文は `.claude/CLAUDE.md` の構成（概要 / ロードマップ / レビューポイント / テスト）に従い、
`Closes #1261` を入れる。画面に変化があるので `.claude/rules/visual-evidence.md` に従い
Before/After と動作動画を添付する。

**レビューポイントに必ず書くこと:**

- `src/schema/otp.ts` を許可リスト方式に変えた理由（`OTP_ACTION` への追加が公開ルートを開く結合）
- テーブルをリネームしなかった理由（先行適用でログインが全滅する）
- `send-challenge` を足した理由（無ければメールOTP 利用者が無効化できない）
- `TWO_FACTOR_SEND` の窓を60分にした理由（`consume_rate_limit` はレートではない）

PR 作成後は**マージ承認を待つ**。`gh pr merge` を自動で実行しない。

---

## Self-Review

**1. Spec coverage**

| 仕様書の節                              | タスク                                              |
| --------------------------------------- | --------------------------------------------------- |
| §1 データモデル・許可リスト2本          | Task 1                                              |
| §2 送信経路4本                          | Task 6（集約）/ 8（経路4）/ 9（経路1）/ 10（経路2） |
| §2-1 公開ルートを閉じる                 | Task 3                                              |
| §2-2 経路4                              | Task 8                                              |
| §2-3 レート制限・FAIL_CLOSED・枠の戻し  | Task 2、Task 6                                      |
| §2-4-1 結果の伝え分け                   | Task 2（コード）/ 9（投げ分け）/ 12（表示）         |
| §2-4 login 枠の解放・RATE_LIMITED       | Task 3.5、Task 9                                    |
| §3 検証層                               | Task 4a、Task 4b、Task 5                            |
| §4 設定画面 / ログイン画面 / OAuth 画面 | Task 11 / 12 / 13                                   |
| §5 エラー処理                           | Task 2、Task 9、Task 10                             |
| §6 テスト                               | 各タスクに内包、Task 14 で E2E とカバレッジ         |
| admin 発行アカウントの除外              | Task 8（サーバー）/ 11（画面）                      |

**2. 仕様書との意図的な差分**

- 仕様書 §2-1(a) は定数を `constants/totp.ts` に置くとしているが、計画は
  新規 `constants/secondFactor.ts`。方式に依存しないものを TOTP 固有の
  ファイルに置くと、次に読む人が「TOTP 専用」と誤解する

**3. 残る判断事項（実装時に決める）**

- `verifySecondFactor` が `user_totp` を2回読む（`getSecondFactorMethod` と
  `verifyAuthenticatorCode:101-106`）。1クエリにまとめられるが、
  可読性とのトレードオフ。まず動かしてから判断する
- Task 10 の「初回 OAuth で `otp_codes` の障害がサインインごと失敗させる」は
  fail-closed として妥当だが、`user_totp` の障害でしか起きなかった挙動が
  広がる。テストで固定したうえで、PR のレビューポイントに書く

**4. 型の一貫性**

`getSecondFactorMethod` / `verifySecondFactor` / `SECOND_FACTOR_VERIFY_RESULT` /
`sendSecondFactorCode` / `SEND_SECOND_FACTOR_RESULT` / `startSecondFactorSetup` /
`confirmSecondFactorSetup` / `useResendCountdown` を全タスクで統一。
`SECOND_FACTOR_METHOD.TOTP` / `.EMAIL_OTP` と DB の `'totp'` / `'email_otp'` も一致。
