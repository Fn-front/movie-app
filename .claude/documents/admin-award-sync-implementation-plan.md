# 受賞作品の手動同期（管理画面）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin が管理画面から年と賞を指定して受賞作品データを同期できるようにする。

**Architecture:** POST で `award_sync_jobs` に行を作って 202 を即返し、`after()` で同期を継続する。画面はジョブIDをポーリングして進捗を見る。データ書き込みは UPSERT してから `generated_at` が古い行だけを消す「世代付き入れ替え」で、途中失敗時に既存データを失わない。

**Tech Stack:** Next.js 16.4.2 (App Router, `after()`), React 19.2.5, Supabase (PostgreSQL), NextAuth.js, Radix UI, SCSS Modules, Jest + React Testing Library, Playwright

**Spec:** `.claude/documents/admin-award-sync-design.md`

## Global Constraints

- 作業ブランチは `feature/admin-award-sync`。main で直接作業しない
- テストファイルは対象と同じディレクトリに `<filename>.test.ts(x)` で置く
- カバレッジは全指標（Statements / Branches / Functions / Lines）80% 以上
- アクセシビリティ優先クエリ（`getByRole` / `getByLabelText`）を使う。ユーザー操作は `@testing-library/user-event`
- すべてのコンポーネントに `React.memo` と `displayName`、イベントハンドラに `useCallback`
- クラス名結合は `cn()`（`@/utils/cn`）
- SCSS Modules。HTML要素を直接スタイリングしない。カラー・スペーシングは `.claude/documents/design-system.md` の変数を使い、ハードコードしない。アニメーションは opacity / transform のみ
- API Route は `withAdminAuth` による認証、DB-based レート制限、統一エラーレスポンス形式 `{ success, error: { code, message } }` の3点を必ず満たす
- スキーマ変更は `supabase migration new <name>` → `npx supabase db push`。ダッシュボードで直接変更しない。`supabase migration repair --status reverted` は**実行しない**
- 新規テーブルは `ENABLE ROW LEVEL SECURITY` と明示的な `REVOKE` / `GRANT` を同じマイグレーションに書く
- `RATE_LIMIT_ACTION` への追加と DB の `chk_action_type` への追加は必ず同じ PR で両方行う

---

## この計画で確定させた値

設計書 §10「実装前に決めること」の8項目をここで確定する。

| # | 項目 | 値 | 根拠 |
| --- | --- | --- | --- |
| 1 | `OPENAI_REQUEST_TIMEOUT_MS` | `45_000` | SDK既定の10分は長文生成向け。Wikipedia記事1本からの1部門抽出は数秒〜十数秒で終わる |
| 1 | `OPENAI_MAX_RETRIES` | `0` | サービス層が `AWARDS_MAX_RETRIES = 3` で既にリトライする。SDK側でも retry すると回数が掛け算になる |
| 1 | `AWARD_SYNC_STALE_MINUTES` | `25` | 上界 = 最大部門数9 × 外側3回 × 45秒 = 1215秒 ≈ 20.25分。マージン込みで25分 |
| 2 | `RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC` | `{ maxAttempts: 10, windowMinutes: 60 }` | 1回が最大20分かかり OpenAI 課金を伴う。手動運用に10回/時は十分で、暴走は止まる |
| 2 | `RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC_STATUS` | `{ maxAttempts: 600, windowMinutes: 30 }` | ポーリング5秒間隔 × 最大25分 = 300回。倍の余裕を取る |
| 2 | ポーリング間隔 | `5_000` ms | 25分で300回。これ以上短くすると上限に当たる |
| 3 | `requested_by` の `ON DELETE` | `RESTRICT` | `admin_audit_logs.actor_user_id` と同じ。実行者の記録を消さない |
| 4 | ジョブの保持期間 | 無期限（削除しない） | 年1件ずつの手動操作しか行を作らないため増えない。`DELETE` を GRANT しない方針とも揃う |
| 5 | `/api/awards` キャッシュ対策 | 完了後の確認リンクに `?t=<finished_at>` を付ける | `public, s-maxage=3600` のためブラウザが古い結果を見せうる。管理者が「直っていない」と誤判断するのを防ぐ |
| 6 | 洗い替えの対象範囲 | `(award_name, award_year)` 単位 | 部門単位にすると `AWARD_DEFINITIONS` から外した旧部門の行が永久に残る |
| 7 | 年の入力範囲 | 賞ごとの下限 〜 当年+1 | `AWARD_YEAR_RANGE`（1900〜2100）は表示用。記事の無い年に全部門ぶん課金しない |
| 8 | 進捗の粒度 | `status` のみ（部門単位は出さない） | カラム追加と頻繁な UPDATE に見合わない。1年ずつ手動実行する用途では実行中/完了/失敗で足りる |

**#1 は cron にも影響する。** `createOpenAIClient()` は cron も使う。現状はタイムアウト無制限に近いが、cron は Vercel の `maxDuration = 300` で5分で殺されるため、45秒で失敗が早く返るのは改善にしかならない。

**#7 の賞ごとの下限**（①の取得経路で実際に取れる年）:

| 賞 | 下限 | 根拠 |
| --- | --- | --- |
| `academy_awards` | 1928 | `AWARD_DEFINITIONS.academy_awards.firstEditionYear` |
| `golden_globes` | 1943 | `AWARD_DEFINITIONS.golden_globes.firstEditionYear` |
| `cannes` | 1946 | `firstEditionYear` が 0（年ベーステンプレート）のため別途定義。第1回が1946年 |

---

## ファイル構成

### 新規作成

| ファイル | 責務 |
| --- | --- |
| `supabase/migrations/<ts>_add_award_sync_jobs.sql` | ジョブテーブル + 部分ユニークインデックス + RLS + GRANT |
| `supabase/migrations/<ts>_add_admin_award_sync_rate_limit_actions.sql` | `chk_action_type` の許可リスト更新 |
| `src/constants/awardSync.ts` | 本機能固有の定数（閾値・ポーリング間隔・賞ごとの下限・メッセージ） |
| `src/schema/awardSync.ts` | POST ボディの zod スキーマ |
| `src/lib/awards/awardSyncJob.ts` | ジョブ行の CRUD。全書き込みに `status='running'` 条件を付ける |
| `src/lib/awards/manualAwardSync.ts` | 世代付き入れ替え + ジョブ状態遷移 |
| `src/app/api/admin/awards/sync/route.ts` | POST（起票）+ GET（最新ジョブ） |
| `src/app/api/admin/awards/sync/[id]/route.ts` | GET（指定ジョブ） |
| `src/lib/api/awardSync/awardSync.ts` | 画面から叩く API クライアント |
| `src/features/admin/awardsSyncPage/hooks/useAwardSync.ts` | フォーム状態 + ポーリング制御 |
| `src/features/admin/awardsSyncPage/awardsSyncPage.tsx` | 画面本体 |
| `src/features/admin/awardsSyncPage/awardsSyncPage.module.scss` | スタイル |
| `src/app/admin/awards/page.tsx` / `loader.tsx` | ルート定義 |
| `e2e/admin/awardSync.spec.ts` | E2E |

### 変更

| ファイル | 変更内容 |
| --- | --- |
| `src/lib/openai/client.ts` | `timeout` / `maxRetries` を明示 |
| `src/lib/awards/syncAwardMoviesService.ts` | `syncSingleAward()` を抽出し cron 側を差し替え |
| `src/constants/rateLimit.ts` | 2アクションと閾値を追加 |
| `src/constants/common.ts` | `ROUTES.ADMIN_AWARDS` と `ADMIN_REQUIRED_ROUTES` |
| `src/constants/apiEndpoints.ts` | 2エンドポイント |
| `src/constants/navigation.ts` | `MENU_LABELS.ADMIN_AWARD_SYNC` |
| `src/constants/index.ts` | `awardSync.ts` の再エクスポート |
| `src/components/layout/userMenu/userMenu.tsx` / `useUserMenu.ts` | PC メニューの導線 |
| `src/components/layout/mobileDrawer/mobileDrawer.tsx` | SP ドロワーの導線 |
| `src/types/database.types.ts` | 型再生成（手編集しない） |

---

# PR 1: DB スキーマとレート制限定数

**完了条件:** `npx supabase db push` が通り、型が生成され、アクティブなジョブ2件目の INSERT が 23505 で拒否される。

### Task 1: `award_sync_jobs` テーブルのマイグレーション

**Files:**
- Create: `supabase/migrations/<生成されるts>_add_award_sync_jobs.sql`

**Interfaces:**
- Produces: テーブル `public.award_sync_jobs`（カラム: `id`, `award_name`, `award_year`, `status`, `requested_by`, `total_upserted`, `error_message`, `created_at`, `started_at`, `finished_at`）、インデックス `uq_award_sync_jobs_active`

- [ ] **Step 1: マイグレーションファイルを作る**

```bash
npx supabase migration new add_award_sync_jobs
```

- [ ] **Step 2: 生成されたファイルに書く**

```sql
-- ============================================
-- 受賞作品の手動同期ジョブ
-- ============================================
-- 管理画面から年と賞を指定して同期を実行するためのジョブ管理テーブル。
-- 設計: .claude/documents/admin-award-sync-design.md
--
-- カンヌ・ゴールデングローブは OpenAI を部門数ぶん呼ぶため分単位かかる。
-- HTTP レスポンスを待たせず、POST で行を作って after() で継続実行し、
-- 画面はこの行をポーリングして進捗を見る。
--
-- ⚠️ pending 状態を持たない。POST の INSERT 時点で running にする。
--    pending だと started_at が NULL で経過時間を判定できず、after() が
--    running への UPDATE に到達する前に落ちると失効させる手段が無くなる
--    （Next は after() の例外を握り潰すため、この経路は実在する）。
CREATE TABLE IF NOT EXISTS public.award_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  award_name VARCHAR(64) NOT NULL,
  award_year INTEGER NOT NULL,
  status VARCHAR(16) NOT NULL,
  -- 実行した admin。削除されても誰が流したかの記録は残す
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  -- 成功時のみ。UPSERT した行数
  total_upserted INTEGER,
  -- 失敗時のみ。取得0件の理由もここに入れる
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- INSERT 時に now() を入れる。失効判定の基準になるため NOT NULL
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  CONSTRAINT chk_award_sync_jobs_status
    CHECK (status IN ('running', 'succeeded', 'failed'))
);

COMMENT ON TABLE public.award_sync_jobs IS
  '受賞作品の手動同期ジョブ。pending は持たず running から始まる。';

-- ============================================
-- アクティブなジョブは全体で1件まで
-- ============================================
-- 定数式に対する一意制約。述語に合う行が同時に2つ存在できない。
--
-- 同一の賞・年だけを弾くのでは不足する。世代付き入れ替えが UPSERT と DELETE の
-- 2文に分かれるため、並走すると片方の DELETE が他方の UPSERT 結果を消す。
-- アプリ側の事前チェックは競合に負けるので DB 側に置く。
--
-- さらに賞・年をまたいで1件に絞るのは、年を1件ずつ投入する運用と、
-- 外部API負荷・dev サーバー負荷を検討対象から外すため。
--
-- ⚠️ これは手動ジョブ同士しか直列化しない。Vercel cron は本番で同じ DB を
--    触るため、cron の実行中にローカルで同じ賞・年を流すと競合しうる。
CREATE UNIQUE INDEX IF NOT EXISTS uq_award_sync_jobs_active
  ON public.award_sync_jobs ((true))
  WHERE status = 'running';

-- 履歴の新しい順に引くための索引
CREATE INDEX IF NOT EXISTS idx_award_sync_jobs_created
  ON public.award_sync_jobs (created_at DESC);

-- ============================================
-- 公開範囲
-- ============================================
-- RLS は有効にするが**ポリシーは置かない**。service_role は RLS をバイパスし、
-- anon / authenticated は GRANT が無いので到達しない。本アプリは NextAuth を
-- 使い Supabase Auth を使わないため auth.uid() が常に NULL であり、
-- auth.uid() ベースのポリシーを書いても意味のない行が残るだけになる
-- （根拠: 20261018053616_declare_table_grants.sql）。
ALTER TABLE public.award_sync_jobs ENABLE ROW LEVEL SECURITY;

-- 既定権限は環境差で効かない場合があり意図も読み取れないため、明示的に剥奪する
REVOKE ALL ON public.award_sync_jobs FROM anon, authenticated;

-- サーバー側（API Route）からのみ触る。
-- DELETE は付けない（ジョブ履歴を消さない方針）。
GRANT SELECT, INSERT, UPDATE ON public.award_sync_jobs TO service_role;
```

- [ ] **Step 3: 適用対象が自分の1件だけか確認する**

```bash
set -a; . ./.env.local; set +a
npx supabase db push --dry-run
```

他ブランチのマイグレーションが先行していて拒否された場合は、`.claude/rules/supabase-db.md` の「安全な回避手順」に従う。**`supabase migration repair --status reverted` は実行しない。**

- [ ] **Step 4: 適用する**

```bash
npx supabase db push
```

- [ ] **Step 5: インデックスが2件目を拒否することを確認する**

Supabase SQL Editor ではなく、トランザクション内で確認してロールバックする。`psql` が使えない場合はこの確認を Task 3 の型生成後に Node スクリプトで行ってもよい。

```sql
BEGIN;
INSERT INTO public.award_sync_jobs (award_name, award_year, status, requested_by)
  VALUES ('academy_awards', 2025, 'running', (SELECT id FROM public.users LIMIT 1));
-- 2件目は 23505 で失敗するはず
INSERT INTO public.award_sync_jobs (award_name, award_year, status, requested_by)
  VALUES ('cannes', 2024, 'running', (SELECT id FROM public.users LIMIT 1));
ROLLBACK;
```

Expected: 2件目が `duplicate key value violates unique constraint "uq_award_sync_jobs_active"` で失敗する

- [ ] **Step 6: コミット**

```bash
git -C . add supabase/migrations/
git -C . commit -m "feat(awards): 手動同期のジョブテーブルを追加

アクティブなジョブを全体で1件に絞る部分ユニークインデックスを張る。
世代付き入れ替えが UPSERT と DELETE の2文に分かれるため、並走すると
片方の DELETE が他方の UPSERT 結果を消すため。

pending 状態は持たない。started_at が NULL だと失効判定できず、
after() が running への UPDATE に到達する前に落ちると詰むため。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: レート制限アクションの追加（定数とDB制約を同時に）

**Files:**
- Modify: `src/constants/rateLimit.ts`
- Create: `supabase/migrations/<生成されるts>_add_admin_award_sync_rate_limit_actions.sql`

**Interfaces:**
- Produces: `RATE_LIMIT_ACTION.ADMIN_AWARD_SYNC`（値 `'admin_award_sync'`）、`RATE_LIMIT_ACTION.ADMIN_AWARD_SYNC_STATUS`（値 `'admin_award_sync_status'`）、`RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC`、`RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC_STATUS`

- [ ] **Step 1: `RATE_LIMIT_ACTION` に2つ追加**

`src/constants/rateLimit.ts` の `ADMIN_ACCOUNT_ISSUE` の直後に足す。

```ts
  /** admin によるアカウント発行・再発行（admin 単位） */
  ADMIN_ACCOUNT_ISSUE: 'admin_account_issue',
  /** admin による受賞作品の手動同期の実行（admin 単位） */
  ADMIN_AWARD_SYNC: 'admin_award_sync',
  /** 手動同期ジョブの進捗ポーリング（admin 単位） */
  ADMIN_AWARD_SYNC_STATUS: 'admin_award_sync_status',
} as const;
```

- [ ] **Step 2: `RATE_LIMIT_CONFIG` に閾値を追加**

`TOTP_VERIFY` の直後、`} as const;` の前に足す。

```ts
  /**
   * 受賞作品の手動同期。
   *
   * 1回の実行が最大約20分かかり、カンヌ・ゴールデングローブでは OpenAI の
   * 課金が実際に発生する（部門数ぶん記事全文を送るため）。admin セッションを
   * 奪われた場合の課金被害を上限で抑える。
   *
   * 年を1件ずつ投入する運用なので10回/時で十分な余裕がある。
   */
  ADMIN_AWARD_SYNC: { maxAttempts: 10, windowMinutes: 60 },
  /**
   * 手動同期ジョブの進捗ポーリング。
   *
   * AWARD_SYNC_POLL_INTERVAL_MS = 5000 で AWARD_SYNC_STALE_MINUTES = 25 分
   * 回すと300回。読み取りのみで外部APIを呼ばないため、倍の余裕を取る。
   *
   * ⚠️ READ_USER_DATA に相乗りさせないこと。1ジョブで300回使うため、
   *    共有カウンタだと他の認証必須読み取りを巻き込んで枯らす。
   */
  ADMIN_AWARD_SYNC_STATUS: { maxAttempts: 600, windowMinutes: 30 },
} as const;
```

- [ ] **Step 3: `FAIL_CLOSED_ACTIONS` には追加しないことをコメントで残す**

`FAIL_CLOSED_ACTIONS` の配列末尾、`ADMIN_ACCOUNT_ISSUE` の次に**コメントだけ**足す。値は足さない。

```ts
  // admin によるアカウント発行。パスワード設定リンクを任意の宛先へ送れるため、
  // 判定できないまま通すと踏み台として使われうる
  RATE_LIMIT_ACTION.ADMIN_ACCOUNT_ISSUE,
  // ⚠️ ADMIN_AWARD_SYNC はここに入れない。認証・本人確認に関わらず、
  //    DB 不調時に拒否側へ倒すと admin 自身の復旧手段まで塞ぐ。
  //    課金は伴うが、上限超過のリスクより可用性を取る。
]);
```

- [ ] **Step 4: マイグレーションファイルを作る**

```bash
npx supabase migration new add_admin_award_sync_rate_limit_actions
```

- [ ] **Step 5: 許可リストを全量再定義する**

`DROP` → `ADD` で全量を書き直す方式なので、**既存の値を1つでも落とすとその制限が壊れる**。`20261030120000_add_admin_account_issue_rate_limit_action.sql` の全値を写し、末尾に2つ足す。

```sql
-- ============================================
-- chk_action_type に受賞作品の手動同期を追加する
-- ============================================
-- 管理画面からの手動同期は OpenAI の課金を伴うため実行回数に上限を設ける。
-- 進捗ポーリングは1ジョブで300回程度叩くため、既存の読み取り系カウンタに
-- 相乗りさせず専用のアクションを切る。
--
-- ⚠️ 許可リストは src/constants/rateLimit.ts の RateLimitActionType と
-- 必ず一致させること。漏れるとその制限が無言で無効化される（#546 / #659 で2度発生）。
-- DROP → ADD で全量を再定義する方式のため、既存の値を1つでも落とすと
-- その制限が壊れる。追加するときは必ず既存の全値を書き写すこと。

ALTER TABLE rate_limits
  DROP CONSTRAINT IF EXISTS chk_action_type;

ALTER TABLE rate_limits
  ADD CONSTRAINT chk_action_type CHECK (
    action_type IN (
      -- OTP_ACTION（src/constants/otp.ts）
      'registration',
      'login',
      'password_change',
      -- RATE_LIMIT_ACTION（src/constants/rateLimit.ts）
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
      'login_ip',
      'otp_send_daily',
      'otp_verify',
      'totp_verify',
      'password_reset_request',
      'password_reset_confirm',
      -- 公開映画API（20261018052254 で追加）
      'read_api_movies',
      'search_api_movies',
      'read_api_movie_detail',
      'read_api_genres',
      -- 認証必須API（20261018052953 で追加）
      'write_api_filters',
      'read_api_user_data',
      -- 人物詳細API（20261020100000 で追加）
      'read_api_person_detail',
      -- 管理者発行アカウント（20261030120000 で追加）
      'admin_account_issue',
      -- 受賞作品の手動同期（本マイグレーションで追加）
      'admin_award_sync',
      'admin_award_sync_status',
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'rate_limits.action_type の許可リスト。src/constants/rateLimit.ts の RateLimitActionType と一致させること。漏れると該当の制限が無言で無効化される。';
```

- [ ] **Step 6: 適用する**

```bash
set -a; . ./.env.local; set +a
npx supabase db push --dry-run
npx supabase db push
```

- [ ] **Step 7: 型チェックと lint**

```bash
npx tsc --noEmit && npx eslint src/constants/rateLimit.ts
```

Expected: どちらもエラーなし

- [ ] **Step 8: コミット**

```bash
git -C . add src/constants/rateLimit.ts supabase/migrations/
git -C . commit -m "feat(awards): 手動同期のレート制限アクションを追加

定数と chk_action_type を同じコミットで更新する。片方だけだと 23514 で
失敗してその制限が無言で機能しなくなる（#546 / #659 と同じ事故）。

ポーリングは1ジョブで300回程度叩くため READ_USER_DATA に相乗りさせず
専用カウンタを切る。FAIL_CLOSED_ACTIONS には入れない（認証系ではなく、
DB 不調時に admin 自身の復旧手段を塞ぐ不利益が上回るため）。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 型の再生成

**Files:**
- Modify: `src/types/database.types.ts`（自動生成。手編集しない）

**Interfaces:**
- Produces: `Database['public']['Tables']['award_sync_jobs']` の型

- [ ] **Step 1: プロジェクトIDを確認する**

```bash
set -a; . ./.env.local; set +a
npx supabase projects list
```

- [ ] **Step 2: 型を再生成する**

```bash
npx supabase gen types typescript --project-id <project-id> > src/types/database.types.ts
```

- [ ] **Step 3: `award_sync_jobs` が含まれることを確認する**

```bash
grep -n "award_sync_jobs" src/types/database.types.ts | head -5
```

Expected: `Row` / `Insert` / `Update` の定義が現れる

- [ ] **Step 4: 型チェックと既存テスト**

```bash
npx tsc --noEmit && npx jest --silent
```

Expected: 既存テストが全て通る（型生成は既存コードに影響しないはず）

- [ ] **Step 5: コミット**

```bash
git -C . add src/types/database.types.ts
git -C . commit -m "chore(types): award_sync_jobs の追加に伴い型を再生成

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# PR 2: サービス層の抽出と OpenAI のタイムアウト設定

**完了条件:** 既存 `src/lib/awards/syncAwardMoviesService.test.ts` の16ケースが**無改修で**通る。cron の挙動は変わらない。

### Task 4: OpenAI クライアントに明示的なタイムアウトを設定する

SDK の既定は `DEFAULT_TIMEOUT = 600000`（10分）・`maxRetries = 2`。`createOpenAIClient()` は何も指定していないため、1回の呼び出しが最大30分ブロックしうる。これでは Task 9 以降の失効閾値を決める根拠が作れない。

**Files:**
- Modify: `src/constants/openai.ts`
- Modify: `src/lib/openai/client.ts`
- Test: `src/lib/openai/client.test.ts`（既存ファイルに追記）

**Interfaces:**
- Produces: `OPENAI_CONFIG.REQUEST_TIMEOUT_MS`（`45_000`）、`OPENAI_CONFIG.MAX_RETRIES`（`0`）

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/openai/client.test.ts` の `describe('createOpenAIClient')` 内に追記する。

```ts
  it('明示的なタイムアウトとリトライ回数を設定する', () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const client = createOpenAIClient();

    expect(client).not.toBeNull();
    expect(client!.timeout).toBe(45_000);
    expect(client!.maxRetries).toBe(0);
  });
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx jest src/lib/openai/client.test.ts -t 'タイムアウト' --silent
```

Expected: FAIL（`client.timeout` が 600000、`client.maxRetries` が 2）

- [ ] **Step 3: 定数を足す**

`src/constants/openai.ts` の `OPENAI_CONFIG` に追加する。

```ts
  /**
   * 1リクエストのタイムアウト（ミリ秒）。
   *
   * SDK 既定の 600000（10分）は長文生成向けで、Wikipedia 記事1本から
   * 1部門を抽出する用途には長すぎる。既定のままだと
   * 「最大何分で終わるか」が決まらず、手動同期の失効閾値
   * （AWARD_SYNC_STALE_MINUTES）に根拠を与えられない。
   */
  REQUEST_TIMEOUT_MS: 45_000,
  /**
   * SDK 側のリトライ回数。
   *
   * 0 にする。サービス層が AWARDS_MAX_RETRIES = 3 で既にリトライしており
   * （syncAwardMoviesService.ts の部門ループ）、SDK 側でも retry すると
   * 呼び出し回数と所要時間が掛け算になる。
   */
  MAX_RETRIES: 0,
```

- [ ] **Step 4: クライアントに渡す**

`src/lib/openai/client.ts` の `createOpenAIClient` を書き換える。

```ts
  return new OpenAI({
    apiKey,
    timeout: OPENAI_CONFIG.REQUEST_TIMEOUT_MS,
    maxRetries: OPENAI_CONFIG.MAX_RETRIES,
  });
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx jest src/lib/openai/client.test.ts --silent
```

Expected: PASS

- [ ] **Step 6: cron 側の既存テストが壊れていないことを確認する**

同じクライアントを cron も使うため、影響範囲を確認する。

```bash
npx jest src/lib/openai src/lib/awards src/app/api/cron --silent
```

Expected: 全て PASS

- [ ] **Step 7: コミット**

```bash
git -C . add src/constants/openai.ts src/lib/openai/client.ts src/lib/openai/client.test.ts
git -C . commit -m "feat(openai): リクエストのタイムアウトとリトライ回数を明示する

SDK 既定の timeout 10分 × maxRetries 2 のままだと1呼び出しが最大30分
ブロックしうる。手動同期の失効閾値を導くには実行時間の上界が要るため、
45秒・リトライ0に固定する。

リトライを 0 にするのは、サービス層が AWARDS_MAX_RETRIES = 3 で既に
リトライしており、SDK 側でも retry すると掛け算になるため。

cron も同じクライアントを使うが、cron は Vercel の maxDuration=300 で
5分で殺されるため、失敗が早く返るのは改善にしかならない。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `syncSingleAward()` を抽出して cron を差し替える

現行の `executeSyncAwardMoviesCron` は、賞ごとのループ本体（`syncAwardMoviesService.ts:121-208`）で「取得0件」「TMDb解決0件」「UPSERTエラー」「例外」の**4つをすべて `skippedAwards` に潰している**。cron はそれで足りるが、手動側は取得0件とそれ以外を区別しないと「0件なら既存データに触らない」ガードが書けない。

**Files:**
- Modify: `src/lib/awards/syncAwardMoviesService.ts`
- Test: `src/lib/awards/syncAwardMoviesService.test.ts`（既存は**変更しない**。新規ケースのみ追記）

**Interfaces:**
- Produces:
  ```ts
  export interface SyncSingleAwardParams {
    awardName: AwardName;
    awardDef: (typeof AWARD_DEFINITIONS)[AwardName];
    year: number;
    generatedAt: string;
  }

  export type SyncSingleAwardResult =
    | { type: 'synced'; upsertedCount: number }
    | { type: 'no_items' }
    | { type: 'no_tmdb_match' }
    | { type: 'write_failed'; error: string };

  export async function syncSingleAward(
    supabase: SupabaseClient,
    params: SyncSingleAwardParams,
  ): Promise<SyncSingleAwardResult>;

  export async function fetchAndResolveAward(
    params: SyncSingleAwardParams,
  ): Promise<{ rows: AwardMovieRow[] } | { type: 'no_items' } | { type: 'no_tmdb_match' }>;
  ```
  `fetchAndResolveAward` は書き込みを行わず、UPSERT 用の行を返す。手動側（Task 8）は書き込み方法が違うためこちらを使う。
- Consumes: なし（PR 1 とは独立）

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/awards/syncAwardMoviesService.test.ts` の末尾に新しい `describe` を足す。**既存の16ケースには一切手を触れない。**

```ts
describe('syncSingleAward', () => {
  it('generatedAt を引数で受け取り、生成した行すべてに同じ値を入れる', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const supabase = { from: jest.fn(() => ({ upsert })) } as never;

    mockFetchEigaOscarAwards.mockResolvedValue([
      { title_ja: 'A', title_en: 'A', category: 'best_picture', is_winner: true, year: 2024 },
      { title_ja: 'B', title_en: 'B', category: 'best_picture', is_winner: false, year: 2024 },
    ]);
    mockResolveAwardsWithTMDb.mockResolvedValue([
      { tmdb_movie_id: 1, title: 'A', poster_path: null, release_date: null, vote_average: null, vote_count: 0, genre_ids: null, category: 'best_picture', is_winner: true, display_order: 1 },
      { tmdb_movie_id: 2, title: 'B', poster_path: null, release_date: null, vote_average: null, vote_count: 0, genre_ids: null, category: 'best_picture', is_winner: false, display_order: 2 },
    ]);

    const result = await syncSingleAward(supabase, {
      awardName: 'academy_awards',
      awardDef: AWARD_DEFINITIONS.academy_awards,
      year: 2025,
      generatedAt: '2026-10-31T00:00:00.000Z',
    });

    expect(result).toEqual({ type: 'synced', upsertedCount: 2 });

    const rows = upsert.mock.calls[0][0] as { generated_at: string }[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.generated_at === '2026-10-31T00:00:00.000Z')).toBe(true);
  });

  it('取得0件を no_items として返す（TMDb解決0件と区別する）', async () => {
    const supabase = { from: jest.fn() } as never;
    mockFetchEigaOscarAwards.mockResolvedValue([]);
    mockFetchAwardsFromOpenAI.mockResolvedValue(null);
    mockFetchWikipediaArticle.mockResolvedValue(null);

    const result = await syncSingleAward(supabase, {
      awardName: 'academy_awards',
      awardDef: AWARD_DEFINITIONS.academy_awards,
      year: 2025,
      generatedAt: '2026-10-31T00:00:00.000Z',
    });

    expect(result).toEqual({ type: 'no_items' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('TMDb解決0件を no_tmdb_match として返す', async () => {
    const supabase = { from: jest.fn() } as never;
    mockFetchEigaOscarAwards.mockResolvedValue([
      { title_ja: 'A', title_en: 'A', category: 'best_picture', is_winner: true, year: 2024 },
    ]);
    mockResolveAwardsWithTMDb.mockResolvedValue([]);

    const result = await syncSingleAward(supabase, {
      awardName: 'academy_awards',
      awardDef: AWARD_DEFINITIONS.academy_awards,
      year: 2025,
      generatedAt: '2026-10-31T00:00:00.000Z',
    });

    expect(result).toEqual({ type: 'no_tmdb_match' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('UPSERT 失敗を write_failed として返す', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: { message: 'boom' } });
    const supabase = { from: jest.fn(() => ({ upsert })) } as never;

    mockFetchEigaOscarAwards.mockResolvedValue([
      { title_ja: 'A', title_en: 'A', category: 'best_picture', is_winner: true, year: 2024 },
    ]);
    mockResolveAwardsWithTMDb.mockResolvedValue([
      { tmdb_movie_id: 1, title: 'A', poster_path: null, release_date: null, vote_average: null, vote_count: 0, genre_ids: null, category: 'best_picture', is_winner: true, display_order: 1 },
    ]);

    const result = await syncSingleAward(supabase, {
      awardName: 'academy_awards',
      awardDef: AWARD_DEFINITIONS.academy_awards,
      year: 2025,
      generatedAt: '2026-10-31T00:00:00.000Z',
    });

    expect(result).toEqual({ type: 'write_failed', error: 'boom' });
  });

  it('同じユニークキーの重複行を除外する', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const supabase = { from: jest.fn(() => ({ upsert })) } as never;

    mockFetchEigaOscarAwards.mockResolvedValue([
      { title_ja: 'A', title_en: 'A', category: 'best_picture', is_winner: true, year: 2024 },
    ]);
    // 同一 tmdb_movie_id × 同一 category が2件返る
    mockResolveAwardsWithTMDb.mockResolvedValue([
      { tmdb_movie_id: 1, title: 'A', poster_path: null, release_date: null, vote_average: null, vote_count: 0, genre_ids: null, category: 'best_picture', is_winner: true, display_order: 1 },
      { tmdb_movie_id: 1, title: 'A', poster_path: null, release_date: null, vote_average: null, vote_count: 0, genre_ids: null, category: 'best_picture', is_winner: false, display_order: 2 },
    ]);

    const result = await syncSingleAward(supabase, {
      awardName: 'academy_awards',
      awardDef: AWARD_DEFINITIONS.academy_awards,
      year: 2025,
      generatedAt: '2026-10-31T00:00:00.000Z',
    });

    expect(result).toEqual({ type: 'synced', upsertedCount: 1 });
    expect(upsert.mock.calls[0][0]).toHaveLength(1);
  });
});
```

既存テストが使っているモック変数名（`mockFetchEigaOscarAwards` 等）はファイル冒頭の定義に合わせること。名前が違う場合は既存の定義を読んで合わせる。

- [ ] **Step 2: 失敗することを確認する**

```bash
npx jest src/lib/awards/syncAwardMoviesService.test.ts -t 'syncSingleAward' --silent
```

Expected: FAIL（`syncSingleAward is not a function`）

- [ ] **Step 3: 取得部分を関数に切り出す**

`syncAwardMoviesService.ts` に追加する。既存の `fetchAwardItemsViaWikipedia` はそのまま残す。

```ts
/** award_movies への UPSERT 用の1行 */
export interface AwardMovieRow {
  tmdb_movie_id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
  vote_count: number;
  genre_ids: number[] | null;
  award_name: string;
  award_year: number;
  category: string;
  is_winner: boolean;
  display_order: number;
  person_name: string | null;
  generated_at: string;
}

/** syncSingleAward / fetchAndResolveAward の入力 */
export interface SyncSingleAwardParams {
  awardName: AwardName;
  awardDef: (typeof AWARD_DEFINITIONS)[AwardName];
  year: number;
  generatedAt: string;
}

/** 1賞ぶんの同期結果 */
export type SyncSingleAwardResult =
  | { type: 'synced'; upsertedCount: number }
  | { type: 'no_items' }
  | { type: 'no_tmdb_match' }
  | { type: 'write_failed'; error: string };

/**
 * 1賞ぶんの受賞作品を取得し、UPSERT 用の行に整形する
 *
 * **書き込みは行わない。** cron は UPSERT のみ、手動同期は UPSERT してから
 * 旧世代を削除するという違いがあるため、書き込み方法は呼び出し元に委ねる。
 *
 * 「取得0件」と「TMDb解決0件」を区別して返す。手動同期は取得0件のときに
 * 既存データへ一切触れないガードを掛けるため、潰してはいけない。
 */
export async function fetchAndResolveAward(
  params: SyncSingleAwardParams,
): Promise<{ type: 'rows'; rows: AwardMovieRow[] } | { type: 'no_items' } | { type: 'no_tmdb_match' }> {
  const { awardName, awardDef, year, generatedAt } = params;

  let allAiItems: OpenAiAwardItem[];

  if (awardName === 'academy_awards') {
    // アカデミー賞: eiga.com から正規表現で抽出（ハルシネーションなし）
    allAiItems = await fetchEigaOscarAwards(year);
    if (allAiItems.length === 0) {
      // eiga.com取得失敗時はWikipedia+OpenAIにフォールバック
      console.warn(
        `eiga.com returned 0 items for ${year}, falling back to Wikipedia+OpenAI`,
      );
      allAiItems = await fetchAwardItemsViaWikipedia(awardName, awardDef, year);
    }
  } else {
    allAiItems = await fetchAwardItemsViaWikipedia(awardName, awardDef, year);
  }

  if (allAiItems.length === 0) {
    return { type: 'no_items' };
  }

  const resolved = await resolveAwardsWithTMDb(allAiItems, awardDef);

  if (resolved.length === 0) {
    console.warn(`No TMDb results for ${awardName} ${year}`);
    return { type: 'no_tmdb_match' };
  }

  // 部門ラベルは AWARD_DEFINITIONS（アプリ定数）を単一ソースとし DB には保存しない
  const rows: AwardMovieRow[] = resolved.map((r) => ({
    tmdb_movie_id: r.tmdb_movie_id,
    title: r.title,
    poster_path: r.poster_path,
    release_date: r.release_date,
    vote_average: r.vote_average,
    vote_count: r.vote_count,
    genre_ids: r.genre_ids,
    award_name: awardName,
    award_year: year,
    category: r.category,
    is_winner: r.is_winner,
    display_order: r.display_order,
    person_name: r.person_name ?? null,
    generated_at: generatedAt,
  }));

  return { type: 'rows', rows: dedupeAwardRows(rows) };
}

/**
 * 同じユニークキー（tmdb_movie_id × award_name × award_year × category）の行を除く
 *
 * `resolveAwardsWithTMDb` は重複を返しうる。UPSERT なら吸収されるが、
 * 手動同期側は一意制約違反が全行ロールバックに直結するため、
 * 両経路でこの除去を共有する。
 */
export function dedupeAwardRows(rows: AwardMovieRow[]): AwardMovieRow[] {
  const seen = new Set<string>();

  return rows.filter((r) => {
    const key = `${r.tmdb_movie_id}:${r.award_name}:${r.award_year}:${r.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 1賞ぶんを取得して UPSERT する（cron 用）
 *
 * 例外は**握り潰さずに投げる**。cron 側のループが従来どおり catch して
 * 「エラーでも他の賞は続行」を維持する。中で握り潰すと手動同期側が
 * 失敗理由を error_message に書けなくなる。
 */
export async function syncSingleAward(
  supabase: SupabaseClient,
  params: SyncSingleAwardParams,
): Promise<SyncSingleAwardResult> {
  const resolved = await fetchAndResolveAward(params);

  if (resolved.type !== 'rows') {
    return resolved;
  }

  const { error } = await supabase
    .from('award_movies')
    .upsert(resolved.rows, {
      onConflict: 'tmdb_movie_id,award_name,award_year,category',
    });

  if (error) {
    console.error(`Failed to upsert ${params.awardName}:`, error);
    return { type: 'write_failed', error: error.message };
  }

  return { type: 'synced', upsertedCount: resolved.rows.length };
}
```

- [ ] **Step 4: cron のループを差し替える**

`executeSyncAwardMoviesCron` の `for` ループ本体（現行 `:121-208`）を置き換える。**4つの結果をすべて `skippedAwards` に潰す従来の挙動を保つ。**

```ts
  for (const [awardName, awardDef] of targetAwards) {
    try {
      const result = await syncSingleAward(supabase, {
        awardName,
        awardDef,
        year: syncYear,
        generatedAt,
      });

      if (result.type === 'synced') {
        totalUpserted += result.upsertedCount;
        syncedAwards.push(awardName);
        continue;
      }

      // cron は「取得0件」「TMDb解決0件」「書き込み失敗」を区別しない。
      // 月次実行のサマリーとしては skipped にまとめれば足りる
      skippedAwards.push(awardName);
    } catch (error) {
      console.error(`Error processing ${awardName}:`, error);
      skippedAwards.push(awardName);
    }
  }
```

- [ ] **Step 5: 新規テストが通ることを確認する**

```bash
npx jest src/lib/awards/syncAwardMoviesService.test.ts -t 'syncSingleAward' --silent
```

Expected: PASS（5ケース）

- [ ] **Step 6: 既存の16ケースが無改修で通ることを確認する**

これが本タスクの完了条件。

```bash
npx jest src/lib/awards/syncAwardMoviesService.test.ts --silent
git -C . diff --stat src/lib/awards/syncAwardMoviesService.test.ts
```

Expected: 全ケース PASS。差分は**追記のみ**（既存行の変更が無いこと）

- [ ] **Step 7: cron ルートのテストと型チェック**

```bash
npx jest src/app/api/cron/sync-award-movies --silent && npx tsc --noEmit && npx eslint src/lib/awards/
```

Expected: 全て通る

- [ ] **Step 8: コミット**

```bash
git -C . add src/lib/awards/syncAwardMoviesService.ts src/lib/awards/syncAwardMoviesService.test.ts
git -C . commit -m "refactor(awards): 1賞ぶんの同期を syncSingleAward に切り出す

手動同期と cron で書き込み方法が違う（cron は UPSERT のみ、手動は
UPSERT 後に旧世代を削除）ため、取得・整形までを fetchAndResolveAward に、
UPSERT までを syncSingleAward に分ける。

現行ループは「取得0件」「TMDb解決0件」「UPSERTエラー」「例外」を
すべて skippedAwards に潰していたが、手動側は取得0件のときに既存データへ
触れないガードが要るため、判別可能な結果型で返す。cron 側は従来どおり
すべて skipped にまとめるので挙動は変わらない。

例外は握り潰さず投げる。中で潰すと手動側が error_message に書けない。
dedupe も共有する（一意制約違反が手動側では全行ロールバックになるため）。

既存テスト16ケースは無改修で通ることを確認済み。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# PR 3: API 層

**完了条件:** route とサービスの単体テストが通り、409・失効の自己検知・UPSERT 失敗時に DELETE へ進まないことを検証済み。

### Task 6: 定数とバリデーションスキーマ

**Files:**
- Create: `src/constants/awardSync.ts`
- Create: `src/constants/awardSync.test.ts`
- Create: `src/schema/awardSync.ts`
- Create: `src/schema/awardSync.test.ts`
- Modify: `src/constants/index.ts`

**Interfaces:**
- Produces: `SyncableAwardName`, `SYNCABLE_AWARD_NAMES`, `SYNCABLE_AWARD_OPTIONS`, `AWARD_SYNC_MIN_YEAR`, `AWARD_SYNC_STALE_MINUTES`, `AWARD_SYNC_POLL_INTERVAL_MS`, `AWARD_SYNC_STATUS`, `AwardSyncStatus`, `AWARD_SYNC_MESSAGES`, `awardSyncCreateSchema`, `AwardSyncCreateInput`

- [ ] **Step 1: 失敗するテストを書く**

`src/constants/awardSync.test.ts`:

```ts
import {
  SYNCABLE_AWARD_NAMES,
  SYNCABLE_AWARD_OPTIONS,
  AWARD_SYNC_MIN_YEAR,
} from './awardSync';

describe('awardSync constants', () => {
  it('同期対象の賞は AWARDS_EXCLUDED を除いた3賞', () => {
    expect(SYNCABLE_AWARD_NAMES).toEqual([
      'academy_awards',
      'cannes',
      'golden_globes',
    ]);
  });

  it('日本アカデミー賞を含まない', () => {
    expect(SYNCABLE_AWARD_NAMES).not.toContain('japan_academy_awards');
  });

  it('セレクト用の選択肢がラベル付きで並ぶ', () => {
    expect(SYNCABLE_AWARD_OPTIONS).toEqual([
      { value: 'academy_awards', label: 'アカデミー賞' },
      { value: 'cannes', label: 'カンヌ映画祭' },
      { value: 'golden_globes', label: 'ゴールデングローブ賞' },
    ]);
  });

  it('賞ごとに取得可能な最小年を持つ', () => {
    expect(AWARD_SYNC_MIN_YEAR.academy_awards).toBe(1928);
    expect(AWARD_SYNC_MIN_YEAR.golden_globes).toBe(1943);
    // カンヌは firstEditionYear が 0（年ベーステンプレート）なので明示値
    expect(AWARD_SYNC_MIN_YEAR.cannes).toBe(1946);
  });
});
```

`src/schema/awardSync.test.ts`:

```ts
import { awardSyncCreateSchema } from './awardSync';

describe('awardSyncCreateSchema', () => {
  const currentYear = new Date().getFullYear();

  it('有効な入力を受け付ける', () => {
    const result = awardSyncCreateSchema.safeParse({
      awardName: 'cannes',
      year: 2024,
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.force).toBe(false);
  });

  it('force を明示できる', () => {
    const result = awardSyncCreateSchema.safeParse({
      awardName: 'cannes',
      year: 2024,
      force: true,
    });

    expect(result.success && result.data.force).toBe(true);
  });

  it('同期対象外の賞を拒否する', () => {
    const result = awardSyncCreateSchema.safeParse({
      awardName: 'japan_academy_awards',
      year: 2024,
    });

    expect(result.success).toBe(false);
  });

  it('存在しない賞キーを拒否する', () => {
    expect(
      awardSyncCreateSchema.safeParse({ awardName: 'oscar', year: 2024 })
        .success,
    ).toBe(false);
  });

  it('賞ごとの下限より前の年を拒否する', () => {
    // カンヌの第1回は1946年
    expect(
      awardSyncCreateSchema.safeParse({ awardName: 'cannes', year: 1945 })
        .success,
    ).toBe(false);
    expect(
      awardSyncCreateSchema.safeParse({ awardName: 'cannes', year: 1946 })
        .success,
    ).toBe(true);
  });

  it('翌年より先の年を拒否する', () => {
    expect(
      awardSyncCreateSchema.safeParse({
        awardName: 'cannes',
        year: currentYear + 1,
      }).success,
    ).toBe(true);
    expect(
      awardSyncCreateSchema.safeParse({
        awardName: 'cannes',
        year: currentYear + 2,
      }).success,
    ).toBe(false);
  });

  it('整数でない年を拒否する', () => {
    expect(
      awardSyncCreateSchema.safeParse({ awardName: 'cannes', year: 2024.5 })
        .success,
    ).toBe(false);
  });

  it('年が未入力なら拒否する', () => {
    expect(
      awardSyncCreateSchema.safeParse({ awardName: 'cannes' }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx jest src/constants/awardSync.test.ts src/schema/awardSync.test.ts --silent
```

Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 定数を実装する**

`src/constants/awardSync.ts`:

```ts
/**
 * 受賞作品の手動同期（管理画面）の定数
 *
 * 設計: `.claude/documents/admin-award-sync-design.md`
 */

import {
  AWARD_DEFINITIONS,
  AWARDS_EXCLUDED,
  type AwardName,
} from './awards';

/** 手動同期できる賞（cron 対象外の賞を除く） */
export type SyncableAwardName = Exclude<
  AwardName,
  (typeof AWARDS_EXCLUDED)[number]
>;

/**
 * 手動同期できる賞の一覧
 *
 * モジュールスコープで1度だけ作る。画面側で毎レンダー再計算しないため。
 * `AWARD_DEFINITIONS` / `AWARDS_EXCLUDED` を単一ソースにしているので、
 * 賞を増やすときは定数を足すだけで選択肢に反映される。
 */
export const SYNCABLE_AWARD_NAMES = (
  Object.keys(AWARD_DEFINITIONS) as AwardName[]
).filter(
  (name): name is SyncableAwardName =>
    !(AWARDS_EXCLUDED as readonly string[]).includes(name),
);

/** セレクトの選択肢 */
export const SYNCABLE_AWARD_OPTIONS = SYNCABLE_AWARD_NAMES.map((name) => ({
  value: name,
  label: AWARD_DEFINITIONS[name].label,
}));

/**
 * 賞ごとに取得できる最も古い年（授賞式の年）
 *
 * `AWARD_YEAR_RANGE`（1900〜2100）は表示用の範囲で、ここでは使わない。
 * 記事が存在しない年を指定すると OpenAI 到達前に空配列が返るため暴発は
 * しないが、記事がある年なら無駄に全部門ぶん課金してしまう。
 *
 * カンヌは `firstEditionYear` が 0（Wikipedia テンプレートが年ベースのため
 * 回数計算が不要）なので、第1回の開催年を明示する。
 */
export const AWARD_SYNC_MIN_YEAR: Record<SyncableAwardName, number> = {
  academy_awards: AWARD_DEFINITIONS.academy_awards.firstEditionYear,
  golden_globes: AWARD_DEFINITIONS.golden_globes.firstEditionYear,
  cannes: 1946,
};

/** ジョブの状態 */
export const AWARD_SYNC_STATUS = {
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
} as const;

export type AwardSyncStatus =
  (typeof AWARD_SYNC_STATUS)[keyof typeof AWARD_SYNC_STATUS];

/**
 * 実行中ジョブを「停止した可能性あり」とみなすまでの分数
 *
 * 上界の導出: 最大部門数9（ゴールデングローブ） × AWARDS_MAX_RETRIES 3 ×
 * OPENAI_CONFIG.REQUEST_TIMEOUT_MS 45秒 = 1215秒 ≈ 20.25分。
 * マージンを足して25分。
 *
 * ⚠️ OPENAI_CONFIG.REQUEST_TIMEOUT_MS / MAX_RETRIES を変えたらこの値も
 *    見直すこと。SDK 既定（10分 × 2リトライ）に戻すと上界が54分になり、
 *    この閾値では正常実行を途中で強制失効できてしまう。
 */
export const AWARD_SYNC_STALE_MINUTES = 25;

/**
 * 進捗ポーリングの間隔（ミリ秒）
 *
 * AWARD_SYNC_STALE_MINUTES の間回すと約300回。
 * RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC_STATUS（600回/30分）の半分に収まる。
 */
export const AWARD_SYNC_POLL_INTERVAL_MS = 5_000;

/** ポーリングを打ち切るまでの連続失敗回数 */
export const AWARD_SYNC_MAX_POLL_FAILURES = 3;

/** 画面・APIのメッセージ */
export const AWARD_SYNC_MESSAGES = {
  PAGE_TITLE: '受賞作品の手動同期',
  INVALID_BODY: '同期の指定が正しくありません',
  ALREADY_RUNNING: '実行中の同期があります',
  NOT_FOUND: '指定された同期ジョブが見つかりません',
  START_ERROR: '同期の開始に失敗しました',
  FETCH_ERROR: '同期の状態取得に失敗しました',
  NO_ITEMS: '受賞作品を取得できませんでした（既存データは変更していません）',
  NO_TMDB_MATCH:
    'TMDbで該当する映画を特定できませんでした（既存データは変更していません）',
  WRITE_FAILED: 'データベースへの書き込みに失敗しました',
  SUPERSEDED: '強制失効により中断されました',
  STALE_HINT: '実行中の処理自体は止まりません（OpenAI の課金は続きます）',
} as const;
```

- [ ] **Step 4: `src/constants/index.ts` に再エクスポートを足す**

既存の `export * from './awards';` の並びに合わせる。

```ts
export * from './awardSync';
```

- [ ] **Step 5: zod スキーマを実装する**

`src/schema/awardSync.ts`:

```ts
/**
 * 受賞作品の手動同期のバリデーションスキーマ
 *
 * 設計: `.claude/documents/admin-award-sync-design.md`
 */

import { z } from 'zod';

import {
  AWARD_SYNC_MIN_YEAR,
  SYNCABLE_AWARD_NAMES,
  type SyncableAwardName,
} from '@/constants/awardSync';

const awardNameTuple = SYNCABLE_AWARD_NAMES as [
  SyncableAwardName,
  ...SyncableAwardName[],
];

/**
 * 同期リクエスト
 *
 * 年の上限は「当年+1」。授賞式が翌年初頭に行われる賞（ゴールデングローブは
 * 1月）があるため当年だけでは足りない。下限は賞ごとに違うので superRefine で
 * 見る（第1回より前の年は記事が無く、問い合わせるだけ無駄）。
 */
export const awardSyncCreateSchema = z
  .object({
    awardName: z.enum(awardNameTuple),
    year: z.number().int(),
    /** 失効した実行中ジョブを強制的に閉じてから起票する */
    force: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    const minYear = AWARD_SYNC_MIN_YEAR[value.awardName];
    const maxYear = new Date().getFullYear() + 1;

    if (value.year < minYear || value.year > maxYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['year'],
        message: `${minYear}年から${maxYear}年の間で指定してください`,
      });
    }
  });

export type AwardSyncCreateInput = z.infer<typeof awardSyncCreateSchema>;
```

- [ ] **Step 6: テストが通ることを確認する**

```bash
npx jest src/constants/awardSync.test.ts src/schema/awardSync.test.ts --silent
```

Expected: PASS（全13ケース）

- [ ] **Step 7: 型チェックと lint**

```bash
npx tsc --noEmit && npx eslint src/constants/awardSync.ts src/schema/awardSync.ts
```

- [ ] **Step 8: コミット**

```bash
git -C . add src/constants/awardSync.ts src/constants/awardSync.test.ts src/constants/index.ts src/schema/awardSync.ts src/schema/awardSync.test.ts
git -C . commit -m "feat(awards): 手動同期の定数とバリデーションスキーマを追加

選択肢は AWARD_DEFINITIONS から AWARDS_EXCLUDED を除いてモジュール
スコープで1度だけ生成する。賞を増やすときに定数だけで追従でき、
画面側の毎レンダー再計算も避けられる。

年の下限は賞ごとに持つ。AWARD_YEAR_RANGE（1900〜2100）は表示用の範囲で、
記事の無い年を指定すると全部門ぶん無駄に課金するため。カンヌは
firstEditionYear が 0 なので第1回の1946年を明示する。

失効閾値25分は OPENAI_CONFIG のタイムアウトから導出した値なので、
片方を変えたらもう片方も見直す旨をコメントに残した。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: ジョブ行の CRUD（失効の自己検知つき）

強制失効はジョブ行を `failed` にするだけで、走行中の `after()` を止められない。その瞬間に部分ユニークインデックスの述語から外れて保護も消えるため、**旧プロセスと新プロセスが同じ賞・年に並走しうる**。これを防ぐため、`after()` 側の書き込みはすべて `status = 'running'` を条件にし、0行更新なら失効させられたと判断する。

**Files:**
- Create: `src/lib/awards/awardSyncJob.ts`
- Create: `src/lib/awards/awardSyncJob.test.ts`

**Interfaces:**
- Consumes: `AWARD_SYNC_STATUS`, `AwardSyncStatus`, `SyncableAwardName`（Task 6）
- Produces:
  ```ts
  export interface AwardSyncJob {
    id: string;
    awardName: string;
    awardYear: number;
    status: AwardSyncStatus;
    totalUpserted: number | null;
    errorMessage: string | null;
    createdAt: string;
    startedAt: string;
    finishedAt: string | null;
  }

  export async function createRunningJob(supabase, params: { awardName: SyncableAwardName; year: number; requestedBy: string }): Promise<{ job: AwardSyncJob } | { conflict: true }>;
  export async function findRunningJob(supabase): Promise<AwardSyncJob | null>;
  export async function findJobById(supabase, id: string): Promise<AwardSyncJob | null>;
  export async function findLatestJob(supabase): Promise<AwardSyncJob | null>;
  export async function finishJobIfRunning(supabase, id: string, patch: { status: 'succeeded' | 'failed'; totalUpserted?: number; errorMessage?: string }): Promise<boolean>;
  export async function isJobStillRunning(supabase, id: string): Promise<boolean>;
  export function isJobStale(job: AwardSyncJob, now?: Date): boolean;
  ```

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/awards/awardSyncJob.test.ts`:

```ts
/**
 * @jest-environment node
 */

import {
  finishJobIfRunning,
  isJobStale,
  type AwardSyncJob,
} from './awardSyncJob';
import { AWARD_SYNC_STALE_MINUTES } from '@/constants/awardSync';

const baseJob: AwardSyncJob = {
  id: '11111111-1111-4111-8111-111111111111',
  awardName: 'cannes',
  awardYear: 2024,
  status: 'running',
  totalUpserted: null,
  errorMessage: null,
  createdAt: '2026-10-31T00:00:00.000Z',
  startedAt: '2026-10-31T00:00:00.000Z',
  finishedAt: null,
};

describe('isJobStale', () => {
  it('閾値未満なら false', () => {
    const now = new Date('2026-10-31T00:24:00.000Z');

    expect(isJobStale(baseJob, now)).toBe(false);
  });

  it('閾値ちょうどで true', () => {
    const now = new Date(
      Date.parse(baseJob.startedAt) + AWARD_SYNC_STALE_MINUTES * 60_000,
    );

    expect(isJobStale(baseJob, now)).toBe(true);
  });

  it('終端状態のジョブは stale 扱いしない', () => {
    const now = new Date('2026-11-01T00:00:00.000Z');

    expect(isJobStale({ ...baseJob, status: 'succeeded' }, now)).toBe(false);
  });
});

describe('finishJobIfRunning', () => {
  it('status=running の行だけを更新する', async () => {
    const select = jest.fn().mockResolvedValue({ data: [{ id: baseJob.id }], error: null });
    const eqStatus = jest.fn(() => ({ select }));
    const eqId = jest.fn(() => ({ eq: eqStatus }));
    const update = jest.fn(() => ({ eq: eqId }));
    const supabase = { from: jest.fn(() => ({ update })) } as never;

    const updated = await finishJobIfRunning(supabase, baseJob.id, {
      status: 'succeeded',
      totalUpserted: 12,
    });

    expect(updated).toBe(true);
    expect(eqId).toHaveBeenCalledWith('id', baseJob.id);
    expect(eqStatus).toHaveBeenCalledWith('status', 'running');
    expect(update.mock.calls[0][0]).toMatchObject({
      status: 'succeeded',
      total_upserted: 12,
    });
  });

  it('0行更新なら false を返す（強制失効されていた）', async () => {
    const select = jest.fn().mockResolvedValue({ data: [], error: null });
    const eqStatus = jest.fn(() => ({ select }));
    const eqId = jest.fn(() => ({ eq: eqStatus }));
    const update = jest.fn(() => ({ eq: eqId }));
    const supabase = { from: jest.fn(() => ({ update })) } as never;

    const updated = await finishJobIfRunning(supabase, baseJob.id, {
      status: 'succeeded',
      totalUpserted: 12,
    });

    expect(updated).toBe(false);
  });

  it('DBエラーなら false を返す', async () => {
    const select = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    const eqStatus = jest.fn(() => ({ select }));
    const eqId = jest.fn(() => ({ eq: eqStatus }));
    const update = jest.fn(() => ({ eq: eqId }));
    const supabase = { from: jest.fn(() => ({ update })) } as never;

    expect(
      await finishJobIfRunning(supabase, baseJob.id, { status: 'failed', errorMessage: 'x' }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx jest src/lib/awards/awardSyncJob.test.ts --silent
```

Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

`src/lib/awards/awardSyncJob.ts`:

```ts
/**
 * 受賞作品の手動同期ジョブの読み書き
 *
 * ⚠️ after() 側からの書き込みは必ず `status = 'running'` を条件にすること。
 * 強制失効はジョブ行を failed にするだけで走行中の処理を止められないため、
 * 条件を付けないと失効済みのジョブが succeeded に化け、さらに新しいジョブと
 * 同じ賞・年へ並走して書き込んでしまう。
 *
 * 設計: `.claude/documents/admin-award-sync-design.md`
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  AWARD_SYNC_STALE_MINUTES,
  AWARD_SYNC_STATUS,
  type AwardSyncStatus,
  type SyncableAwardName,
} from '@/constants/awardSync';
import { MS_PER_MINUTE } from '@/constants';

const TABLE = 'award_sync_jobs';

/** 画面・APIに返すジョブ */
export interface AwardSyncJob {
  id: string;
  awardName: string;
  awardYear: number;
  status: AwardSyncStatus;
  totalUpserted: number | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string;
  finishedAt: string | null;
}

/** DB の行 */
interface AwardSyncJobRow {
  id: string;
  award_name: string;
  award_year: number;
  status: AwardSyncStatus;
  total_upserted: number | null;
  error_message: string | null;
  created_at: string;
  started_at: string;
  finished_at: string | null;
}

const SELECT_COLUMNS =
  'id, award_name, award_year, status, total_upserted, error_message, created_at, started_at, finished_at';

function toJob(row: AwardSyncJobRow): AwardSyncJob {
  return {
    id: row.id,
    awardName: row.award_name,
    awardYear: row.award_year,
    status: row.status,
    totalUpserted: row.total_upserted,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

/**
 * 実行中ジョブが「停止した可能性あり」かを判定する
 *
 * 自動で failed に倒すためではなく、画面に強制失効の操作を出すかどうかを
 * 決めるために使う。走っている最中の処理を誤って切らせないため、閾値未満では
 * 操作を出さない。
 */
export function isJobStale(job: AwardSyncJob, now: Date = new Date()): boolean {
  if (job.status !== AWARD_SYNC_STATUS.RUNNING) return false;

  const elapsed = now.getTime() - Date.parse(job.startedAt);

  return elapsed >= AWARD_SYNC_STALE_MINUTES * MS_PER_MINUTE;
}

/**
 * 実行中ジョブを起票する
 *
 * 部分ユニークインデックス `uq_award_sync_jobs_active` により、アクティブな
 * ジョブが既にあると 23505 で弾かれる。事前チェックとの競合をここで吸収する。
 */
export async function createRunningJob(
  supabase: SupabaseClient,
  params: { awardName: SyncableAwardName; year: number; requestedBy: string },
): Promise<{ job: AwardSyncJob } | { conflict: true }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      award_name: params.awardName,
      award_year: params.year,
      status: AWARD_SYNC_STATUS.RUNNING,
      requested_by: params.requestedBy,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') return { conflict: true };
    throw error;
  }

  return { job: toJob(data as AwardSyncJobRow) };
}

/** 実行中のジョブを1件取得する（アクティブは全体で1件までなので最大1件） */
export async function findRunningJob(
  supabase: SupabaseClient,
): Promise<AwardSyncJob | null> {
  const { data } = await supabase
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .eq('status', AWARD_SYNC_STATUS.RUNNING)
    .maybeSingle();

  return data ? toJob(data as AwardSyncJobRow) : null;
}

/** IDでジョブを取得する */
export async function findJobById(
  supabase: SupabaseClient,
  id: string,
): Promise<AwardSyncJob | null> {
  const { data } = await supabase
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  return data ? toJob(data as AwardSyncJobRow) : null;
}

/** 最新のジョブを取得する（リロード後の復元用） */
export async function findLatestJob(
  supabase: SupabaseClient,
): Promise<AwardSyncJob | null> {
  const { data } = await supabase
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? toJob(data as AwardSyncJobRow) : null;
}

/**
 * 実行中ジョブを終端状態にする
 *
 * @returns 更新できたら true。**false は「強制失効させられていた」を意味する**
 */
export async function finishJobIfRunning(
  supabase: SupabaseClient,
  id: string,
  patch: {
    status: typeof AWARD_SYNC_STATUS.SUCCEEDED | typeof AWARD_SYNC_STATUS.FAILED;
    totalUpserted?: number;
    errorMessage?: string;
  },
): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: patch.status,
      total_upserted: patch.totalUpserted ?? null,
      error_message: patch.errorMessage ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', AWARD_SYNC_STATUS.RUNNING)
    .select('id');

  if (error) {
    console.error(`[awardSyncJob] 終端状態への更新に失敗しました id=${id}`, error);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

/**
 * ジョブがまだ running かを確認する
 *
 * 書き込みフェーズに入る直前に呼び、強制失効されていたら中止する。
 */
export async function isJobStillRunning(
  supabase: SupabaseClient,
  id: string,
): Promise<boolean> {
  const { data } = await supabase
    .from(TABLE)
    .select('id')
    .eq('id', id)
    .eq('status', AWARD_SYNC_STATUS.RUNNING)
    .maybeSingle();

  return !!data;
}
```

`MS_PER_MINUTE` が `src/constants` に無ければ `60_000` を直接使わず、`src/constants/time.ts` 等の既存定数を確認して合わせる（`MS_PER_SECOND` は `src/lib/rateLimit/rateLimit.ts` が import している）。

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx jest src/lib/awards/awardSyncJob.test.ts --silent
```

Expected: PASS（6ケース）

- [ ] **Step 5: 型チェックと lint**

```bash
npx tsc --noEmit && npx eslint src/lib/awards/awardSyncJob.ts
```

- [ ] **Step 6: コミット**

```bash
git -C . add src/lib/awards/awardSyncJob.ts src/lib/awards/awardSyncJob.test.ts
git -C . commit -m "feat(awards): 同期ジョブのCRUDを追加（失効の自己検知つき）

強制失効はジョブ行を failed にするだけで走行中の after() を止められず、
その瞬間に部分ユニークインデックスの保護も外れる。条件なしで書き込むと
失効済みジョブが succeeded に化け、新しいジョブと同じ賞・年へ並走する。

そのため finishJobIfRunning は status='running' を条件に更新し、
0行更新を「失効させられた」として呼び出し元に返す。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 世代付き入れ替えの実装

**この計画で最も壊すと痛い箇所。** `DELETE → INSERT` の順にすると、DELETE がコミットした後に INSERT が失敗した時点でその賞・年のデータが復旧不能になる。順序を逆にして「UPSERT してから `generated_at` が古い行だけ消す」ことで、失敗時に既存データが残るようにする。

**Files:**
- Create: `src/lib/awards/manualAwardSync.ts`
- Create: `src/lib/awards/manualAwardSync.test.ts`

**Interfaces:**
- Consumes: `fetchAndResolveAward`（Task 5）、`finishJobIfRunning` / `isJobStillRunning`（Task 7）、`AWARD_SYNC_MESSAGES`（Task 6）
- Produces: `executeManualAwardSync(supabase, params: { jobId: string; awardName: SyncableAwardName; year: number }): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/awards/manualAwardSync.test.ts`:

```ts
/**
 * @jest-environment node
 */

import { executeManualAwardSync } from './manualAwardSync';
import { AWARD_SYNC_MESSAGES } from '@/constants/awardSync';

const mockFetchAndResolveAward = jest.fn();
jest.mock('./syncAwardMoviesService', () => ({
  fetchAndResolveAward: (...args: unknown[]) => mockFetchAndResolveAward(...args),
}));

const mockFinishJobIfRunning = jest.fn();
const mockIsJobStillRunning = jest.fn();
jest.mock('./awardSyncJob', () => ({
  finishJobIfRunning: (...args: unknown[]) => mockFinishJobIfRunning(...args),
  isJobStillRunning: (...args: unknown[]) => mockIsJobStillRunning(...args),
}));

const JOB_ID = '11111111-1111-4111-8111-111111111111';

/** award_movies テーブルの upsert / delete をモックする */
function createSupabase(options?: {
  upsertError?: { message: string } | null;
  deleteError?: { message: string } | null;
}) {
  const upsert = jest
    .fn()
    .mockResolvedValue({ error: options?.upsertError ?? null });
  const ltMock = jest
    .fn()
    .mockResolvedValue({ error: options?.deleteError ?? null });
  const eqYear = jest.fn(() => ({ lt: ltMock }));
  const eqName = jest.fn(() => ({ eq: eqYear }));
  const del = jest.fn(() => ({ eq: eqName }));
  const from = jest.fn(() => ({ upsert, delete: del }));

  return {
    supabase: { from } as never,
    from,
    upsert,
    del,
    eqName,
    eqYear,
    lt: ltMock,
  };
}

const ROWS = [
  { tmdb_movie_id: 1, award_name: 'cannes', award_year: 2024, category: 'palme_dor', generated_at: 'X' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockIsJobStillRunning.mockResolvedValue(true);
  mockFinishJobIfRunning.mockResolvedValue(true);
});

describe('executeManualAwardSync', () => {
  it('UPSERT してから旧世代だけを削除し、succeeded にする', async () => {
    mockFetchAndResolveAward.mockResolvedValue({ type: 'rows', rows: ROWS });
    const db = createSupabase();

    await executeManualAwardSync(db.supabase, {
      jobId: JOB_ID,
      awardName: 'cannes',
      year: 2024,
    });

    // UPSERT が DELETE より先
    const order = db.from.mock.results.map((_, i) => i);
    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect(db.del).toHaveBeenCalledTimes(1);
    expect(db.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      db.del.mock.invocationCallOrder[0],
    );
    expect(order.length).toBeGreaterThan(0);

    // 削除条件は賞・年が一致し、generated_at が今回より古いものだけ
    expect(db.eqName).toHaveBeenCalledWith('award_name', 'cannes');
    expect(db.eqYear).toHaveBeenCalledWith('award_year', 2024);
    expect(db.lt).toHaveBeenCalledWith('generated_at', expect.any(String));

    expect(mockFinishJobIfRunning).toHaveBeenCalledWith(db.supabase, JOB_ID, {
      status: 'succeeded',
      totalUpserted: 1,
    });
  });

  it('取得0件なら award_movies に一切触らず failed にする', async () => {
    mockFetchAndResolveAward.mockResolvedValue({ type: 'no_items' });
    const db = createSupabase();

    await executeManualAwardSync(db.supabase, {
      jobId: JOB_ID,
      awardName: 'cannes',
      year: 2024,
    });

    expect(db.from).not.toHaveBeenCalledWith('award_movies');
    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.del).not.toHaveBeenCalled();
    expect(mockFinishJobIfRunning).toHaveBeenCalledWith(db.supabase, JOB_ID, {
      status: 'failed',
      errorMessage: AWARD_SYNC_MESSAGES.NO_ITEMS,
    });
  });

  it('TMDb解決0件でも award_movies に触らない', async () => {
    mockFetchAndResolveAward.mockResolvedValue({ type: 'no_tmdb_match' });
    const db = createSupabase();

    await executeManualAwardSync(db.supabase, {
      jobId: JOB_ID,
      awardName: 'cannes',
      year: 2024,
    });

    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.del).not.toHaveBeenCalled();
    expect(mockFinishJobIfRunning).toHaveBeenCalledWith(db.supabase, JOB_ID, {
      status: 'failed',
      errorMessage: AWARD_SYNC_MESSAGES.NO_TMDB_MATCH,
    });
  });

  it('UPSERT が失敗したら DELETE へ進まない（既存データを守る）', async () => {
    mockFetchAndResolveAward.mockResolvedValue({ type: 'rows', rows: ROWS });
    const db = createSupabase({ upsertError: { message: 'boom' } });

    await executeManualAwardSync(db.supabase, {
      jobId: JOB_ID,
      awardName: 'cannes',
      year: 2024,
    });

    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect(db.del).not.toHaveBeenCalled();
    expect(mockFinishJobIfRunning).toHaveBeenCalledWith(db.supabase, JOB_ID, {
      status: 'failed',
      errorMessage: expect.stringContaining(AWARD_SYNC_MESSAGES.WRITE_FAILED),
    });
  });

  it('強制失効されていたら書き込まずに終了する', async () => {
    mockFetchAndResolveAward.mockResolvedValue({ type: 'rows', rows: ROWS });
    mockIsJobStillRunning.mockResolvedValue(false);
    const db = createSupabase();

    await executeManualAwardSync(db.supabase, {
      jobId: JOB_ID,
      awardName: 'cannes',
      year: 2024,
    });

    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.del).not.toHaveBeenCalled();
    expect(mockFinishJobIfRunning).not.toHaveBeenCalled();
  });

  it('例外を外へ投げず failed に倒す', async () => {
    mockFetchAndResolveAward.mockRejectedValue(new Error('network down'));
    const db = createSupabase();

    await expect(
      executeManualAwardSync(db.supabase, {
        jobId: JOB_ID,
        awardName: 'cannes',
        year: 2024,
      }),
    ).resolves.toBeUndefined();

    expect(mockFinishJobIfRunning).toHaveBeenCalledWith(db.supabase, JOB_ID, {
      status: 'failed',
      errorMessage: expect.stringContaining('network down'),
    });
  });

  it('DELETE が失敗しても succeeded にする（データは新しい）', async () => {
    mockFetchAndResolveAward.mockResolvedValue({ type: 'rows', rows: ROWS });
    const db = createSupabase({ deleteError: { message: 'delete boom' } });

    await executeManualAwardSync(db.supabase, {
      jobId: JOB_ID,
      awardName: 'cannes',
      year: 2024,
    });

    expect(mockFinishJobIfRunning).toHaveBeenCalledWith(db.supabase, JOB_ID, {
      status: 'succeeded',
      totalUpserted: 1,
    });
  });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx jest src/lib/awards/manualAwardSync.test.ts --silent
```

Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

`src/lib/awards/manualAwardSync.ts`:

```ts
/**
 * 管理画面からの受賞作品手動同期
 *
 * cron（UPSERT のみ）と違い、残留レコードを消す「世代付き入れ替え」を行う。
 * 手動同期は「データがおかしいからやり直す」場面が主で、前回あって今回無い
 * レコードが残り続けると直したことにならないため。
 *
 * ⚠️ DELETE → INSERT の順にしてはいけない。supabase-js の DELETE と INSERT は
 * 別々の文でそれぞれ自動コミットされるため、DELETE 後に INSERT が失敗すると
 * その賞・年のデータが消えたまま復旧しない。UPSERT を先に行い、今回更新され
 * なかった行（generated_at が今回より古い行）だけを後から消す。
 *
 * 設計: `.claude/documents/admin-award-sync-design.md` 4-3
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { AWARD_DEFINITIONS } from '@/constants/awards';
import {
  AWARD_SYNC_MESSAGES,
  AWARD_SYNC_STATUS,
  type SyncableAwardName,
} from '@/constants/awardSync';

import { fetchAndResolveAward } from './syncAwardMoviesService';
import { finishJobIfRunning, isJobStillRunning } from './awardSyncJob';

interface ManualAwardSyncParams {
  jobId: string;
  awardName: SyncableAwardName;
  year: number;
}

/**
 * 1賞・1年ぶんを同期してジョブを終端状態にする
 *
 * **例外を外へ投げない。** `after()` のコールバックとして呼ばれるが、Next は
 * そこで投げた例外を握り潰してログに出すだけなので、投げるとジョブが running の
 * まま孤児になる。すべての経路で必ず終端状態を書く。
 */
export async function executeManualAwardSync(
  supabase: SupabaseClient,
  params: ManualAwardSyncParams,
): Promise<void> {
  const { jobId, awardName, year } = params;
  const generatedAt = new Date().toISOString();

  try {
    const resolved = await fetchAndResolveAward({
      awardName,
      awardDef: AWARD_DEFINITIONS[awardName],
      year,
      generatedAt,
    });

    // 取得できなかったときは既存データに一切触れない。
    // ここで素通しすると「0件でUPSERT → 全部DELETE」になり全損する
    if (resolved.type === 'no_items') {
      await finishJobIfRunning(supabase, jobId, {
        status: AWARD_SYNC_STATUS.FAILED,
        errorMessage: AWARD_SYNC_MESSAGES.NO_ITEMS,
      });
      return;
    }

    if (resolved.type === 'no_tmdb_match') {
      await finishJobIfRunning(supabase, jobId, {
        status: AWARD_SYNC_STATUS.FAILED,
        errorMessage: AWARD_SYNC_MESSAGES.NO_TMDB_MATCH,
      });
      return;
    }

    // 書き込みに入る直前に失効を確認する。強制失効されていた場合、
    // 既に別のジョブが同じ賞・年を触っている可能性がある
    if (!(await isJobStillRunning(supabase, jobId))) {
      console.warn(
        `[manualAwardSync] ジョブが失効していたため書き込みを中止しました id=${jobId}`,
      );
      return;
    }

    const { error: upsertError } = await supabase
      .from('award_movies')
      .upsert(resolved.rows, {
        onConflict: 'tmdb_movie_id,award_name,award_year,category',
      });

    // UPSERT が失敗したらここで終わる。DELETE へ進むと既存データを失う
    if (upsertError) {
      await finishJobIfRunning(supabase, jobId, {
        status: AWARD_SYNC_STATUS.FAILED,
        errorMessage: `${AWARD_SYNC_MESSAGES.WRITE_FAILED}: ${upsertError.message}`,
      });
      return;
    }

    // 今回更新されなかった行＝前回あって今回無い残留だけを消す
    const { error: deleteError } = await supabase
      .from('award_movies')
      .delete()
      .eq('award_name', awardName)
      .eq('award_year', year)
      .lt('generated_at', generatedAt);

    if (deleteError) {
      // UPSERT は成功しているのでデータは新しい。残留が消えなかっただけなので
      // 成功扱いにする（次回の同期で消える）
      console.error(
        `[manualAwardSync] 旧世代の削除に失敗しました award=${awardName} year=${year}`,
        deleteError,
      );
    }

    await finishJobIfRunning(supabase, jobId, {
      status: AWARD_SYNC_STATUS.SUCCEEDED,
      totalUpserted: resolved.rows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[manualAwardSync] 同期に失敗しました id=${jobId}`, error);

    await finishJobIfRunning(supabase, jobId, {
      status: AWARD_SYNC_STATUS.FAILED,
      errorMessage: message,
    });
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx jest src/lib/awards/manualAwardSync.test.ts --silent
```

Expected: PASS（7ケース）

- [ ] **Step 5: 型チェックと lint**

```bash
npx tsc --noEmit && npx eslint src/lib/awards/manualAwardSync.ts
```

- [ ] **Step 6: コミット**

```bash
git -C . add src/lib/awards/manualAwardSync.ts src/lib/awards/manualAwardSync.test.ts
git -C . commit -m "feat(awards): 手動同期の世代付き入れ替えを実装

DELETE→INSERT ではなく UPSERT→旧世代DELETE の順にする。supabase-js の
DELETE と INSERT は別々に自動コミットされるため、前者の順だと DELETE 後に
INSERT が失敗した時点でその賞・年のデータが復旧不能になる。

generated_at を世代印として使い、今回更新されなかった行だけを消す。
これでデータが空になる窓が開かず、UPSERT 失敗時は DELETE に到達しないので
既存データが残る。

取得0件・TMDb解決0件では award_movies に一切触れない。素通しすると
0件でUPSERTして全部DELETEすることになり全損する。

after() のコールバックとして呼ばれるため例外を外へ投げない。Next は
after() の例外を握り潰すので、投げるとジョブが running のまま孤児になる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 起票と最新ジョブ取得の API

**設計からの逸脱を1点:** 設計書 4-6 は強制失効を `admin_audit_logs` に記録するとしていたが、同テーブルは `target_user_id UUID NOT NULL REFERENCES users(id)` と `chk_admin_audit_action CHECK (action IN ('account_create','account_reissue'))` を持ち、対象ユーザーが存在しない本操作を入れるにはスキーマ変更が要る。PR 3 の範囲を広げないため、**失効させたジョブ行の `error_message` と、新ジョブの `requested_by` を記録とする**。監査テーブルへの統合が必要になった時点で別 Issue にする。

**Files:**
- Modify: `src/constants/api.ts`（`HTTP_STATUS.ACCEPTED` を追加）
- Create: `src/app/api/admin/awards/sync/route.ts`
- Create: `src/app/api/admin/awards/sync/route.test.ts`

**Interfaces:**
- Consumes: Task 6/7/8 のすべて、`withAdminAuth`、`checkRateLimit`、`parseAndValidate`、`rateLimitExceededResponse`
- Produces: `POST /api/admin/awards/sync` → 202 `{ success: true, data: { job } }`、`GET /api/admin/awards/sync` → 200 `{ success: true, data: { job: AwardSyncJob | null, isStale: boolean } }`

- [ ] **Step 1: `HTTP_STATUS` に 202 を足す**

`src/constants/api.ts` の `CREATED` の次に入れる。

```ts
  /** 成功（リソース作成） */
  CREATED: 201,
  /** 受理（処理は非同期に継続する） */
  ACCEPTED: 202,
```

- [ ] **Step 2: 失敗するテストを書く**

`src/app/api/admin/awards/sync/route.test.ts`:

```ts
/**
 * @jest-environment node
 */

import { POST, GET } from './route';
import { AWARD_SYNC_MESSAGES } from '@/constants/awardSync';

// withAdminAuth は認可を通した体でハンドラをそのまま呼ぶ
const SESSION = { user: { id: 'admin-1' } };
let mockSupabase: unknown;
jest.mock('@/helpers/adminAuth', () => ({
  withAdminAuth:
    (handler: (ctx: unknown) => Promise<Response>) =>
    (request: Request) =>
      handler({ session: SESSION, supabase: mockSupabase, request }),
}));

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockAfter = jest.fn();
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return { ...actual, after: (cb: () => void) => mockAfter(cb) };
});

const mockFindRunningJob = jest.fn();
const mockCreateRunningJob = jest.fn();
const mockFinishJobIfRunning = jest.fn();
const mockFindLatestJob = jest.fn();
const mockIsJobStale = jest.fn();
jest.mock('@/lib/awards/awardSyncJob', () => ({
  findRunningJob: (...a: unknown[]) => mockFindRunningJob(...a),
  createRunningJob: (...a: unknown[]) => mockCreateRunningJob(...a),
  finishJobIfRunning: (...a: unknown[]) => mockFinishJobIfRunning(...a),
  findLatestJob: (...a: unknown[]) => mockFindLatestJob(...a),
  isJobStale: (...a: unknown[]) => mockIsJobStale(...a),
}));

jest.mock('@/lib/awards/manualAwardSync', () => ({
  executeManualAwardSync: jest.fn(),
}));

const RUNNING_JOB = {
  id: 'job-1',
  awardName: 'cannes',
  awardYear: 2024,
  status: 'running' as const,
  totalUpserted: null,
  errorMessage: null,
  createdAt: '2026-10-31T00:00:00.000Z',
  startedAt: '2026-10-31T00:00:00.000Z',
  finishedAt: null,
};

const createRequest = (body: unknown) =>
  new Request('http://localhost/api/admin/awards/sync', {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockSupabase = { from: jest.fn() };
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockFindRunningJob.mockResolvedValue(null);
  mockIsJobStale.mockReturnValue(false);
  mockCreateRunningJob.mockResolvedValue({ job: { ...RUNNING_JOB, id: 'new-job' } });
});

describe('POST /api/admin/awards/sync', () => {
  it('202 を返し after() で同期を予約する', async () => {
    const response = await POST(createRequest({ awardName: 'cannes', year: 2024 }));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.success).toBe(true);
    expect(body.data.job.id).toBe('new-job');
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('レート制限超過で429を返し、ジョブを作らない', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

    const response = await POST(createRequest({ awardName: 'cannes', year: 2024 }));

    expect(response.status).toBe(429);
    expect(mockCreateRunningJob).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it('同期対象外の賞を400で拒否する', async () => {
    const response = await POST(
      createRequest({ awardName: 'japan_academy_awards', year: 2024 }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateRunningJob).not.toHaveBeenCalled();
  });

  it('下限より前の年を400で拒否する', async () => {
    const response = await POST(createRequest({ awardName: 'cannes', year: 1945 }));

    expect(response.status).toBe(400);
  });

  it('実行中ジョブがあれば409を返し、ジョブ情報を含める', async () => {
    mockFindRunningJob.mockResolvedValue(RUNNING_JOB);

    const response = await POST(createRequest({ awardName: 'cannes', year: 2024 }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.message).toBe(AWARD_SYNC_MESSAGES.ALREADY_RUNNING);
    expect(body.data.job.id).toBe('job-1');
    expect(body.data.isStale).toBe(false);
    expect(mockCreateRunningJob).not.toHaveBeenCalled();
  });

  it('賞・年が違っても実行中なら409を返す（全体で1件）', async () => {
    mockFindRunningJob.mockResolvedValue(RUNNING_JOB);

    const response = await POST(
      createRequest({ awardName: 'academy_awards', year: 2020 }),
    );

    expect(response.status).toBe(409);
  });

  it('force でも閾値未満なら409のまま失効させない', async () => {
    mockFindRunningJob.mockResolvedValue(RUNNING_JOB);
    mockIsJobStale.mockReturnValue(false);

    const response = await POST(
      createRequest({ awardName: 'cannes', year: 2024, force: true }),
    );

    expect(response.status).toBe(409);
    expect(mockFinishJobIfRunning).not.toHaveBeenCalled();
  });

  it('force かつ閾値超過なら旧ジョブを failed にして起票する', async () => {
    mockFindRunningJob.mockResolvedValue(RUNNING_JOB);
    mockIsJobStale.mockReturnValue(true);
    mockFinishJobIfRunning.mockResolvedValue(true);

    const response = await POST(
      createRequest({ awardName: 'cannes', year: 2024, force: true }),
    );

    expect(response.status).toBe(202);
    expect(mockFinishJobIfRunning).toHaveBeenCalledWith(mockSupabase, 'job-1', {
      status: 'failed',
      errorMessage: AWARD_SYNC_MESSAGES.SUPERSEDED,
    });
    expect(mockCreateRunningJob).toHaveBeenCalled();
  });

  it('INSERT が 23505 なら500ではなく409を返す', async () => {
    mockCreateRunningJob.mockResolvedValue({ conflict: true });
    mockFindRunningJob
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(RUNNING_JOB);

    const response = await POST(createRequest({ awardName: 'cannes', year: 2024 }));

    expect(response.status).toBe(409);
    expect(mockAfter).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/awards/sync', () => {
  it('最新ジョブを返す', async () => {
    mockFindLatestJob.mockResolvedValue(RUNNING_JOB);
    mockIsJobStale.mockReturnValue(true);

    const response = await GET(
      new Request('http://localhost/api/admin/awards/sync'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.job.id).toBe('job-1');
    expect(body.data.isStale).toBe(true);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('ジョブが1件も無ければ null を返す', async () => {
    mockFindLatestJob.mockResolvedValue(null);

    const response = await GET(
      new Request('http://localhost/api/admin/awards/sync'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.job).toBeNull();
  });
});
```

- [ ] **Step 3: 失敗することを確認する**

```bash
npx jest src/app/api/admin/awards/sync/route.test.ts --silent
```

Expected: FAIL（モジュールが存在しない）

- [ ] **Step 4: 実装する**

`src/app/api/admin/awards/sync/route.ts`:

```ts
/**
 * 受賞作品の手動同期 API
 * POST /api/admin/awards/sync - 同期ジョブを起票して非同期に実行する
 * GET  /api/admin/awards/sync - 最新のジョブを取得する（リロード後の復元用）
 *
 * admin ロール必須（`withAdminAuth` がDBで毎回確認する）。
 * 設計: `.claude/documents/admin-award-sync-design.md`
 */

import { NextResponse, after } from 'next/server';

import { withAdminAuth } from '@/helpers/adminAuth';
import { parseAndValidate } from '@/helpers/requestValidation';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import {
  createRunningJob,
  findLatestJob,
  findRunningJob,
  finishJobIfRunning,
  isJobStale,
  type AwardSyncJob,
} from '@/lib/awards/awardSyncJob';
import { executeManualAwardSync } from '@/lib/awards/manualAwardSync';
import { awardSyncCreateSchema } from '@/schema/awardSync';
import {
  AWARD_SYNC_MESSAGES,
  AWARD_SYNC_STATUS,
} from '@/constants/awardSync';
import {
  HTTP_STATUS,
  ERROR_CODE,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
  CACHE_CONTROL,
} from '@/constants';

/** 管理情報をCDNや共有キャッシュに残さない */
const NO_STORE = { 'Cache-Control': CACHE_CONTROL.PRIVATE_NO_STORE };

/**
 * 実行中ジョブがあることを伝える 409
 *
 * ジョブ情報を同梱する。これが無いと、画面はリロード後に「何が走っているか」も
 * 「強制失効の操作を出してよいか」も判定できない。
 */
function alreadyRunningResponse(job: AwardSyncJob | null) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: ERROR_CODE.CONFLICT,
        message: AWARD_SYNC_MESSAGES.ALREADY_RUNNING,
      },
      data: { job, isStale: job ? isJobStale(job) : false },
    },
    { status: HTTP_STATUS.CONFLICT, headers: NO_STORE },
  );
}

export const POST = withAdminAuth(
  async ({ session, supabase, request }) => {
    // カンヌ・ゴールデングローブは OpenAI を部門数ぶん呼ぶため課金が発生する。
    // admin セッションを奪われた場合の被害を上限で抑える（#641 と同じ理屈）
    const limitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.ADMIN_AWARD_SYNC,
      RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC.maxAttempts,
      RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC.windowMinutes,
    );

    if (!limitResult.allowed) {
      return rateLimitExceededResponse(limitResult);
    }

    const { data: body, error: validationError } = await parseAndValidate(
      request,
      awardSyncCreateSchema,
      AWARD_SYNC_MESSAGES.INVALID_BODY,
    );

    if (validationError) return validationError;

    const running = await findRunningJob(supabase);

    if (running) {
      // 閾値未満のジョブは force でも触らせない。正常に走っている処理を
      // 誤って切らせないため
      if (!body.force || !isJobStale(running)) {
        return alreadyRunningResponse(running);
      }

      // ⚠️ これは走行中の after() を止めない。旧プロセスは
      //    isJobStillRunning の確認で自分が失効したことを検知して中止する
      const expired = await finishJobIfRunning(supabase, running.id, {
        status: AWARD_SYNC_STATUS.FAILED,
        errorMessage: AWARD_SYNC_MESSAGES.SUPERSEDED,
      });

      // 別のリクエストが先に閉じていた場合は競合として扱う
      if (!expired) {
        return alreadyRunningResponse(await findRunningJob(supabase));
      }
    }

    const created = await createRunningJob(supabase, {
      awardName: body.awardName,
      year: body.year,
      requestedBy: session.user.id,
    });

    // 事前チェックと INSERT の間に別リクエストが入った場合。
    // 23505 をそのまま投げると 500 になるため 409 に落とす
    if ('conflict' in created) {
      return alreadyRunningResponse(await findRunningJob(supabase));
    }

    const { job } = created;

    // レスポンスを返した後に継続実行する。
    // executeManualAwardSync は例外を外へ投げない（Next は after() の例外を
    // 握り潰すため、投げるとジョブが running のまま孤児になる）
    after(async () => {
      await executeManualAwardSync(supabase, {
        jobId: job.id,
        awardName: body.awardName,
        year: body.year,
      });
    });

    return NextResponse.json(
      { success: true, data: { job } },
      { status: HTTP_STATUS.ACCEPTED, headers: NO_STORE },
    );
  },
  {
    errorLog: 'Award sync start error',
    errorMessage: AWARD_SYNC_MESSAGES.START_ERROR,
  },
);

export const GET = withAdminAuth(
  async ({ session, supabase }) => {
    const limitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.ADMIN_AWARD_SYNC_STATUS,
      RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC_STATUS.maxAttempts,
      RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC_STATUS.windowMinutes,
    );

    if (!limitResult.allowed) {
      return rateLimitExceededResponse(limitResult);
    }

    const job = await findLatestJob(supabase);

    return NextResponse.json(
      { success: true, data: { job, isStale: job ? isJobStale(job) : false } },
      { status: HTTP_STATUS.OK, headers: NO_STORE },
    );
  },
  {
    errorLog: 'Award sync latest fetch error',
    errorMessage: AWARD_SYNC_MESSAGES.FETCH_ERROR,
  },
);
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx jest src/app/api/admin/awards/sync/route.test.ts --silent
```

Expected: PASS（11ケース）

- [ ] **Step 6: コミット**

```bash
git -C . add src/constants/api.ts src/app/api/admin/awards/sync/route.ts src/app/api/admin/awards/sync/route.test.ts
git -C . commit -m "feat(awards): 手動同期の起票APIを追加

POST は202を即返して after() で継続実行する。カンヌ・GGは分単位かかるため
HTTPレスポンス待ちに乗せない。

409 にはジョブ情報を同梱する。これが無いと画面はリロード後に何が走って
いるかも強制失効を出してよいかも判定できない。

force は閾値を超えたジョブにしか効かせない。正常に走っている処理を誤って
切らせないため。失効させても走行中の after() は止まらないので、旧プロセス
側は isJobStillRunning で自分の失効を検知して中止する。

INSERT の 23505 は 500 ではなく 409 に落とす。事前チェックと INSERT の
間に別リクエストが入る競合を吸収するため。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 指定ジョブの進捗取得 API

**Files:**
- Create: `src/app/api/admin/awards/sync/[id]/route.ts`
- Create: `src/app/api/admin/awards/sync/[id]/route.test.ts`

**Interfaces:**
- Consumes: `findJobById` / `isJobStale`（Task 7）、`isValidUuid` / `invalidUuidResponse`（`@/helpers/requestValidation`）、`notFoundResponse`（`@/helpers/apiHelpers`）
- Produces: `GET /api/admin/awards/sync/[id]` → 200 `{ success: true, data: { job, isStale } }`

- [ ] **Step 1: 失敗するテストを書く**

`src/app/api/admin/awards/sync/[id]/route.test.ts`:

```ts
/**
 * @jest-environment node
 */

import { GET } from './route';

const SESSION = { user: { id: 'admin-1' } };
let mockSupabase: unknown;
jest.mock('@/helpers/adminAuth', () => ({
  withAdminAuth:
    (handler: (ctx: unknown) => Promise<Response>) =>
    (request: Request, context?: { params?: Promise<Record<string, string>> }) =>
      handler({ session: SESSION, supabase: mockSupabase, request, params: context?.params }),
}));

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
}));

const mockFindJobById = jest.fn();
const mockIsJobStale = jest.fn();
jest.mock('@/lib/awards/awardSyncJob', () => ({
  findJobById: (...a: unknown[]) => mockFindJobById(...a),
  isJobStale: (...a: unknown[]) => mockIsJobStale(...a),
}));

const VALID_ID = '11111111-1111-4111-8111-111111111111';

const call = (id: string) =>
  GET(new Request(`http://localhost/api/admin/awards/sync/${id}`), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockSupabase = { from: jest.fn() };
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockIsJobStale.mockReturnValue(false);
});

describe('GET /api/admin/awards/sync/[id]', () => {
  it('ジョブを返す', async () => {
    mockFindJobById.mockResolvedValue({ id: VALID_ID, status: 'succeeded' });

    const response = await call(VALID_ID);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.job.id).toBe(VALID_ID);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('UUIDでないidを400で拒否する', async () => {
    const response = await call('not-a-uuid');

    expect(response.status).toBe(400);
    expect(mockFindJobById).not.toHaveBeenCalled();
  });

  it('存在しないidで404を返す', async () => {
    mockFindJobById.mockResolvedValue(null);

    const response = await call(VALID_ID);

    expect(response.status).toBe(404);
  });

  it('ポーリングのレート制限超過で429を返す', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 30 });

    const response = await call(VALID_ID);

    expect(response.status).toBe(429);
    expect(mockFindJobById).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx jest 'src/app/api/admin/awards/sync/\[id\]/route.test.ts' --silent
```

Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

`src/app/api/admin/awards/sync/[id]/route.ts`:

```ts
/**
 * 受賞作品の手動同期ジョブの進捗取得 API
 * GET /api/admin/awards/sync/[id]
 *
 * 画面が AWARD_SYNC_POLL_INTERVAL_MS 間隔でポーリングする。
 * admin ロール必須。
 */

import { NextResponse } from 'next/server';

import { withAdminAuth } from '@/helpers/adminAuth';
import {
  isValidUuid,
  invalidUuidResponse,
} from '@/helpers/requestValidation';
import {
  notFoundResponse,
  rateLimitExceededResponse,
} from '@/helpers/apiHelpers';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { findJobById, isJobStale } from '@/lib/awards/awardSyncJob';
import { AWARD_SYNC_MESSAGES } from '@/constants/awardSync';
import {
  HTTP_STATUS,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
  CACHE_CONTROL,
} from '@/constants';

export const GET = withAdminAuth(
  async ({ session, supabase, params }) => {
    // ポーリングで最も多く叩かれる。READ_USER_DATA に相乗りさせると
    // 1ジョブで300回使って他の読み取りを巻き込んで枯らすため専用カウンタ
    const limitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.ADMIN_AWARD_SYNC_STATUS,
      RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC_STATUS.maxAttempts,
      RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC_STATUS.windowMinutes,
    );

    if (!limitResult.allowed) {
      return rateLimitExceededResponse(limitResult);
    }

    const { id } = await params!;

    if (!isValidUuid(id)) {
      return invalidUuidResponse(AWARD_SYNC_MESSAGES.NOT_FOUND);
    }

    const job = await findJobById(supabase, id);

    if (!job) {
      return notFoundResponse(AWARD_SYNC_MESSAGES.NOT_FOUND);
    }

    return NextResponse.json(
      { success: true, data: { job, isStale: isJobStale(job) } },
      {
        status: HTTP_STATUS.OK,
        headers: { 'Cache-Control': CACHE_CONTROL.PRIVATE_NO_STORE },
      },
    );
  },
  {
    errorLog: 'Award sync job fetch error',
    errorMessage: AWARD_SYNC_MESSAGES.FETCH_ERROR,
  },
);
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx jest 'src/app/api/admin/awards/sync' --silent
```

Expected: PASS（Task 9 の11ケースと合わせて15ケース）

- [ ] **Step 5: コミット**

```bash
git -C . add 'src/app/api/admin/awards/sync/[id]'
git -C . commit -m "feat(awards): 同期ジョブの進捗取得APIを追加

ポーリング専用のレート制限カウンタを使う。1ジョブで300回程度叩くため
READ_USER_DATA に相乗りさせると他の認証必須読み取りを巻き込んで枯らす。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: ルートとエンドポイントの配線

**Files:**
- Modify: `src/constants/common.ts`
- Modify: `src/constants/apiEndpoints.ts`
- Test: `src/proxy.test.ts`（既存があれば追記。無ければ作らない）

**Interfaces:**
- Produces: `ROUTES.ADMIN_AWARDS`（`/admin/awards`）、`API_ENDPOINTS.ADMIN_AWARD_SYNC`、`API_ENDPOINTS.ADMIN_AWARD_SYNC_JOB(id)`

- [ ] **Step 1: `ROUTES` に足す**

`src/constants/common.ts` の `ADMIN_ACCOUNTS` の次。

```ts
  /** 管理者向けのアカウント管理（admin ロールのみ） */
  ADMIN_ACCOUNTS: '/admin/accounts',
  /** 管理者向けの受賞作品手動同期（admin ロールのみ） */
  ADMIN_AWARDS: '/admin/awards',
```

- [ ] **Step 2: `ADMIN_REQUIRED_ROUTES` に足す**

```ts
export const ADMIN_REQUIRED_ROUTES = [
  ROUTES.ADMIN_ACCOUNTS,
  ROUTES.ADMIN_AWARDS,
] as const;
```

- [ ] **Step 3: `API_ENDPOINTS` に足す**

`src/constants/apiEndpoints.ts` の `ADMIN_ACCOUNT_REISSUE` の次。

```ts
  /** 受賞作品の手動同期の起票・最新ジョブ取得（admin 専用） */
  ADMIN_AWARD_SYNC: '/api/admin/awards/sync',
  /** 同期ジョブの進捗取得（admin 専用） */
  ADMIN_AWARD_SYNC_JOB: (id: string) => `/api/admin/awards/sync/${id}`,
```

- [ ] **Step 4: proxy が新しいパスを admin 判定に含めることを確認する**

`src/proxy.ts` は `ADMIN_REQUIRED_ROUTES` を参照しているだけなのでコード変更は不要。配列に足したことで `/admin/awards` が自動的に保護される。

```bash
npx tsc --noEmit && npx jest src/proxy --silent
```

Expected: 型チェックが通る。proxy のテストがあれば PASS

- [ ] **Step 5: コミット**

```bash
git -C . add src/constants/common.ts src/constants/apiEndpoints.ts
git -C . commit -m "feat(awards): 手動同期のルートとエンドポイントを定義

ADMIN_REQUIRED_ROUTES に足すだけで proxy の admin 判定に乗る。
ただしこれは入口の体裁で、/api/* は proxy を素通りするため実質的な
防御は各ルートの withAdminAuth が担う。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# PR 4: 画面

**完了条件:** 画面・フックの単体テストと E2E が通る。ビジュアル証跡（After のスクリーンショットと動作動画）を PR 本文に添付する。

### Task 12: API クライアント

409 のボディに実行中ジョブが入るため、axios が投げるエラーから取り出せるようにする。これが無いとフックは強制失効の操作を出す判断ができない。

**Files:**
- Create: `src/lib/api/awardSync/awardSync.ts`
- Create: `src/lib/api/awardSync/awardSync.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AwardSyncJobView {
    id: string; awardName: string; awardYear: number;
    status: 'running' | 'succeeded' | 'failed';
    totalUpserted: number | null; errorMessage: string | null;
    createdAt: string; startedAt: string; finishedAt: string | null;
  }
  export interface AwardSyncSnapshot { job: AwardSyncJobView | null; isStale: boolean }
  export async function startAwardSync(input: { awardName: string; year: number; force?: boolean }): Promise<AwardSyncJobView>;
  export async function fetchAwardSyncJob(id: string): Promise<AwardSyncSnapshot>;
  export async function fetchLatestAwardSync(): Promise<AwardSyncSnapshot>;
  export function extractConflict(cause: unknown): AwardSyncSnapshot | null;
  export function extractMessage(cause: unknown, fallback: string): string;
  ```

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/api/awardSync/awardSync.test.ts`:

```ts
import { AxiosError, AxiosHeaders } from 'axios';

import { extractConflict, extractMessage } from './awardSync';

function conflictError(data: unknown) {
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status: 409,
      statusText: 'Conflict',
      data,
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
    },
  );
}

const JOB = {
  id: 'job-1',
  awardName: 'cannes',
  awardYear: 2024,
  status: 'running' as const,
  totalUpserted: null,
  errorMessage: null,
  createdAt: '2026-10-31T00:00:00.000Z',
  startedAt: '2026-10-31T00:00:00.000Z',
  finishedAt: null,
};

describe('extractConflict', () => {
  it('409のボディから実行中ジョブと stale 判定を取り出す', () => {
    const result = extractConflict(
      conflictError({ success: false, data: { job: JOB, isStale: true } }),
    );

    expect(result).toEqual({ job: JOB, isStale: true });
  });

  it('409以外は null を返す', () => {
    const error = new AxiosError('x', 'y', undefined, undefined, {
      status: 500,
      statusText: 'Server Error',
      data: {},
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
    });

    expect(extractConflict(error)).toBeNull();
  });

  it('axios 以外のエラーは null を返す', () => {
    expect(extractConflict(new Error('boom'))).toBeNull();
  });
});

describe('extractMessage', () => {
  it('サーバーのメッセージを優先する', () => {
    const error = conflictError({
      success: false,
      error: { code: 'CONFLICT', message: '実行中の同期があります' },
    });

    expect(extractMessage(error, 'fallback')).toBe('実行中の同期があります');
  });

  it('取れなければフォールバックを返す', () => {
    expect(extractMessage(new Error('boom'), 'fallback')).toBe('fallback');
  });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx jest src/lib/api/awardSync --silent
```

Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

`src/lib/api/awardSync/awardSync.ts`:

```ts
/**
 * 受賞作品の手動同期 API クライアント
 */

import { isAxiosError } from 'axios';

import { API_ENDPOINTS, HTTP_STATUS } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';

/** 画面で扱うジョブ */
export interface AwardSyncJobView {
  id: string;
  awardName: string;
  awardYear: number;
  status: 'running' | 'succeeded' | 'failed';
  totalUpserted: number | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string;
  finishedAt: string | null;
}

/** ジョブと「停止した可能性あり」判定 */
export interface AwardSyncSnapshot {
  job: AwardSyncJobView | null;
  isStale: boolean;
}

interface SnapshotResponse {
  success: true;
  data: AwardSyncSnapshot;
}

interface StartResponse {
  success: true;
  data: { job: AwardSyncJobView };
}

/** 同期を開始する */
export async function startAwardSync(input: {
  awardName: string;
  year: number;
  force?: boolean;
}): Promise<AwardSyncJobView> {
  const { data } = await axiosInstance.post<StartResponse>(
    API_ENDPOINTS.ADMIN_AWARD_SYNC,
    input,
  );
  return data.data.job;
}

/** 指定ジョブの進捗を取得する */
export async function fetchAwardSyncJob(
  id: string,
): Promise<AwardSyncSnapshot> {
  const { data } = await axiosInstance.get<SnapshotResponse>(
    API_ENDPOINTS.ADMIN_AWARD_SYNC_JOB(id),
  );
  return data.data;
}

/** 最新のジョブを取得する（リロード後の復元用） */
export async function fetchLatestAwardSync(): Promise<AwardSyncSnapshot> {
  const { data } = await axiosInstance.get<SnapshotResponse>(
    API_ENDPOINTS.ADMIN_AWARD_SYNC,
  );
  return data.data;
}

/**
 * 409 のボディから実行中ジョブを取り出す
 *
 * 強制失効の操作を出してよいかは `isStale` でしか判断できない。
 * 409 を単なるエラー文言として扱うと、詰まったときに解く手段が画面から消える。
 */
export function extractConflict(cause: unknown): AwardSyncSnapshot | null {
  if (!isAxiosError(cause)) return null;
  if (cause.response?.status !== HTTP_STATUS.CONFLICT) return null;

  const body = cause.response.data as
    | { data?: { job?: AwardSyncJobView | null; isStale?: boolean } }
    | undefined;

  if (!body?.data) return null;

  return {
    job: body.data.job ?? null,
    isStale: body.data.isStale ?? false,
  };
}

/**
 * サーバーが返したメッセージを優先して取り出す
 *
 * `formatErrorMessage` は `Response` を参照するため jsdom 環境のテストで
 * 落ちる。既存の `useAdminAccounts` と同じ方針でここに持つ。
 */
export function extractMessage(cause: unknown, fallback: string): string {
  if (isAxiosError(cause)) {
    const data = cause.response?.data as
      | { error?: { message?: unknown } }
      | undefined;
    const message = data?.error?.message;

    if (typeof message === 'string' && message) return message;
  }

  return fallback;
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx jest src/lib/api/awardSync --silent
```

Expected: PASS（5ケース）

- [ ] **Step 5: コミット**

```bash
git -C . add src/lib/api/awardSync/
git -C . commit -m "feat(awards): 手動同期のAPIクライアントを追加

409 のボディから実行中ジョブと isStale を取り出せるようにする。
409 を単なるエラー文言として扱うと、ジョブが詰まったときに強制失効へ
進む判断が画面からできなくなる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: `useAwardSync` フック

ポーリングは「終端状態で停止」「アンマウントで必ず停止」「多重起動しない」「連続失敗で打ち切り」の4つを満たす必要がある。1つでも欠けるとタブを開きっぱなしにしたときにリクエストが垂れ流しになり、`ADMIN_AWARD_SYNC_STATUS` の上限を食い潰す。

**Files:**
- Create: `src/features/admin/awardsSyncPage/hooks/useAwardSync.ts`
- Create: `src/features/admin/awardsSyncPage/hooks/useAwardSync.test.ts`

**Interfaces:**
- Consumes: Task 12 のすべて、`AWARD_SYNC_POLL_INTERVAL_MS` / `AWARD_SYNC_MAX_POLL_FAILURES` / `AWARD_SYNC_MESSAGES` / `SYNCABLE_AWARD_OPTIONS`（Task 6）
- Produces:
  ```ts
  export interface UseAwardSyncResult {
    awardName: string;
    year: string;
    job: AwardSyncJobView | null;
    isStale: boolean;
    isLoading: boolean;
    isSubmitting: boolean;
    error: string | null;
    /** 409 で返ってきた実行中ジョブ。強制失効の出し分けに使う */
    conflict: AwardSyncSnapshot | null;
    setAwardName: (value: string) => void;
    setYear: (value: string) => void;
    start: (options?: { force?: boolean }) => Promise<void>;
    dismissError: () => void;
  }
  export function useAwardSync(): UseAwardSyncResult;
  ```

- [ ] **Step 1: 失敗するテストを書く**

`src/features/admin/awardsSyncPage/hooks/useAwardSync.test.ts`:

```ts
import { act, renderHook, waitFor } from '@testing-library/react';

import { useAwardSync } from './useAwardSync';
import { AWARD_SYNC_POLL_INTERVAL_MS } from '@/constants/awardSync';

const mockStartAwardSync = jest.fn();
const mockFetchAwardSyncJob = jest.fn();
const mockFetchLatestAwardSync = jest.fn();
jest.mock('@/lib/api/awardSync/awardSync', () => {
  const actual = jest.requireActual('@/lib/api/awardSync/awardSync');
  return {
    ...actual,
    startAwardSync: (...a: unknown[]) => mockStartAwardSync(...a),
    fetchAwardSyncJob: (...a: unknown[]) => mockFetchAwardSyncJob(...a),
    fetchLatestAwardSync: (...a: unknown[]) => mockFetchLatestAwardSync(...a),
  };
});

const runningJob = {
  id: 'job-1',
  awardName: 'cannes',
  awardYear: 2024,
  status: 'running' as const,
  totalUpserted: null,
  errorMessage: null,
  createdAt: '2026-10-31T00:00:00.000Z',
  startedAt: '2026-10-31T00:00:00.000Z',
  finishedAt: null,
};

const succeededJob = {
  ...runningJob,
  status: 'succeeded' as const,
  totalUpserted: 12,
  finishedAt: '2026-10-31T00:05:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockFetchLatestAwardSync.mockResolvedValue({ job: null, isStale: false });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useAwardSync', () => {
  it('マウント時に最新ジョブを復元する', async () => {
    mockFetchLatestAwardSync.mockResolvedValue({ job: succeededJob, isStale: false });

    const { result } = renderHook(() => useAwardSync());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.job?.id).toBe('job-1');
  });

  it('終端状態になったらポーリングを止める', async () => {
    mockStartAwardSync.mockResolvedValue(runningJob);
    mockFetchAwardSyncJob
      .mockResolvedValueOnce({ job: runningJob, isStale: false })
      .mockResolvedValueOnce({ job: succeededJob, isStale: false });

    const { result } = renderHook(() => useAwardSync());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      jest.advanceTimersByTime(AWARD_SYNC_POLL_INTERVAL_MS);
    });
    await act(async () => {
      jest.advanceTimersByTime(AWARD_SYNC_POLL_INTERVAL_MS);
    });

    await waitFor(() => expect(result.current.job?.status).toBe('succeeded'));

    const callsAfterTerminal = mockFetchAwardSyncJob.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(AWARD_SYNC_POLL_INTERVAL_MS * 3);
    });

    expect(mockFetchAwardSyncJob.mock.calls.length).toBe(callsAfterTerminal);
  });

  it('アンマイト後はポーリングしない', async () => {
    mockStartAwardSync.mockResolvedValue(runningJob);
    mockFetchAwardSyncJob.mockResolvedValue({ job: runningJob, isStale: false });

    const { result, unmount } = renderHook(() => useAwardSync());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.start();
    });

    unmount();
    const callsAtUnmount = mockFetchAwardSyncJob.mock.calls.length;

    jest.advanceTimersByTime(AWARD_SYNC_POLL_INTERVAL_MS * 5);

    expect(mockFetchAwardSyncJob.mock.calls.length).toBe(callsAtUnmount);
  });

  it('409 を受けたら conflict に実行中ジョブを入れる', async () => {
    const { AxiosError, AxiosHeaders } = await import('axios');
    mockStartAwardSync.mockRejectedValue(
      new AxiosError('conflict', 'ERR', undefined, undefined, {
        status: 409,
        statusText: 'Conflict',
        data: { success: false, data: { job: runningJob, isStale: true } },
        headers: new AxiosHeaders(),
        config: { headers: new AxiosHeaders() },
      }),
    );

    const { result } = renderHook(() => useAwardSync());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.conflict?.job?.id).toBe('job-1');
    expect(result.current.conflict?.isStale).toBe(true);
  });

  it('ポーリングが連続失敗したら打ち切る', async () => {
    mockStartAwardSync.mockResolvedValue(runningJob);
    mockFetchAwardSyncJob.mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useAwardSync());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.start();
    });

    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(AWARD_SYNC_POLL_INTERVAL_MS);
      });
    }

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(mockFetchAwardSyncJob.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx jest src/features/admin/awardsSyncPage --silent
```

Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

`src/features/admin/awardsSyncPage/hooks/useAwardSync.ts`:

```ts
/**
 * 受賞作品の手動同期フォームとポーリングを扱うカスタムフック
 *
 * ⚠️ ポーリングは4つを必ず満たすこと。1つでも欠けるとタブを開きっぱなしに
 * したときにリクエストが垂れ流しになり、ADMIN_AWARD_SYNC_STATUS の上限
 * （600回/30分）を食い潰す。
 *   1. 終端状態（succeeded / failed）で止める
 *   2. アンマウントで必ず止める
 *   3. 多重起動しない
 *   4. 連続失敗で打ち切る
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  extractConflict,
  extractMessage,
  fetchAwardSyncJob,
  fetchLatestAwardSync,
  startAwardSync,
  type AwardSyncJobView,
  type AwardSyncSnapshot,
} from '@/lib/api/awardSync/awardSync';
import {
  AWARD_SYNC_MAX_POLL_FAILURES,
  AWARD_SYNC_MESSAGES,
  AWARD_SYNC_POLL_INTERVAL_MS,
  SYNCABLE_AWARD_OPTIONS,
} from '@/constants/awardSync';

export interface UseAwardSyncResult {
  awardName: string;
  year: string;
  job: AwardSyncJobView | null;
  isStale: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  conflict: AwardSyncSnapshot | null;
  setAwardName: (value: string) => void;
  setYear: (value: string) => void;
  start: (options?: { force?: boolean }) => Promise<void>;
  dismissError: () => void;
}

function isTerminal(job: AwardSyncJobView | null): boolean {
  return job !== null && job.status !== 'running';
}

export function useAwardSync(): UseAwardSyncResult {
  const [awardName, setAwardName] = useState(SYNCABLE_AWARD_OPTIONS[0].value);
  const [year, setYear] = useState('');
  const [job, setJob] = useState<AwardSyncJobView | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<AwardSyncSnapshot | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failureCountRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (timerRef.current === null) return;

    clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const applySnapshot = useCallback(
    (snapshot: AwardSyncSnapshot) => {
      setJob(snapshot.job);
      setIsStale(snapshot.isStale);

      if (isTerminal(snapshot.job)) stopPolling();
    },
    [stopPolling],
  );

  const startPolling = useCallback(
    (jobId: string) => {
      // 多重起動を防ぐ。start を連打しても interval は1本に保つ
      stopPolling();
      failureCountRef.current = 0;

      timerRef.current = setInterval(() => {
        void (async () => {
          try {
            const snapshot = await fetchAwardSyncJob(jobId);
            failureCountRef.current = 0;
            applySnapshot(snapshot);
          } catch (cause) {
            failureCountRef.current += 1;

            if (failureCountRef.current >= AWARD_SYNC_MAX_POLL_FAILURES) {
              stopPolling();
              setError(extractMessage(cause, AWARD_SYNC_MESSAGES.FETCH_ERROR));
            }
          }
        })();
      }, AWARD_SYNC_POLL_INTERVAL_MS);
    },
    [applySnapshot, stopPolling],
  );

  // リロード後も進捗を追えるよう、マウント時に最新ジョブを復元する
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const snapshot = await fetchLatestAwardSync();
        if (cancelled) return;

        setJob(snapshot.job);
        setIsStale(snapshot.isStale);

        if (snapshot.job && snapshot.job.status === 'running') {
          startPolling(snapshot.job.id);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(extractMessage(cause, AWARD_SYNC_MESSAGES.FETCH_ERROR));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [startPolling]);

  // アンマウント時に必ず止める
  useEffect(() => stopPolling, [stopPolling]);

  const start = useCallback(
    async (options?: { force?: boolean }) => {
      setIsSubmitting(true);
      setError(null);
      setConflict(null);

      try {
        const created = await startAwardSync({
          awardName,
          year: Number(year),
          force: options?.force ?? false,
        });

        setJob(created);
        setIsStale(false);
        startPolling(created.id);
      } catch (cause) {
        const conflictSnapshot = extractConflict(cause);

        if (conflictSnapshot) {
          setConflict(conflictSnapshot);
        } else {
          setError(extractMessage(cause, AWARD_SYNC_MESSAGES.START_ERROR));
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [awardName, year, startPolling],
  );

  const dismissError = useCallback(() => {
    setError(null);
    setConflict(null);
  }, []);

  return {
    awardName,
    year,
    job,
    isStale,
    isLoading,
    isSubmitting,
    error,
    conflict,
    setAwardName,
    setYear,
    start,
    dismissError,
  };
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx jest src/features/admin/awardsSyncPage/hooks --silent
```

Expected: PASS（5ケース）

- [ ] **Step 5: 型チェックと lint**

```bash
npx tsc --noEmit && npx eslint src/features/admin/awardsSyncPage/
```

- [ ] **Step 6: コミット**

```bash
git -C . add src/features/admin/awardsSyncPage/hooks/
git -C . commit -m "feat(awards): 手動同期のフォームとポーリングのフックを追加

ポーリングは終端状態での停止・アンマウントでの停止・多重起動防止・
連続失敗での打ち切りの4つを満たす。欠けるとタブを開きっぱなしにした
ときにリクエストが垂れ流しになり、ポーリング用の上限を食い潰す。

マウント時に最新ジョブを復元し、running なら自動でポーリングを再開する。
リロードしても進捗を追えるようにするため。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: 画面コンポーネント

**Files:**
- Create: `src/features/admin/awardsSyncPage/awardsSyncPage.tsx`
- Create: `src/features/admin/awardsSyncPage/awardsSyncPage.module.scss`
- Create: `src/features/admin/awardsSyncPage/awardsSyncPage.test.tsx`

**Interfaces:**
- Consumes: `useAwardSync`（Task 13）、`Select` / `Input` / `Button` / `Heading` / `Skeleton`（`@/components/ui/*`）、`SYNCABLE_AWARD_OPTIONS` / `AWARD_SYNC_MESSAGES`（Task 6）
- Produces: `export const AwardsSyncPage: React.MemoExoticComponent<() => JSX.Element>`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/admin/awardsSyncPage/awardsSyncPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AwardsSyncPage } from './awardsSyncPage';
import { AWARD_SYNC_MESSAGES } from '@/constants/awardSync';

const mockStart = jest.fn();
const mockSetYear = jest.fn();
const mockSetAwardName = jest.fn();
let hookState: Record<string, unknown>;

jest.mock('./hooks/useAwardSync', () => ({
  useAwardSync: () => hookState,
}));

const baseState = {
  awardName: 'academy_awards',
  year: '',
  job: null,
  isStale: false,
  isLoading: false,
  isSubmitting: false,
  error: null,
  conflict: null,
  setAwardName: mockSetAwardName,
  setYear: mockSetYear,
  start: mockStart,
  dismissError: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  hookState = { ...baseState };
});

describe('AwardsSyncPage', () => {
  it('賞と年の入力と実行ボタンを表示する', () => {
    render(<AwardsSyncPage />);

    expect(screen.getByRole('heading', { name: AWARD_SYNC_MESSAGES.PAGE_TITLE })).toBeInTheDocument();
    expect(screen.getByLabelText('賞')).toBeInTheDocument();
    expect(screen.getByLabelText('年（授賞式の年）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '同期を開始' })).toBeInTheDocument();
  });

  it('年が未入力なら実行ボタンを押せない', () => {
    render(<AwardsSyncPage />);

    expect(screen.getByRole('button', { name: '同期を開始' })).toBeDisabled();
  });

  it('年を入力して実行すると start が呼ばれる', async () => {
    const user = userEvent.setup();
    hookState = { ...baseState, year: '2024' };
    render(<AwardsSyncPage />);

    await user.click(screen.getByRole('button', { name: '同期を開始' }));

    expect(mockStart).toHaveBeenCalled();
  });

  it('ジョブが1件も無いとき空状態を出す', () => {
    render(<AwardsSyncPage />);

    expect(screen.getByText('実行履歴はまだありません。')).toBeInTheDocument();
  });

  it('読み込み中はスケルトンを出す', () => {
    hookState = { ...baseState, isLoading: true };
    render(<AwardsSyncPage />);

    expect(screen.getByTestId('award-sync-loading')).toBeInTheDocument();
  });

  it('実行中はステータスを aria-live で通知する', () => {
    hookState = {
      ...baseState,
      job: { id: 'j1', awardName: 'cannes', awardYear: 2024, status: 'running', totalUpserted: null, errorMessage: null, createdAt: '', startedAt: '', finishedAt: null },
    };
    render(<AwardsSyncPage />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('実行中');
  });

  it('成功時は件数とキャッシュバスター付きの確認リンクを出す', () => {
    hookState = {
      ...baseState,
      job: { id: 'j1', awardName: 'cannes', awardYear: 2024, status: 'succeeded', totalUpserted: 12, errorMessage: null, createdAt: '', startedAt: '', finishedAt: '2026-10-31T00:05:00.000Z' },
    };
    render(<AwardsSyncPage />);

    expect(screen.getByRole('status')).toHaveTextContent('12件');
    expect(
      screen.getByRole('link', { name: '受賞作品ページで確認' }),
    ).toHaveAttribute('href', '/awards?t=2026-10-31T00%3A05%3A00.000Z');
  });

  it('失敗時はエラーメッセージを出す', () => {
    hookState = {
      ...baseState,
      job: { id: 'j1', awardName: 'cannes', awardYear: 2024, status: 'failed', totalUpserted: null, errorMessage: AWARD_SYNC_MESSAGES.NO_ITEMS, createdAt: '', startedAt: '', finishedAt: '' },
    };
    render(<AwardsSyncPage />);

    expect(screen.getByRole('status')).toHaveTextContent(AWARD_SYNC_MESSAGES.NO_ITEMS);
  });

  it('409かつ閾値未満なら強制失効ボタンを出さない', () => {
    hookState = {
      ...baseState,
      conflict: { job: { id: 'j1', awardName: 'cannes', awardYear: 2024, status: 'running', totalUpserted: null, errorMessage: null, createdAt: '', startedAt: '', finishedAt: null }, isStale: false },
    };
    render(<AwardsSyncPage />);

    expect(screen.getByText(AWARD_SYNC_MESSAGES.ALREADY_RUNNING)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '強制的に失敗として閉じて再実行' }),
    ).not.toBeInTheDocument();
  });

  it('409かつ閾値超過なら強制失効ボタンと注意書きを出す', async () => {
    const user = userEvent.setup();
    hookState = {
      ...baseState,
      year: '2024',
      conflict: { job: { id: 'j1', awardName: 'cannes', awardYear: 2024, status: 'running', totalUpserted: null, errorMessage: null, createdAt: '', startedAt: '', finishedAt: null }, isStale: true },
    };
    render(<AwardsSyncPage />);

    expect(screen.getByText(AWARD_SYNC_MESSAGES.STALE_HINT)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: '強制的に失敗として閉じて再実行' }),
    );

    expect(mockStart).toHaveBeenCalledWith({ force: true });
  });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx jest src/features/admin/awardsSyncPage/awardsSyncPage.test.tsx --silent
```

Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: SCSS を書く**

`src/features/admin/awardsSyncPage/awardsSyncPage.module.scss`:

```scss
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.c_awards_sync {
  max-width: 720px;
  margin: 0 auto;
  padding: $spacing-4;

  @include md {
    padding: $spacing-8;
  }
}

.c_awards_sync__form {
  display: flex;
  flex-direction: column;
  gap: $spacing-3;
  align-items: flex-start;
  margin-top: $spacing-4;
}

.c_awards_sync__hint {
  margin: 0;
  color: $text-secondary;
  font-size: $font-size-sm;
}

.c_awards_sync__section {
  margin-top: $spacing-8;
}

.c_awards_sync__status {
  display: flex;
  flex-direction: column;
  gap: $spacing-2;
  align-items: flex-start;
  margin-top: $spacing-4;
  padding: $spacing-3;
  border: $border-width-1 solid $border-color;
  border-radius: $border-radius-md;
}

.c_awards_sync__status__running {
  border-color: $warning-main;
  color: $text-warning;
}

.c_awards_sync__status__succeeded {
  border-color: $success-main;
  color: $text-success;
}

.c_awards_sync__status__failed {
  border-color: $error-main;
  color: $text-danger;
}

/* 実行中の表示。アニメーションは opacity のみに収める */
.c_awards_sync__pulse {
  animation: c_awards_sync_pulse 1.6s ease-in-out infinite;
}

@keyframes c_awards_sync_pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.55;
  }
}

.c_awards_sync__meta {
  margin: 0;
  color: $text-secondary;
  font-size: $font-size-xs;
}

.c_awards_sync__error {
  margin-top: $spacing-4;
  padding: $spacing-3;
  border: $border-width-1 solid $error-main;
  border-radius: $border-radius-md;
  color: $text-danger;
}

.c_awards_sync__conflict {
  display: flex;
  flex-direction: column;
  gap: $spacing-2;
  align-items: flex-start;
  margin-top: $spacing-4;
  padding: $spacing-3;
  border: $border-width-1 solid $warning-main;
  border-radius: $border-radius-md;
}

.c_awards_sync__empty {
  margin: $spacing-4 0 0;
  color: $text-secondary;
  font-size: $font-size-sm;
}
```

- [ ] **Step 4: コンポーネントを書く**

`src/features/admin/awardsSyncPage/awardsSyncPage.tsx`:

```tsx
/**
 * 受賞作品の手動同期ページ（admin ロールのみ）
 *
 * 同期は分単位かかることがあるため、実行後は進捗をポーリングして表示する。
 * 設計: `.claude/documents/admin-award-sync-design.md`
 */

'use client';

import { memo, useCallback } from 'react';

import { Heading } from '@/components/ui/heading/heading';
import { Button } from '@/components/ui/button/button';
import { Input } from '@/components/ui/input/input';
import { Select } from '@/components/ui/select/select';
import { Skeleton } from '@/components/ui/skeleton/skeleton';
import { cn } from '@/utils/cn';
import { ROUTES } from '@/constants';
import {
  AWARD_SYNC_MESSAGES,
  SYNCABLE_AWARD_OPTIONS,
} from '@/constants/awardSync';
import type { AwardSyncJobView } from '@/lib/api/awardSync/awardSync';

import { useAwardSync } from './hooks/useAwardSync';

import styles from './awardsSyncPage.module.scss';

/** 同期の実行フォーム */
const SyncForm = memo(function SyncForm({
  awardName,
  year,
  isSubmitting,
  onAwardNameChange,
  onYearChange,
  onSubmit,
}: {
  awardName: string;
  year: string;
  isSubmitting: boolean;
  onAwardNameChange: (value: string) => void;
  onYearChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      onSubmit();
    },
    [onSubmit],
  );

  const handleYearChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onYearChange(event.target.value);
    },
    [onYearChange],
  );

  return (
    <form className={styles.c_awards_sync__form} onSubmit={handleSubmit}>
      <Select
        label='賞'
        options={SYNCABLE_AWARD_OPTIONS}
        value={awardName}
        onValueChange={onAwardNameChange}
        fullWidth
      />
      <Input
        label='年（授賞式の年）'
        type='number'
        value={year}
        onChange={handleYearChange}
        placeholder='2024'
        fullWidth
        required
      />
      <p className={styles.c_awards_sync__hint}>
        指定した賞・年のデータを取り直します。取得できなかった場合、既存の
        データは変更されません。
      </p>
      <Button type='submit' disabled={isSubmitting || !year}>
        {isSubmitting ? '開始中...' : '同期を開始'}
      </Button>
    </form>
  );
});

/** ジョブの状態表示 */
const JobStatus = memo(function JobStatus({ job }: { job: AwardSyncJobView }) {
  const isRunning = job.status === 'running';

  const className = cn(
    styles.c_awards_sync__status,
    isRunning && styles.c_awards_sync__status__running,
    isRunning && styles.c_awards_sync__pulse,
    job.status === 'succeeded' && styles.c_awards_sync__status__succeeded,
    job.status === 'failed' && styles.c_awards_sync__status__failed,
  );

  return (
    <div className={className} role='status' aria-live='polite'>
      {isRunning && <p>実行中です。完了まで数分かかることがあります。</p>}

      {job.status === 'succeeded' && (
        <>
          <p>完了しました（{job.totalUpserted ?? 0}件）。</p>
          {/*
            /api/awards は public キャッシュを返すため、同期直後でも
            ブラウザが古い結果を見せうる。クエリを変えて取り直させる
          */}
          <a
            href={`${ROUTES.AWARDS}?t=${encodeURIComponent(job.finishedAt ?? '')}`}
          >
            受賞作品ページで確認
          </a>
        </>
      )}

      {job.status === 'failed' && (
        <p>{job.errorMessage ?? AWARD_SYNC_MESSAGES.START_ERROR}</p>
      )}

      <p className={styles.c_awards_sync__meta}>
        {job.awardName} / {job.awardYear}年
      </p>
    </div>
  );
});

/** 実行中ジョブがあるときの案内 */
const ConflictNotice = memo(function ConflictNotice({
  isStale,
  isSubmitting,
  onForce,
}: {
  isStale: boolean;
  isSubmitting: boolean;
  onForce: () => void;
}) {
  return (
    <div className={styles.c_awards_sync__conflict}>
      <p>{AWARD_SYNC_MESSAGES.ALREADY_RUNNING}</p>

      {/*
        閾値未満では強制操作を出さない。正常に走っている処理を
        誤って切らせないため
      */}
      {isStale && (
        <>
          <p className={styles.c_awards_sync__hint}>
            {AWARD_SYNC_MESSAGES.STALE_HINT}
          </p>
          <Button type='button' onClick={onForce} disabled={isSubmitting}>
            強制的に失敗として閉じて再実行
          </Button>
        </>
      )}
    </div>
  );
});

/** 受賞作品の手動同期ページ */
export const AwardsSyncPage = memo(function AwardsSyncPage() {
  const {
    awardName,
    year,
    job,
    isLoading,
    isSubmitting,
    error,
    conflict,
    setAwardName,
    setYear,
    start,
  } = useAwardSync();

  const handleSubmit = useCallback(() => {
    void start();
  }, [start]);

  const handleForce = useCallback(() => {
    void start({ force: true });
  }, [start]);

  return (
    <div className={styles.c_awards_sync}>
      <Heading level={1}>{AWARD_SYNC_MESSAGES.PAGE_TITLE}</Heading>

      <SyncForm
        awardName={awardName}
        year={year}
        isSubmitting={isSubmitting}
        onAwardNameChange={setAwardName}
        onYearChange={setYear}
        onSubmit={handleSubmit}
      />

      {error && <p className={styles.c_awards_sync__error}>{error}</p>}

      {conflict && (
        <ConflictNotice
          isStale={conflict.isStale}
          isSubmitting={isSubmitting}
          onForce={handleForce}
        />
      )}

      <section className={styles.c_awards_sync__section}>
        <Heading level={2}>直近の実行</Heading>

        {isLoading && <Skeleton data-testid='award-sync-loading' />}

        {!isLoading && !job && (
          <p className={styles.c_awards_sync__empty}>
            実行履歴はまだありません。
          </p>
        )}

        {!isLoading && job && <JobStatus job={job} />}
      </section>
    </div>
  );
});
```

`Heading` / `Skeleton` の props は既存の `accountsPage.tsx` の使い方に合わせること。`Skeleton` が `data-testid` を透過しない場合は、ラップした `<div data-testid='award-sync-loading'>` を置く。

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx jest src/features/admin/awardsSyncPage --silent
```

Expected: PASS（10ケース）

- [ ] **Step 6: デザインチェックと lint**

```bash
npx eslint src/features/admin/awardsSyncPage/ && npx stylelint 'src/features/admin/awardsSyncPage/*.scss'
```

`stylelint` が未導入なら skip してよい。**ハードコードされた色・余白が無いこと**を目視で確認する。

- [ ] **Step 7: コミット**

```bash
git -C . add src/features/admin/awardsSyncPage/
git -C . commit -m "feat(awards): 手動同期の画面を追加

賞セレクトは既存の Radix ベース Select を使う。選択肢は定数から生成
するので、賞を増やしても画面側の改修は要らない。

強制失効のボタンは閾値超過時だけ出し、「実行中の処理自体は止まりません」
を併記する。正常に走っている処理を誤って切らせないため。

成功後の確認リンクには finished_at をクエリに付ける。/api/awards が
public キャッシュを返すため、同期直後でもブラウザが古い結果を見せて
「直っていない」と誤判断させうる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: ルートとナビゲーション導線

**Files:**
- Create: `src/app/admin/awards/page.tsx`
- Create: `src/app/admin/awards/loader.tsx`
- Modify: `src/constants/navigation.ts`
- Modify: `src/components/layout/userMenu/userMenu.tsx`
- Modify: `src/components/layout/userMenu/useUserMenu.ts`
- Modify: `src/components/layout/mobileDrawer/mobileDrawer.tsx`

**Interfaces:**
- Consumes: `AwardsSyncPage`（Task 14）、`ROUTES.ADMIN_AWARDS`（Task 11）
- Produces: `MENU_LABELS.ADMIN_AWARD_SYNC`（`'受賞作品の同期'`）

- [ ] **Step 1: ページとローダーを書く**

`src/app/admin/awards/loader.tsx`:

```tsx
'use client';

import dynamic from 'next/dynamic';

const AwardsSyncPage = dynamic(
  () =>
    import('@/features/admin/awardsSyncPage/awardsSyncPage').then((m) => ({
      default: m.AwardsSyncPage,
    })),
  { ssr: false },
);

export function AwardsSyncPageLoader() {
  return <AwardsSyncPage />;
}
```

`src/app/admin/awards/page.tsx`:

```tsx
/**
 * 受賞作品の手動同期ページ（admin ロールのみ）
 *
 * アクセス制御は `src/proxy.ts` と各 API Route の `withAdminAuth` が行う。
 * このページ自体はデータを持たず、表示はクライアント側で取得する。
 */

import type { Metadata } from 'next';

import { AwardsSyncPageLoader } from './loader';

export const metadata: Metadata = {
  title: '受賞作品の手動同期 | Movie App',
  description: '管理者が年と賞を指定して受賞作品データを同期する',
  // 管理画面を検索エンジンに拾わせない
  robots: { index: false, follow: false },
};

export default function AdminAwardsPage() {
  return <AwardsSyncPageLoader />;
}
```

- [ ] **Step 2: メニューのラベルを足す**

`src/constants/navigation.ts` の `MENU_LABELS`:

```ts
  /** admin ロールのみに表示するアカウント管理画面への導線 */
  ADMIN_ACCOUNTS: 'アカウント管理',
  /** admin ロールのみに表示する受賞作品同期画面への導線 */
  ADMIN_AWARD_SYNC: '受賞作品の同期',
```

- [ ] **Step 3: PC メニューに導線を足す**

`src/components/layout/userMenu/useUserMenu.ts` の `ROUTES.ADMIN_ACCOUNTS` への遷移ハンドラ（`:26` 付近）に倣い、`handleAdminAwardSyncClick` を `useCallback` で足す。`src/components/layout/userMenu/userMenu.tsx:154` の項目の直後に、同じ admin 条件分岐の中へ新しい項目を追加する。

- [ ] **Step 4: SP ドロワーに導線を足す**

`src/components/layout/mobileDrawer/mobileDrawer.tsx:150`（遷移ハンドラ）と `:280`（表示）に倣って同様に追加する。**SP 側を忘れないこと。** テスト観点の「レスポンシブ」はこの導線を見る。

- [ ] **Step 5: 既存のレイアウトテストが通ることを確認する**

```bash
npx jest src/components/layout --silent && npx tsc --noEmit
```

Expected: PASS。admin メニューの項目数を数えているテストがあれば期待値を更新する

- [ ] **Step 6: 画面をブラウザで確認する**

```bash
npm run dev
```

admin ロールのユーザーでログインし `/admin/awards` を開く。**画面左下の Next.js Dev Tools バッジが赤くなっていないことを必ず確認する**（「N Issues」と出ていたらエラー状態。画面が正常に見えても見逃さない）。

- [ ] **Step 7: コミット**

```bash
git -C . add src/app/admin/awards/ src/constants/navigation.ts src/components/layout/
git -C . commit -m "feat(awards): 手動同期ページのルートとナビ導線を追加

PC メニューと SP ドロワーの両方に admin 専用の導線を置く。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: E2E

`.github/workflows/e2e.yml` の `env:` に **`OPENAI_API_KEY` が無い**ため、カンヌ・GG の同期は CI で実行できない。アカデミー賞も eiga.com への実 HTTP になる。したがって**外部通信は `page.route` でモックし、画面側の挙動を検証する**。この方針なら `e2e.yml` へのシークレット追加は不要（追加する場合は Dependabot 側のストアにも登録すること。忘れると依存更新PRだけ E2E が落ちる）。

**Files:**
- Create: `e2e/admin/awardSync.spec.ts`

**Interfaces:**
- Consumes: 既存の admin ログインヘルパー（`e2e/admin/adminAccounts.spec.ts` と `e2e/helpers/` を読んで同じものを使う）

- [ ] **Step 1: 既存の admin E2E を読んでヘルパーを確認する**

```bash
ls e2e/admin/ e2e/helpers/ && sed -n '1,50p' e2e/admin/adminAccounts.spec.ts
```

ログイン方法・`runScope` の使い方・SP/PC の切り替え方を既存に合わせる。

- [ ] **Step 2: E2E を書く**

`e2e/admin/awardSync.spec.ts`。API をルートレベルでモックして、外部通信と DB 書き込みを一切起こさない。

```ts
import { test, expect, type Page } from '@playwright/test';

// ログインヘルパーは既存の admin spec と同じものを使う
import { loginAsAdmin } from '../helpers/auth';

const SYNC_API = '**/api/admin/awards/sync';
const JOB_API = '**/api/admin/awards/sync/*';

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    awardName: 'cannes',
    awardYear: 2024,
    status: 'running',
    totalUpserted: null,
    errorMessage: null,
    createdAt: '2026-10-31T00:00:00.000Z',
    startedAt: '2026-10-31T00:00:00.000Z',
    finishedAt: null,
    ...overrides,
  };
}

async function stubLatest(page: Page, body: unknown) {
  await page.route(SYNC_API, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ status: 200, json: { success: true, data: body } });
  });
}

test.describe('受賞作品の手動同期', () => {
  test('未認証ではログインへ誘導され、戻り先が保持される', async ({ page }) => {
    await page.goto('/admin/awards');

    await expect(page).toHaveURL(/\/auth\/signin/);
    expect(page.url()).toContain('callbackUrl=%2Fadmin%2Fawards');
  });

  test('年と賞を指定して実行すると進捗が表示され、完了まで遷移する', async ({ page }) => {
    await loginAsAdmin(page);
    await stubLatest(page, { job: null, isStale: false });

    await page.route(SYNC_API, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({ status: 202, json: { success: true, data: { job: job() } } });
    });

    let polls = 0;
    await page.route(JOB_API, async (route) => {
      polls += 1;
      const status = polls >= 2 ? 'succeeded' : 'running';
      await route.fulfill({
        status: 200,
        json: {
          success: true,
          data: {
            job: job({
              status,
              totalUpserted: status === 'succeeded' ? 12 : null,
              finishedAt: status === 'succeeded' ? '2026-10-31T00:05:00.000Z' : null,
            }),
            isStale: false,
          },
        },
      });
    });

    await page.goto('/admin/awards');
    await expect(page.getByText('実行履歴はまだありません。')).toBeVisible();

    await page.getByLabel('年（授賞式の年）').fill('2024');
    await page.getByRole('button', { name: '同期を開始' }).click();

    await expect(page.getByRole('status')).toContainText('実行中');
    await expect(page.getByRole('status')).toContainText('12件', { timeout: 20_000 });
    await expect(page.getByRole('link', { name: '受賞作品ページで確認' })).toBeVisible();
  });

  test('実行中のジョブがあると409になり、閾値未満では強制操作が出ない', async ({ page }) => {
    await loginAsAdmin(page);
    await stubLatest(page, { job: null, isStale: false });

    await page.route(SYNC_API, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        status: 409,
        json: {
          success: false,
          error: { code: 'CONFLICT', message: '実行中の同期があります' },
          data: { job: job(), isStale: false },
        },
      });
    });

    await page.goto('/admin/awards');
    await page.getByLabel('年（授賞式の年）').fill('2024');
    await page.getByRole('button', { name: '同期を開始' }).click();

    await expect(page.getByText('実行中の同期があります')).toBeVisible();
    await expect(
      page.getByRole('button', { name: '強制的に失敗として閉じて再実行' }),
    ).toHaveCount(0);
  });

  test('閾値を超えた実行中ジョブは強制失効して再実行できる', async ({ page }) => {
    await loginAsAdmin(page);
    await stubLatest(page, { job: null, isStale: false });

    let forced = false;
    await page.route(SYNC_API, async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.fallback();

      const body = request.postDataJSON() as { force?: boolean };

      if (!body.force) {
        return route.fulfill({
          status: 409,
          json: {
            success: false,
            error: { code: 'CONFLICT', message: '実行中の同期があります' },
            data: { job: job(), isStale: true },
          },
        });
      }

      forced = true;
      await route.fulfill({ status: 202, json: { success: true, data: { job: job({ id: 'new-job' }) } } });
    });

    await page.route(JOB_API, async (route) => {
      await route.fulfill({ status: 200, json: { success: true, data: { job: job({ id: 'new-job' }), isStale: false } } });
    });

    await page.goto('/admin/awards');
    await page.getByLabel('年（授賞式の年）').fill('2024');
    await page.getByRole('button', { name: '同期を開始' }).click();

    await expect(
      page.getByText('実行中の処理自体は止まりません（OpenAI の課金は続きます）'),
    ).toBeVisible();

    await page.getByRole('button', { name: '強制的に失敗として閉じて再実行' }).click();

    await expect.poll(() => forced).toBe(true);
    await expect(page.getByRole('status')).toContainText('実行中');
  });

  test('キーボードのみで実行できる', async ({ page }) => {
    await loginAsAdmin(page);
    await stubLatest(page, { job: null, isStale: false });
    await page.route(SYNC_API, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({ status: 202, json: { success: true, data: { job: job() } } });
    });
    await page.route(JOB_API, async (route) => {
      await route.fulfill({ status: 200, json: { success: true, data: { job: job(), isStale: false } } });
    });

    await page.goto('/admin/awards');
    await page.getByLabel('年（授賞式の年）').focus();
    await page.keyboard.type('2024');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('status')).toContainText('実行中');
  });
});
```

⚠️ **ブラウザ間で同じユーザーを共有するため、「初期値はこう」というアサーションは必ずフレークする。** 上のテストはすべて `page.route` でレスポンスを固定しており DB 状態に依存しないが、追加する場合も同じ方針を守る。

- [ ] **Step 3: SP 導線の E2E を足す**

既存 `e2e/admin/adminAccounts.spec.ts` の SP 導線テストに倣い、モバイルビューポートでドロワーから `/admin/awards` に到達できることを検証するケースを追加する。既存の書き方をそのまま写す。

- [ ] **Step 4: E2E を実行する**

```bash
npx playwright test e2e/admin/awardSync.spec.ts
```

Expected: 全ケース PASS

- [ ] **Step 5: 全テストとカバレッジを確認する**

```bash
npx jest --coverage --silent
```

Expected: 全指標 80% 以上。下回る場合は不足しているテストを足してから進む

- [ ] **Step 6: コミット**

```bash
git -C . add e2e/admin/awardSync.spec.ts
git -C . commit -m "test(awards): 手動同期のE2Eを追加

CI の e2e.yml に OPENAI_API_KEY が無く外部通信を伴う同期は実行できない
ため、page.route で API を固定して画面側の挙動を検証する。この方針なら
シークレットの追加が不要で、Dependabot 側ストアへの登録漏れも起きない。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## PR 作成時のチェック

各 PR で共通して行うこと。

- [ ] PR 本文を4見出しで書く（概要 / ロードマップ / レビューポイント / テスト）
- [ ] `gh pr create --assignee Fn-front` を指定する（`gh auth switch` と同一コマンドで実行する）
- [ ] 本文に `Closes #xxx` を書く
- [ ] `.claude/documents/roadmap/phase12-future.md` のチェックボックスを更新してコミットに含める
- [ ] **PR 作成後はマージ承認待ちで停止する。** 許可を得るまで `gh pr merge` を実行しない
- [ ] マージ後は `--delete-branch` でリモート・ローカル両方のブランチを消す

**PR 4 のみビジュアル証跡が必要**（`.claude/rules/visual-evidence.md`）。新規画面なので Before は存在しない。After のスクリーンショットと動作動画（年+賞選択 → 実行 → 進捗 → 完了、409、強制失効）を `gh-image` で user-attachments にアップし、PR 本文に貼る。リポにはコミットしない（一時ファイルは `docs/tmp/`）。`gh image` は `--repo` を明示すること。

E2E のシナリオ結果スクショは別運用で、`docs/e2e-screenshots/` に**コミット**し、コミットSHA固定の permalink（`https://github.com/Fn-front/movie-app/blob/<sha>/docs/e2e-screenshots/<file>.png?raw=true`）で埋め込む。ブランチ指定はマージ後の削除で404になる。

---

## セルフレビュー結果

計画を書き終えてから設計書と突き合わせた結果。

**仕様カバレッジ** — 設計書の各節に対応するタスクがあることを確認した。

| 設計書 | 対応タスク |
| --- | --- |
| 4-1 データフロー | Task 9（POST + after）、Task 13（ポーリング） |
| 4-2 ステータスと孤児ジョブ | Task 1（pending なし）、Task 7（`isJobStale` / `finishJobIfRunning`）、Task 9（force）、Task 14（強制操作の出し分け） |
| 4-3 世代付き入れ替え | Task 8 |
| 4-4 同時実行の抑止 | Task 1（インデックス）、Task 9（409 と 23505 マッピング） |
| 4-5 サービス層の切り出し | Task 5 |
| 4-6 権限 | Task 11（`ADMIN_REQUIRED_ROUTES`）、Task 9/10（`withAdminAuth`） |
| 4-7 レスポンス形式とレート制限 | Task 2（定数と DB 制約）、Task 9/10（適用） |
| 4-8 OpenAI のタイムアウト | Task 4 |
| 5-1 DB | Task 1、Task 2、Task 3 |
| 5-2 アプリケーション | Task 6〜15 |
| 7 テスト | 各タスクの TDD ステップ + Task 16 |
| 9 実装の分割 | PR 1〜4 の構成 |
| 10 実装前に決めること | 冒頭の「この計画で確定させた値」で8項目すべて確定 |

**設計書からの逸脱1件** — 4-6 の「強制失効を `admin_audit_logs` に記録する」は、同テーブルが `target_user_id NOT NULL` と action の CHECK 制約を持ち、対象ユーザーが存在しない本操作にはスキーマ変更が要るため見送った。失効させたジョブ行の `error_message` と新ジョブの `requested_by` を記録とする（Task 9 に明記）。監査テーブルへの統合が必要なら別 Issue にする。

**型の一貫性** — 以下を通しで確認済み。

- `fetchAndResolveAward` の戻り値 `{ type: 'rows' | 'no_items' | 'no_tmdb_match' }` は Task 5 で定義し Task 8 で消費
- `finishJobIfRunning` の `boolean` 戻り値（false = 失効済み）は Task 7 で定義し Task 8・Task 9 で消費
- `AwardSyncJob`（サーバー側）と `AwardSyncJobView`（クライアント側）は同じ形。API 境界を越えるので別名にしている
- `isJobStale` は Task 7 の1箇所で定義し、Task 9・Task 10 で使う

**実装時に確認が要る箇所**（計画で断定できなかったもの）

1. `MS_PER_MINUTE` が `src/constants` に存在するか（Task 7。無ければ既存の時間定数ファイルに合わせる）
2. `Heading` / `Skeleton` / `Input` の props（Task 14。`accountsPage.tsx` の使い方に合わせる）
3. `syncAwardMoviesService.test.ts` 既存のモック変数名（Task 5。ファイル冒頭の定義に合わせる）
4. `e2e/helpers/` のログインヘルパー名（Task 16。既存 admin spec に合わせる）
5. admin メニューの項目数を数えているテストの有無（Task 15）

