# ウォッチリスト 配信優先表示（PR2: ユーザー設定 + 導線）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「何を配信とみなすか」（見放題のみ / レンタル・購入も含める）をユーザーが設定できるようにし、ウォッチリストからその設定に気づける導線を置く。

**Architecture:** 既存の `user_settings` テーブルに列を1つ足し、既存の `GET/PUT /api/user/settings` に乗せる。並び替えは `get_watchlist_sorted` RPC に `p_streaming_scope` を追加して反映する。導線は Radix Tooltip をラップした共通コンポーネントを新設し、ツールバーの見出し横に置く。

**Tech Stack:** Next.js (App Router) / TypeScript / Supabase (PostgREST + RPC) / TanStack Query / zod / Radix UI / SCSS Modules / Jest + React Testing Library / Playwright

**Spec:** `docs/superpowers/specs/2026-11-01-watchlist-streaming-priority-design.md`

## Global Constraints

- 会話・コメント・UI 文言はすべて日本語。
- ファイル名は lowerCamelCase、コンポーネントは PascalCase、API Route は kebab-case。
- テストは対象ファイルと同じディレクトリに `<filename>.test.ts(x)`。カバレッジは全指標 80% 以上。
- React コンポーネントは `React.memo` + `displayName` 必須。イベントハンドラーは `useCallback` 必須。
- クラス名結合は `cn()`（`@/utils/cn`）。SCSS Modules を使い、HTML タグを直接セレクタにしない。デザインシステム変数を使い値を直書きしない。
- アクセシビリティは WCAG AA 準拠。テストはアクセシビリティ優先クエリを使う。
- スキーマ変更は `supabase migration new` でファイルを作り `supabase db push` で適用。**適用前にトランザクション内で実行して `ROLLBACK` する dry-run を必ず行う**（`docs/tmp/dry-run-migration.mjs` の形）。
- **型を再生成したら `npx prettier --write src/types/database.types.ts` まで行う。** 忘れると CI の Prettier Check が落ちる。
- RPC は引数が増えると `CREATE OR REPLACE` で置き換えられない。`DROP FUNCTION` → `CREATE` し、**権限を明示的に書き直す**（`DROP` → `CREATE` では既定付与が復活しうる）。
- 設定の保存先は **`user_settings` テーブル**（`users` ではない）。API のメソッドは **PUT**（PATCH ではない）。
- 初期値は `any`（見放題・レンタル・購入のいずれか）。
- 作業ブランチは `feature/watchlist-streaming-scope-setting`（main 起点の worktree、作成済み）。

## 前提（PR1 で入っているもの）

- `movie_streaming_status` テーブル（`flatrate_provider_ids` / `paid_provider_ids` / `*_since` / `*_resumed`）
- `get_watchlist_sorted(p_user_id, p_sort, p_limit, p_offset, p_exclude_watched, p_prioritize_streaming)`
- `GET /api/watchlist` の `prioritize_streaming` パラメータと `streaming` レスポンス
- `StreamingBadge` コンポーネント

---

### Task 1: 設定値の定数と型

**Files:**

- Modify: `src/constants/watchlist.ts`
- Modify: `src/schema/user.ts:34-50`
- Test: `src/schema/user.test.ts`（無ければ作る）

**Interfaces:**

- Consumes: なし
- Produces:
  - `STREAMING_SCOPE_VALUES = ['any', 'flatrate'] as const`
  - `type StreamingScope = 'any' | 'flatrate'`
  - `STREAMING_SCOPE_DEFAULT = 'any'`
  - `WATCHLIST_STREAMING_SCOPE_LABELS`（UI 文言）
  - `updateSettingsSchema` に `streamingNoticeScope?: StreamingScope`
  - `UserSettings` に `streamingNoticeScope: StreamingScope`

- [ ] **Step 1: 定数を追加する**

`src/constants/watchlist.ts` の末尾に追記する。

```ts
/**
 * 「配信中」とみなす範囲の選択肢
 *
 * any      : 見放題・レンタル・購入のいずれかで観られる
 * flatrate : 見放題になったときだけ
 */
export const STREAMING_SCOPE_VALUES = ['any', 'flatrate'] as const;

/**
 * 「配信中」とみなす範囲
 */
export type StreamingScope = (typeof STREAMING_SCOPE_VALUES)[number];

/**
 * 初期値
 *
 * 実測では未視聴26件のうち見放題10件・レンタルのみ5件で、any にしても
 * 先頭が埋まりすぎることはなかった。バッジで形態を区別できるため
 * 含めても誤解させない。
 */
export const STREAMING_SCOPE_DEFAULT: StreamingScope = 'any';

/**
 * 配信範囲設定の表示ラベル
 */
export const WATCHLIST_STREAMING_SCOPE_LABELS = {
  /** 設定セクションの見出し */
  HEADING: '配信開始のお知らせ',
  /** 設定の説明 */
  DESCRIPTION:
    'ウォッチリストで、どの状態になった作品を先頭に表示するかを選べます',
  /** any の選択肢 */
  ANY: 'レンタル・購入も含める',
  /** flatrate の選択肢 */
  FLATRATE: '見放題になったときだけ',
  /** ラジオグループの読み上げ名 */
  GROUP_ARIA: '配信開始のお知らせの対象',
  /** 更新成功 */
  UPDATED: '配信開始のお知らせを更新しました',
  /** 更新失敗 */
  UPDATE_FAILED: '配信設定の更新に失敗しました',
} as const;

/**
 * ウォッチリストのツールバーに出す、並びの説明
 */
export const WATCHLIST_STREAMING_HINT_LABELS = {
  /** ⓘ ボタンの読み上げ名 */
  TRIGGER_ARIA: '並び順について',
  /** 本文（any のとき） */
  ANY: '配信中の作品を先頭に表示しています。見放題・レンタルが対象です。',
  /** 本文（flatrate のとき） */
  FLATRATE: '配信中の作品を先頭に表示しています。見放題のみが対象です。',
  /** 設定ページへのリンク文言 */
  SETTINGS_LINK: '設定で変更',
} as const;
```

- [ ] **Step 2: 失敗するテストを書く**

`src/schema/user.test.ts` に追記する（ファイルが無ければ作る。その場合は
`import { updateSettingsSchema } from './user';` から書く）。

```ts
describe('updateSettingsSchema の streamingNoticeScope', () => {
  it("'any' を受け付ける", () => {
    const result = updateSettingsSchema.safeParse({
      streamingNoticeScope: 'any',
    });

    expect(result.success).toBe(true);
  });

  it("'flatrate' を受け付ける", () => {
    const result = updateSettingsSchema.safeParse({
      streamingNoticeScope: 'flatrate',
    });

    expect(result.success).toBe(true);
  });

  it('未知の値は失敗する', () => {
    const result = updateSettingsSchema.safeParse({
      streamingNoticeScope: 'rent-only',
    });

    expect(result.success).toBe(false);
  });

  it('省略できる（他の設定だけ更新できる）', () => {
    const result = updateSettingsSchema.safeParse({
      notificationEnabled: true,
    });

    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 3: テストを実行して落ちることを確認**

Run: `npx jest src/schema/user.test.ts`
Expected: FAIL（`'rent-only'` が通ってしまう、または3件目だけ失敗）

- [ ] **Step 4: スキーマと型を更新する**

`src/schema/user.ts` を編集する。import に定数を足すこと。

```ts
import { STREAMING_SCOPE_VALUES } from '@/constants';
import type { StreamingScope } from '@/constants';
```

`updateSettingsSchema` を次の形にする。

```ts
export const updateSettingsSchema = z.object({
  theme: z.enum(THEME_VALUES).optional(),
  notificationEnabled: z.boolean().optional(),
  /** ウォッチリストで「配信中」とみなす範囲 */
  streamingNoticeScope: z.enum(STREAMING_SCOPE_VALUES).optional(),
});
```

`UserSettings` に追加する。

```ts
export interface UserSettings {
  theme: (typeof THEME_VALUES)[number];
  notificationEnabled: boolean;
  /** ウォッチリストで「配信中」とみなす範囲 */
  streamingNoticeScope: StreamingScope;
}
```

- [ ] **Step 5: テストを実行して通ることを確認**

```bash
npx jest src/schema/user.test.ts
npx tsc --noEmit
```

Expected: テストは PASS。`tsc` は `UserSettings` を組み立てている箇所
（`src/app/api/user/settings/route.ts` の `DEFAULT_SETTINGS` など）で
`streamingNoticeScope` が足りずエラーになる。これは Task 3 で直すので、
**この時点のエラーはそのままでよい**。エラーが `UserSettings` 関連だけであることを確認する。

- [ ] **Step 6: コミット**

```bash
git add src/constants/watchlist.ts src/schema/user.ts src/schema/user.test.ts
git commit -m "feat(watchlist): 配信範囲設定の定数と型を追加"
```

---

### Task 2: `user_settings` への列追加

**Files:**

- Create: `supabase/migrations/<timestamp>_add_streaming_notice_scope.sql`
- Modify: `src/types/database.types.ts`（自動生成）

**Interfaces:**

- Consumes: なし
- Produces: `user_settings.streaming_notice_scope TEXT NOT NULL DEFAULT 'any'`

- [ ] **Step 1: マイグレーションを作る**

```bash
npx supabase migration new add_streaming_notice_scope
```

生成されたファイルに以下を書く。

```sql
-- ウォッチリストで「配信中」とみなす範囲をユーザーごとに持つ
--
-- 背景:
--   配信開始の優先表示（#899）で、見放題だけを対象にするか
--   レンタル・購入も含めるかは好みが分かれる。実測では未視聴26件のうち
--   見放題10件・レンタルのみ5件で、どちらの設定でも実用になる。
--
-- 初期値を any にする理由:
--   バッジで「見放題」「レンタル」を区別して見せるため、含めても誤解させない。
--   「観ようと思えば今日観られる」作品が全部手前に来る方が目的に合う。
--
-- users ではなく user_settings に置く理由:
--   theme / notification_enabled と同じテーブルで、RLS と user_id ごとの
--   ポリシーが既にある。列を足すだけで保存の仕組みが揃う。

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS streaming_notice_scope TEXT NOT NULL DEFAULT 'any';

ALTER TABLE public.user_settings
  ADD CONSTRAINT chk_user_settings_streaming_notice_scope
    CHECK (streaming_notice_scope IN ('any', 'flatrate'));

COMMENT ON COLUMN public.user_settings.streaming_notice_scope IS
  'ウォッチリストで「配信中」とみなす範囲。any = 見放題/レンタル/購入のいずれか、flatrate = 見放題のみ。';
```

GRANT は追記しない。`user_settings` は既存テーブルで、
`20261018053616_declare_table_grants.sql` で権限が宣言済み。
列を足しても GRANT は引き継がれる。

- [ ] **Step 2: dry-run する**

`docs/tmp/dry-run-migration.mjs` を作って実行する（`docs/tmp` は gitignore 対象）。

```js
// マイグレーションをトランザクション内で実行し、必ずロールバックする
import pg from 'pg';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, ''),
      ];
    }),
);

const sql = readFileSync(process.argv[2], 'utf8');
const parsed = new URL(
  readFileSync('supabase/.temp/pooler-url', 'utf8').trim(),
);

const client = new pg.Client({
  host: parsed.hostname,
  port: Number(parsed.port),
  user: decodeURIComponent(parsed.username),
  password: env.SUPABASE_DB_PASSWORD,
  database: parsed.pathname.replace(/^\//, ''),
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  await client.query('BEGIN');
  await client.query(sql);

  const { rows: cols } = await client.query(
    `SELECT column_name, data_type, column_default, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_settings'
        AND column_name = 'streaming_notice_scope'`,
  );
  console.log('■ 追加される列');
  console.log(' ', cols[0] ?? '(見つからない)');

  // 既存行が既定値で埋まるか
  const { rows: filled } = await client.query(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE streaming_notice_scope = 'any') AS any_count
       FROM public.user_settings`,
  );
  console.log(
    `■ 既存行: ${filled[0].total}件、うち 'any': ${filled[0].any_count}件`,
  );

  // CHECK が効くか
  try {
    await client.query(
      `UPDATE public.user_settings SET streaming_notice_scope = 'invalid'`,
    );
    console.log('⚠️ 不正な値が入ってしまった');
  } catch (e) {
    console.log(`■ 不正な値の拒否: OK (${e.code})`);
  }

  console.log('\n✅ SQL は正常に実行できた');
} catch (error) {
  console.error('\n❌ SQL が失敗した:', error.message);
  process.exitCode = 1;
} finally {
  await client.query('ROLLBACK');
  console.log('→ ロールバック済み（本番には何も残していない）');
  await client.end();
}
```

worktree には `.env.local` と `supabase/.temp/` が無いので、親リポジトリからコピーする。

```bash
cp ../../../.env.local .env.local
mkdir -p supabase/.temp
cp ../../../supabase/.temp/project-ref ../../../supabase/.temp/linked-project.json \
   ../../../supabase/.temp/pooler-url ../../../supabase/.temp/postgres-version \
   supabase/.temp/
```

Run: `node docs/tmp/dry-run-migration.mjs supabase/migrations/<timestamp>_add_streaming_notice_scope.sql`
Expected: 列が `text` / `NOT NULL` / 既定 `'any'`、既存行がすべて `'any'`、不正値が `23514` で拒否。

- [ ] **Step 3: 適用する**

```bash
npx supabase db push --dry-run
npx supabase db push
```

Expected: 対象が今回作ったファイル1件だけで、成功すること。

- [ ] **Step 4: 型を再生成して整形する**

```bash
npx supabase gen types typescript --project-id $(cat supabase/.temp/project-ref) > src/types/database.types.ts
npx prettier --write src/types/database.types.ts
grep -n "streaming_notice_scope" src/types/database.types.ts
```

`git diff --stat src/types/database.types.ts` で差分が列追加分だけか確認する。

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/ src/types/database.types.ts
git commit -m "feat(watchlist): 配信範囲設定の列を user_settings に追加"
```

---

### Task 3: 設定 API の読み書き

**Files:**

- Modify: `src/app/api/user/settings/route.ts:30-33, 44-78, 133-150`
- Modify: `src/app/api/user/settings/route.test.ts`
- Modify: `src/lib/api/user/user.ts`

**Interfaces:**

- Consumes: `updateSettingsSchema` / `UserSettings`（Task 1）、列（Task 2）
- Produces: `GET /api/user/settings` が `streamingNoticeScope` を返し、`PUT` が受け取る

- [ ] **Step 1: 失敗するテストを書く**

`src/app/api/user/settings/route.test.ts` に追記する。既存のモック構成に合わせること。

既存テストは `createPutRequest` を持っており、`mockFrom` は毎回インラインで組んでいる。
その流儀に合わせる。`upsert()` に渡された値を見たいので、記録用の変数だけ足す。

```ts
describe('配信範囲設定', () => {
  /** upsert に渡された行を記録する */
  let upsertedData: Record<string, unknown> = {};

  /** user_settings の upsert をモックする */
  const mockUpsert = () => {
    upsertedData = {};
    mockFrom.mockReturnValueOnce({
      upsert: (row: Record<string, unknown>) => {
        upsertedData = row;
        return { error: null };
      },
    });
  };

  it('GET で streamingNoticeScope を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: {
              theme: 'dark',
              notification_enabled: true,
              streaming_notice_scope: 'flatrate',
            },
            error: null,
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(json.data.streamingNoticeScope).toBe('flatrate');
  });

  it('設定が未作成なら既定の any を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: null,
            error: { code: SUPABASE_ERROR_CODE.NOT_FOUND },
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(json.data.streamingNoticeScope).toBe('any');
  });

  it('列を足す前に作られた行は既定値に倒す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: {
              theme: 'dark',
              notification_enabled: true,
              streaming_notice_scope: null,
            },
            error: null,
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(json.data.streamingNoticeScope).toBe('any');
  });

  it('PUT で streamingNoticeScope を保存する', async () => {
    mockUpsert();

    const response = await PUT(
      createPutRequest({ streamingNoticeScope: 'flatrate' }),
    );

    expect(response.status).toBe(200);
    expect(upsertedData.streaming_notice_scope).toBe('flatrate');
  });

  it('未知の値は400を返す', async () => {
    const response = await PUT(
      createPutRequest({ streamingNoticeScope: 'rent-only' }),
    );

    expect(response.status).toBe(400);
  });

  it('他の設定だけ更新しても配信範囲に触れない', async () => {
    mockUpsert();

    await PUT(createPutRequest({ notificationEnabled: true }));

    expect(upsertedData).not.toHaveProperty('streaming_notice_scope');
  });
});
```

既存テストの import に `SUPABASE_ERROR_CODE` が無ければ足すこと
（既存の「レコード未存在時はデフォルト値を返す」で使っているので、ほぼ確実にある）。

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx jest src/app/api/user/settings/route.test.ts`
Expected: FAIL（`streamingNoticeScope` が undefined）

- [ ] **Step 3: API Route を更新する**

`src/app/api/user/settings/route.ts` を編集する。

import に追加:

```ts
import { STREAMING_SCOPE_DEFAULT } from '@/constants';
import type { StreamingScope } from '@/constants';
```

`DEFAULT_SETTINGS` に追加:

```ts
const DEFAULT_SETTINGS: UserSettings = {
  theme: THEME_DEFAULTS.DEFAULT,
  notificationEnabled: false,
  streamingNoticeScope: STREAMING_SCOPE_DEFAULT,
};
```

GET の `select` を変える:

```ts
      .select('theme, notification_enabled, streaming_notice_scope')
```

GET のレスポンスに追加:

```ts
        data: {
          theme: data.theme,
          notificationEnabled: data.notification_enabled,
          // 列を足す前に作られた行は NULL になりうるため既定値へ倒す
          streamingNoticeScope: (data.streaming_notice_scope ??
            STREAMING_SCOPE_DEFAULT) as StreamingScope,
        } satisfies UserSettings,
```

PUT の `updateData` 組み立てに追加:

```ts
if (result.data.streamingNoticeScope !== undefined) {
  updateData.streaming_notice_scope = result.data.streamingNoticeScope;
}
```

- [ ] **Step 4: API クライアントの型を確認する**

`src/lib/api/user/user.ts` の `getSettings` / `updateSettings` は
`UserSettings` / `UpdateSettingsFormData` を使っているはず。型が自動で広がるなら変更不要。

```bash
grep -n "UserSettings\|UpdateSettingsFormData" src/lib/api/user/user.ts
```

独自に型を定義していた場合は `UserSettings` を参照する形に直す。

- [ ] **Step 5: テストを実行して通ることを確認**

```bash
npx jest src/app/api/user/settings/ src/schema/
npx tsc --noEmit
```

Expected: 全件 PASS、型エラーなし（Task 1 で残したエラーもここで解消する）。

- [ ] **Step 6: コミット**

```bash
git add src/app/api/user/settings/ src/lib/api/user/
git commit -m "feat(watchlist): 設定APIで配信範囲を読み書きする"
```

---

### Task 4: 並び替え RPC への反映

**Files:**

- Create: `supabase/migrations/<timestamp>_add_streaming_scope_to_watchlist_sorted.sql`
- Modify: `src/types/database.types.ts`（自動生成）

**Interfaces:**

- Consumes: 列（Task 2）
- Produces: `get_watchlist_sorted(p_user_id, p_sort, p_limit, p_offset, p_exclude_watched, p_prioritize_streaming, p_streaming_scope)`

`p_streaming_scope TEXT DEFAULT 'any'`。`'flatrate'` のとき見放題だけを配信中とみなす。

- [ ] **Step 1: マイグレーションを作る**

```bash
npx supabase migration new add_streaming_scope_to_watchlist_sorted
```

生成されたファイルに以下を書く。

```sql
-- ウォッチリストの並びで「配信中」とみなす範囲を切り替えられるようにする
--
-- p_streaming_scope:
--   'any'      : 見放題・レンタル・購入のいずれかで観られる（既定）
--   'flatrate' : 見放題になったときだけ
--
-- バッジの表示（streaming_offer_type / streaming_provider_ids）は
-- 範囲に関わらず実態を返す。'flatrate' を選んでいても、レンタルで
-- 観られる作品のカードには「レンタル」と出る。先頭に来ないだけ。
-- 設定は「何を先頭に出すか」であって「何を隠すか」ではないため。
--
-- 引数が増えるため CREATE OR REPLACE では置き換えられない。
-- DROP してから作り直すので、権限は明示的に書き直す。

DROP FUNCTION IF EXISTS public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN, BOOLEAN);

CREATE FUNCTION public.get_watchlist_sorted(
  p_user_id UUID,
  p_sort TEXT,
  p_limit INT,
  p_offset INT DEFAULT 0,
  p_exclude_watched BOOLEAN DEFAULT FALSE,
  p_prioritize_streaming BOOLEAN DEFAULT FALSE,
  p_streaming_scope TEXT DEFAULT 'any'
)
RETURNS TABLE (
  id UUID,
  tmdb_movie_id INT,
  title TEXT,
  poster_path TEXT,
  release_date DATE,
  added_at TIMESTAMPTZ,
  watched_at TIMESTAMPTZ,
  streaming_offer_type TEXT,
  streaming_provider_ids JSONB,
  streaming_resumed BOOLEAN,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH enriched AS (
    SELECT
      w.id,
      w.tmdb_movie_id,
      w.title,
      w.poster_path,
      w.release_date,
      w.added_at,
      w.watched_at,
      -- バッジは実態をそのまま返す（範囲設定で隠さない）。
      -- 見放題とレンタルの両方で観られる場合は見放題を優先して見せる
      CASE
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          THEN 'flatrate'
        WHEN COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN 'paid'
        ELSE NULL
      END AS streaming_offer_type,
      CASE
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          THEN s.flatrate_provider_ids
        WHEN COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN s.paid_provider_ids
        ELSE '[]'::jsonb
      END AS streaming_provider_ids,
      CASE
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          THEN COALESCE(s.flatrate_resumed, FALSE)
        WHEN COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN COALESCE(s.paid_resumed, FALSE)
        ELSE FALSE
      END AS streaming_resumed,
      -- 並び順の判定だけが範囲設定の影響を受ける
      CASE
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          THEN TRUE
        WHEN p_streaming_scope = 'any'
          AND COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN TRUE
        ELSE FALSE
      END AS counts_as_streaming,
      -- 並び順に使う「この配信期間がいつ始まったか」。
      -- 範囲に含まれる形態のものだけを見る
      CASE
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          AND p_streaming_scope = 'any'
          AND COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN GREATEST(s.flatrate_since, s.paid_since)
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          THEN s.flatrate_since
        WHEN p_streaming_scope = 'any'
          AND COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN s.paid_since
        ELSE NULL
      END AS streaming_since,
      -- 再配信の判定も範囲に含まれる形態のものを見る
      CASE
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          THEN COALESCE(s.flatrate_resumed, FALSE)
        WHEN p_streaming_scope = 'any'
          AND COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN COALESCE(s.paid_resumed, FALSE)
        ELSE FALSE
      END AS order_resumed
    FROM watchlist w
    LEFT JOIN movie_streaming_status s
      ON s.tmdb_movie_id = w.tmdb_movie_id
    WHERE w.user_id = p_user_id
      AND w.deleted_at IS NULL
      AND (NOT p_exclude_watched OR w.watched_at IS NULL)
  )
  SELECT
    e.id,
    e.tmdb_movie_id,
    e.title,
    e.poster_path,
    e.release_date,
    e.added_at,
    e.watched_at,
    e.streaming_offer_type,
    e.streaming_provider_ids,
    e.streaming_resumed,
    COUNT(*) OVER() AS total_count
  FROM enriched e
  ORDER BY
    -- 視聴済みは常に最後
    CASE WHEN e.watched_at IS NULL THEN 0 ELSE 1 END,
    -- 配信中を先頭へ。初配信（0）→ 再配信（1）→ 対象外（2）
    CASE
      WHEN NOT p_prioritize_streaming THEN 0
      WHEN e.watched_at IS NOT NULL THEN 0
      WHEN NOT e.counts_as_streaming THEN 2
      WHEN e.order_resumed THEN 1
      ELSE 0
    END,
    -- 配信中グループ内は検知が新しい順
    CASE
      WHEN p_prioritize_streaming AND e.watched_at IS NULL
        AND e.counts_as_streaming
        THEN e.streaming_since
      ELSE NULL
    END DESC NULLS LAST,
    -- 公開日が近い順。公開日なしは同グループ内の末尾
    CASE
      WHEN p_sort <> 'release_date_proximity' THEN NULL
      WHEN e.release_date IS NULL THEN 1
      ELSE 0
    END NULLS FIRST,
    CASE
      WHEN p_sort = 'release_date_proximity' THEN ABS(e.release_date - CURRENT_DATE)
      ELSE NULL
    END NULLS FIRST,
    e.added_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

REVOKE EXECUTE ON FUNCTION public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN, BOOLEAN, TEXT) TO service_role;

COMMENT ON FUNCTION public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN, BOOLEAN, TEXT) IS
  'ウォッチリストを指定ソートで返す。視聴済みは常に最後。p_prioritize_streaming で配信中の未視聴を先頭に送り、p_streaming_scope でその対象範囲を切り替える。バッジ用の列は範囲に関わらず実態を返す。EXECUTE は service_role のみ。';
```

- [ ] **Step 2: dry-run で並び順の差を確かめる**

`docs/tmp/dry-run-rpc.mjs` を作って実行する。

```js
// RPC 差し替えをトランザクション内で実行し、範囲ごとの並びを見てロールバックする
import pg from 'pg';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, ''),
      ];
    }),
);

const sql = readFileSync(process.argv[2], 'utf8');
const parsed = new URL(
  readFileSync('supabase/.temp/pooler-url', 'utf8').trim(),
);

const client = new pg.Client({
  host: parsed.hostname,
  port: Number(parsed.port),
  user: decodeURIComponent(parsed.username),
  password: env.SUPABASE_DB_PASSWORD,
  database: parsed.pathname.replace(/^\//, ''),
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  await client.query('BEGIN');
  await client.query(sql);

  const { rows: acl } = await client.query(
    `SELECT proacl::text AS acl FROM pg_proc WHERE proname = 'get_watchlist_sorted'`,
  );
  console.log('■ 関数の権限:', acl[0]?.acl ?? '(なし)');

  const { rows: users } = await client.query(
    `SELECT user_id, COUNT(*) AS cnt
       FROM watchlist
      WHERE deleted_at IS NULL AND watched_at IS NULL
      GROUP BY user_id ORDER BY cnt DESC LIMIT 1`,
  );
  const userId = users[0]?.user_id;

  for (const scope of ['any', 'flatrate']) {
    const { rows } = await client.query(
      `SELECT title, streaming_offer_type
         FROM get_watchlist_sorted($1, 'added_at', 8, 0, TRUE, TRUE, $2)`,
      [userId, scope],
    );
    console.log(`\n■ p_streaming_scope = '${scope}'`);
    for (const r of rows) {
      console.log(
        `  [${(r.streaming_offer_type ?? '--').padEnd(8)}] ${r.title}`,
      );
    }
  }

  console.log('\n✅ SQL は正常に実行できた');
} catch (error) {
  console.error('\n❌ SQL が失敗した:', error.message);
  process.exitCode = 1;
} finally {
  await client.query('ROLLBACK');
  console.log('→ ロールバック済み（本番には何も残していない）');
  await client.end();
}
```

Run: `node docs/tmp/dry-run-rpc.mjs supabase/migrations/<timestamp>_add_streaming_scope_to_watchlist_sorted.sql`

Expected:

- `'any'` では `flatrate` と `paid` の両方が先頭に並ぶ
- `'flatrate'` では `flatrate` だけが先頭に並び、`paid` は後ろへ下がる
- **`'flatrate'` でも `paid` のバッジ自体は残る**（`streaming_offer_type` が `paid` のまま）
- 権限は `postgres` と `service_role` のみ

- [ ] **Step 3: 適用して型を再生成する**

```bash
npx supabase db push --dry-run
npx supabase db push
npx supabase gen types typescript --project-id $(cat supabase/.temp/project-ref) > src/types/database.types.ts
npx prettier --write src/types/database.types.ts
grep -n "p_streaming_scope" src/types/database.types.ts
```

- [ ] **Step 4: 既存が壊れていないことを確認**

```bash
npx tsc --noEmit
npx jest src/app/api/watchlist/ src/features/watchlist/
```

Expected: どちらもエラーなし。既存の呼び出しは `p_streaming_scope` を渡さず
既定の `'any'` で動くため、挙動は PR1 と同じ。

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/ src/types/database.types.ts
git commit -m "feat(watchlist): 並び替えRPCで配信範囲を切り替えられるようにする"
```

---

### Task 5: 一覧 API への設定の反映

**Files:**

- Modify: `src/app/api/watchlist/route.ts:30-90`
- Modify: `src/app/api/watchlist/route.test.ts`

**Interfaces:**

- Consumes: RPC の `p_streaming_scope`（Task 4）、列（Task 2）
- Produces: `GET /api/watchlist` がユーザー設定を読んで RPC に渡す

クエリパラメータは増やさない。設定はサーバー側で引く。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/api/watchlist/route.test.ts` に追記する。
`user_settings` の取得をモックする必要があるため、既存の `mockFrom` を使う。

```ts
describe('配信範囲の設定', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  /** user_settings の取得をモックする */
  const mockUserSettings = (scope: string | null) => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: scope === null ? null : { streaming_notice_scope: scope },
              error: null,
            }),
        }),
      }),
    });
  };

  it('ユーザー設定を RPC に渡す', async () => {
    mockUserSettings('flatrate');
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(createGetRequest({ prioritize_streaming: 'true' }));

    expect(mockRpc).toHaveBeenCalledWith(
      'get_watchlist_sorted',
      expect.objectContaining({ p_streaming_scope: 'flatrate' }),
    );
  });

  it('設定が未作成なら any を渡す', async () => {
    mockUserSettings(null);
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(createGetRequest({ prioritize_streaming: 'true' }));

    expect(mockRpc).toHaveBeenCalledWith(
      'get_watchlist_sorted',
      expect.objectContaining({ p_streaming_scope: 'any' }),
    );
  });

  it('優先表示しないときは設定を引かない', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(createGetRequest());

    // サイドバーからの呼び出しで余計なクエリを増やさない
    expect(mockFrom).not.toHaveBeenCalledWith('user_settings');
    expect(mockRpc).toHaveBeenCalledWith(
      'get_watchlist_sorted',
      expect.objectContaining({ p_streaming_scope: 'any' }),
    );
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx jest src/app/api/watchlist/route.test.ts`
Expected: FAIL（3件）

- [ ] **Step 3: API Route を更新する**

`src/app/api/watchlist/route.ts` の GET を編集する。

import に追加:

```ts
import { STREAMING_SCOPE_DEFAULT } from '@/constants';
import type { StreamingScope } from '@/constants';
```

RPC 呼び出しの直前に設定を引く処理を足す。

```ts
// 優先表示するときだけ設定を引く。
// サイドバーは prioritize_streaming=false で呼ぶので、余計なクエリを増やさない
let streamingScope: StreamingScope = STREAMING_SCOPE_DEFAULT;

if (prioritize_streaming) {
  const { data: settings } = await supabase
    .from('user_settings')
    .select('streaming_notice_scope')
    .eq('user_id', session.user.id)
    .maybeSingle();

  // 設定が未作成、または列を足す前に作られた行は既定値に倒す
  streamingScope = (settings?.streaming_notice_scope ??
    STREAMING_SCOPE_DEFAULT) as StreamingScope;
}
```

RPC 呼び出しに引数を追加:

```ts
      p_prioritize_streaming: prioritize_streaming,
      p_streaming_scope: streamingScope,
```

設定の取得が失敗してもエラーにしない（`error` を見ずに `data` だけ使う）。
一覧が設定の取得失敗で丸ごと落ちるより、既定値で並べる方がましなため。
この意図をコメントに残す。

```ts
// 取得に失敗しても既定値で並べる。設定が読めないだけで
// 一覧全体が見られなくなる方が困るため
```

- [ ] **Step 4: テストを実行して通ることを確認**

```bash
npx jest src/app/api/watchlist/
npx tsc --noEmit
```

Expected: 全件 PASS、型エラーなし。

- [ ] **Step 5: コミット**

```bash
git add src/app/api/watchlist/
git commit -m "feat(watchlist): 一覧APIでユーザーの配信範囲設定を反映する"
```

---

### Task 6: Tooltip コンポーネント

**Files:**

- Create: `src/components/ui/tooltip/tooltip.tsx`
- Create: `src/components/ui/tooltip/tooltip.module.scss`
- Create: `src/components/ui/tooltip/tooltip.test.tsx`
- Modify: `package.json`

**Interfaces:**

- Consumes: なし
- Produces:

```tsx
interface TooltipProps {
  /** ホバー・フォーカスで開く対象 */
  trigger: ReactNode;
  /** 吹き出しの中身 */
  children: ReactNode;
  /** 吹き出しを出す向き（既定: 'bottom'） */
  side?: 'top' | 'right' | 'bottom' | 'left';
}
```

- [ ] **Step 1: 依存を追加する**

```bash
npm install @radix-ui/react-tooltip
```

既存の Radix 群と同じメジャーバージョンが入ることを確認する。

```bash
grep -n "@radix-ui/react-tooltip\|@radix-ui/react-dialog" package.json
```

- [ ] **Step 2: 失敗するテストを書く**

`src/components/ui/tooltip/tooltip.test.tsx` を作る。

```tsx
/**
 * Tooltipコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Tooltip } from './tooltip';

describe('Tooltip', () => {
  it('トリガーを表示する', () => {
    render(
      <Tooltip trigger={<button type='button'>ヘルプ</button>}>説明文</Tooltip>,
    );

    expect(screen.getByRole('button', { name: 'ヘルプ' })).toBeInTheDocument();
  });

  it('初期状態では中身を出さない', () => {
    render(
      <Tooltip trigger={<button type='button'>ヘルプ</button>}>説明文</Tooltip>,
    );

    expect(screen.queryByText('説明文')).toBeNull();
  });

  it('ホバーで中身を出す', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip trigger={<button type='button'>ヘルプ</button>}>説明文</Tooltip>,
    );

    await user.hover(screen.getByRole('button', { name: 'ヘルプ' }));

    expect(await screen.findByText('説明文')).toBeInTheDocument();
  });

  it('キーボードフォーカスで中身を出す', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip trigger={<button type='button'>ヘルプ</button>}>説明文</Tooltip>,
    );

    await user.tab();

    expect(await screen.findByText('説明文')).toBeInTheDocument();
  });
});
```

Radix Tooltip は `TooltipProvider` を必要とする。コンポーネント側で内包すれば
テストはそのまま通る（Step 4 の実装を参照）。

- [ ] **Step 3: テストを実行して落ちることを確認**

Run: `npx jest src/components/ui/tooltip/`
Expected: FAIL（`./tooltip` が存在しない）

- [ ] **Step 4: 実装する**

`src/components/ui/tooltip/tooltip.tsx` を作る。

```tsx
/**
 * Tooltipコンポーネント
 */

'use client';

import { type ReactNode, memo } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/utils/cn';

import styles from './tooltip.module.scss';

/**
 * Tooltipコンポーネントのプロパティ
 */
export interface TooltipProps {
  /** ホバー・フォーカスで開く対象 */
  trigger: ReactNode;
  /** 吹き出しの中身 */
  children: ReactNode;
  /** 吹き出しを出す向き */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** カスタムクラス名 */
  className?: string;
}

/** 開くまでの待ち時間（ミリ秒）。誤ホバーで出続けないよう少し置く */
const DELAY_DURATION = 200;

/**
 * Tooltipコンポーネント
 *
 * Provider を内包しているため、使う側は置くだけでよい。
 * Radix が aria-describedby の付与・フォーカス対応・ESC での閉じを担保する。
 *
 * 中身にリンクを置く場合は `trigger` をフォーカス可能な要素にすること
 * （Radix はトリガーに tabIndex を補わない）。
 */
export const Tooltip = memo<TooltipProps>(function Tooltip({
  trigger,
  children,
  side = 'bottom',
  className,
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={DELAY_DURATION}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{trigger}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className={cn(styles.c_tooltip, className)}
          >
            {children}
            <TooltipPrimitive.Arrow className={styles.c_tooltip__arrow} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
});

Tooltip.displayName = 'Tooltip';
```

- [ ] **Step 5: SCSS を書く**

`src/components/ui/tooltip/tooltip.module.scss` を作る。

```scss
@use '@/styles/variables' as *;

.c_tooltip {
  max-width: 280px;
  padding: $spacing-2 $spacing-3;
  border-radius: $border-radius-md;
  background-color: $background-primary;
  border: $border-width-1 solid $border-color;
  box-shadow: $shadow-md;
  color: $text-primary;
  font-size: $font-size-sm;
  line-height: 1.6;
  z-index: $z-index-tooltip;

  &__arrow {
    fill: $background-primary;
  }
}
```

使っている変数はすべて `src/styles/_variables.scss` に定義済み
（`$shadow-md` は189行目、`$z-index-tooltip` は236行目で確認済み）。値を直書きしないこと。

- [ ] **Step 6: テストを実行して通ることを確認**

```bash
npx jest src/components/ui/tooltip/
npx tsc --noEmit
npm run lint
```

Expected: 4件 PASS、型・Lint ともエラーなし。

jsdom で Radix Tooltip が描画できずに落ちる場合は、`userEvent.hover` の代わりに
`userEvent.tab()` によるフォーカスで開くテストだけを残し、ホバーのテストは
E2E（Task 9）に委ねる。**実装を変えてテストに寄せないこと。**

- [ ] **Step 7: コミット**

```bash
git add src/components/ui/tooltip/ package.json package-lock.json
git commit -m "feat(ui): Radix をラップした Tooltip コンポーネントを追加"
```

---

### Task 7: 設定ページの切り替え UI

**Files:**

- Create: `src/features/settings/streamingNoticeSettings/streamingNoticeSettings.tsx`
- Create: `src/features/settings/streamingNoticeSettings/streamingNoticeSettings.module.scss`
- Create: `src/features/settings/streamingNoticeSettings/streamingNoticeSettings.test.tsx`
- Modify: `src/features/settings/settingsPage/settingsPage.tsx`

**Interfaces:**

- Consumes: `WATCHLIST_STREAMING_SCOPE_LABELS` / `StreamingScope`（Task 1）、設定 API（Task 3）
- Produces: `StreamingNoticeSettings`（プロパティなし）

既存の `NotificationSettings` と同じ作り（`getSettings` / `updateSettings` を直接呼び、
読み込み中は Skeleton、失敗時は元に戻してトースト）にそろえる。

- [ ] **Step 1: 失敗するテストを書く**

`streamingNoticeSettings.test.tsx` を作る。

```tsx
/**
 * StreamingNoticeSettingsコンポーネント テスト
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StreamingNoticeSettings } from './streamingNoticeSettings';

// --- Mocks ---

const mockGetSettings = jest.fn();
const mockUpdateSettings = jest.fn();
jest.mock('@/lib/api/user/user', () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
  updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// --- Tests ---

describe('StreamingNoticeSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSettings.mockResolvedValue({
      theme: 'light',
      notificationEnabled: false,
      streamingNoticeScope: 'any',
    });
    mockUpdateSettings.mockResolvedValue(undefined);
  });

  it('保存済みの設定を選択状態にする', async () => {
    mockGetSettings.mockResolvedValue({
      theme: 'light',
      notificationEnabled: false,
      streamingNoticeScope: 'flatrate',
    });

    render(<StreamingNoticeSettings />);

    expect(
      await screen.findByRole('radio', { name: '見放題になったときだけ' }),
    ).toBeChecked();
  });

  it('初期値は「レンタル・購入も含める」', async () => {
    render(<StreamingNoticeSettings />);

    expect(
      await screen.findByRole('radio', { name: 'レンタル・購入も含める' }),
    ).toBeChecked();
  });

  it('選択を変えると保存してトーストを出す', async () => {
    const user = userEvent.setup();
    render(<StreamingNoticeSettings />);

    await user.click(
      await screen.findByRole('radio', { name: '見放題になったときだけ' }),
    );

    await waitFor(() =>
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        streamingNoticeScope: 'flatrate',
      }),
    );
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success' }),
    );
  });

  it('保存に失敗したら選択を戻してエラートーストを出す', async () => {
    mockUpdateSettings.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<StreamingNoticeSettings />);

    await user.click(
      await screen.findByRole('radio', { name: '見放題になったときだけ' }),
    );

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      ),
    );
    expect(
      screen.getByRole('radio', { name: 'レンタル・購入も含める' }),
    ).toBeChecked();
  });

  it('設定の取得に失敗しても既定値で表示する', async () => {
    mockGetSettings.mockRejectedValue(new Error('boom'));

    render(<StreamingNoticeSettings />);

    expect(
      await screen.findByRole('radio', { name: 'レンタル・購入も含める' }),
    ).toBeChecked();
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx jest src/features/settings/streamingNoticeSettings/`
Expected: FAIL（`./streamingNoticeSettings` が存在しない）

- [ ] **Step 3: 実装する**

`streamingNoticeSettings.tsx` を作る。

```tsx
/**
 * 配信開始のお知らせ設定コンポーネント
 */

'use client';

import { memo, useCallback, useEffect, useState } from 'react';

import { RadioGroup } from '@/components/ui/radioGroup/radioGroup';
import { Skeleton } from '@/components/ui/skeleton/skeleton';
import {
  STREAMING_SCOPE_DEFAULT,
  WATCHLIST_STREAMING_SCOPE_LABELS,
} from '@/constants';
import type { StreamingScope } from '@/constants';
import { useToast } from '@/hooks/useToast';
import { getSettings, updateSettings } from '@/lib/api/user/user';
import { handleApiError } from '@/utils/error';

import styles from './streamingNoticeSettings.module.scss';

/** ラジオの選択肢（ファイルスコープ定数） */
const SCOPE_OPTIONS = [
  { label: WATCHLIST_STREAMING_SCOPE_LABELS.ANY, value: 'any' },
  { label: WATCHLIST_STREAMING_SCOPE_LABELS.FLATRATE, value: 'flatrate' },
];

/**
 * 配信開始のお知らせ設定
 *
 * 既存の通知設定と同じく、設定APIを直接叩いて即座に保存する。
 * 失敗したら選択を元に戻す。
 */
export const StreamingNoticeSettings = memo(function StreamingNoticeSettings() {
  const { toast } = useToast();
  const [scope, setScope] = useState<StreamingScope>(STREAMING_SCOPE_DEFAULT);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchSettings = async () => {
      try {
        const settings = await getSettings();
        if (!cancelled) {
          setScope(settings.streamingNoticeScope);
        }
      } catch {
        // 既定値のまま表示する
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = useCallback(
    async (value: string) => {
      const next = value as StreamingScope;
      const previous = scope;
      setScope(next);

      try {
        await updateSettings({ streamingNoticeScope: next });
        toast({
          title: WATCHLIST_STREAMING_SCOPE_LABELS.UPDATED,
          variant: 'success',
        });
      } catch (error) {
        setScope(previous);
        const { message } = handleApiError(error);
        toast({
          title: '更新エラー',
          description:
            message ?? WATCHLIST_STREAMING_SCOPE_LABELS.UPDATE_FAILED,
          variant: 'error',
        });
      }
    },
    [scope, toast],
  );

  if (isLoading) {
    return (
      <div className={styles.c_streaming_notice_settings}>
        <Skeleton variant='text' width={280} height={14} />
        <Skeleton variant='rect' width={220} height={48} />
      </div>
    );
  }

  return (
    <div className={styles.c_streaming_notice_settings}>
      <p className={styles.c_streaming_notice_settings__description}>
        {WATCHLIST_STREAMING_SCOPE_LABELS.DESCRIPTION}
      </p>
      <RadioGroup
        options={SCOPE_OPTIONS}
        value={scope}
        onValueChange={handleChange}
        aria-label={WATCHLIST_STREAMING_SCOPE_LABELS.GROUP_ARIA}
      />
    </div>
  );
});

StreamingNoticeSettings.displayName = 'StreamingNoticeSettings';
```

- [ ] **Step 4: SCSS を書く**

`streamingNoticeSettings.module.scss` を作る。
既存の `notificationSettings.module.scss` を読み、同じ変数の使い方に合わせること。

```scss
@use '@/styles/variables' as *;

.c_streaming_notice_settings {
  display: flex;
  flex-direction: column;
  gap: $spacing-3;

  &__description {
    margin: 0;
    color: $text-secondary;
    font-size: $font-size-sm;
  }
}
```

- [ ] **Step 5: 設定ページに組み込む**

`src/features/settings/settingsPage/settingsPage.tsx` を編集する。

import に追加:

```tsx
import { StreamingNoticeSettings } from '@/features/settings/streamingNoticeSettings/streamingNoticeSettings';
import { WATCHLIST_STREAMING_SCOPE_LABELS } from '@/constants';
```

`NotificationSettings` のセクションの直後に追加する。

```tsx
<section className={styles.c_settings_page__section}>
  <Heading level={2}>{WATCHLIST_STREAMING_SCOPE_LABELS.HEADING}</Heading>
  <StreamingNoticeSettings />
</section>
```

既存セクションの並びを確認し、通知設定の直後に入れること。

- [ ] **Step 6: テストを実行して通ることを確認**

```bash
npx jest src/features/settings/
npx tsc --noEmit
```

Expected: 全件 PASS、型エラーなし。
`settingsPage.test.tsx` が存在する場合、新しいセクションで落ちることがある。
その場合は `StreamingNoticeSettings` をモックして既存テストを通す。

- [ ] **Step 7: コミット**

```bash
git add src/features/settings/
git commit -m "feat(watchlist): 設定ページに配信範囲の切り替えを追加"
```

---

### Task 8: ウォッチリストの ⓘ 導線

**Files:**

- Create: `src/features/watchlist/component/streamingSortHint/streamingSortHint.tsx`
- Create: `src/features/watchlist/component/streamingSortHint/streamingSortHint.module.scss`
- Create: `src/features/watchlist/component/streamingSortHint/streamingSortHint.test.tsx`
- Modify: `src/features/watchlist/watchlistPage/watchlistPage.tsx:113-116`
- Modify: `src/features/watchlist/watchlistPage/watchlistPage.module.scss`
- Modify: `src/features/watchlist/watchlistPage/watchlistPage.test.tsx`

**Interfaces:**

- Consumes: `Tooltip`（Task 6）、`WATCHLIST_STREAMING_HINT_LABELS`（Task 1）、設定 API（Task 3）
- Produces: `StreamingSortHint`（プロパティなし）

- [ ] **Step 1: 失敗するテストを書く**

`streamingSortHint.test.tsx` を作る。

```tsx
/**
 * StreamingSortHintコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StreamingSortHint } from './streamingSortHint';

// --- Mocks ---

const mockGetSettings = jest.fn();
jest.mock('@/lib/api/user/user', () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
}));

// --- Tests ---

describe('StreamingSortHint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSettings.mockResolvedValue({
      theme: 'light',
      notificationEnabled: false,
      streamingNoticeScope: 'any',
    });
  });

  it('ヘルプのトリガーを表示する', () => {
    render(<StreamingSortHint />);

    expect(
      screen.getByRole('button', { name: '並び順について' }),
    ).toBeInTheDocument();
  });

  it('フォーカスすると説明と設定リンクを出す', async () => {
    const user = userEvent.setup();
    render(<StreamingSortHint />);

    await user.tab();

    expect(
      await screen.findByText(/見放題・レンタルが対象です/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '設定で変更' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('見放題のみの設定なら文言が変わる', async () => {
    mockGetSettings.mockResolvedValue({
      theme: 'light',
      notificationEnabled: false,
      streamingNoticeScope: 'flatrate',
    });
    const user = userEvent.setup();
    render(<StreamingSortHint />);

    await user.tab();

    expect(await screen.findByText(/見放題のみが対象です/)).toBeInTheDocument();
  });

  it('設定の取得に失敗しても既定の文言を出す', async () => {
    mockGetSettings.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<StreamingSortHint />);

    await user.tab();

    expect(
      await screen.findByText(/見放題・レンタルが対象です/),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx jest src/features/watchlist/component/streamingSortHint/`
Expected: FAIL（`./streamingSortHint` が存在しない）

- [ ] **Step 3: 実装する**

`streamingSortHint.tsx` を作る。

```tsx
/**
 * StreamingSortHintコンポーネント
 * ウォッチリストの並び順の理由と、設定の存在を知らせる
 */

'use client';

import { memo, useEffect, useState } from 'react';
import Link from 'next/link';
import { IoInformationCircleOutline } from 'react-icons/io5';

import { Tooltip } from '@/components/ui/tooltip/tooltip';
import {
  APP_ROUTES,
  STREAMING_SCOPE_DEFAULT,
  WATCHLIST_STREAMING_HINT_LABELS,
} from '@/constants';
import type { StreamingScope } from '@/constants';
import { getSettings } from '@/lib/api/user/user';

import styles from './streamingSortHint.module.scss';

/**
 * StreamingSortHintコンポーネント
 *
 * 配信中の作品が先頭に来る理由と、その対象範囲を設定で変えられることを伝える。
 * 設定ページに項目を置くだけでは気づかれないため、並びを見ている場で知らせる。
 */
export const StreamingSortHint = memo(function StreamingSortHint() {
  const [scope, setScope] = useState<StreamingScope>(STREAMING_SCOPE_DEFAULT);

  useEffect(() => {
    let cancelled = false;

    const fetchSettings = async () => {
      try {
        const settings = await getSettings();
        if (!cancelled) {
          setScope(settings.streamingNoticeScope);
        }
      } catch {
        // 既定値のまま表示する。説明文が少しずれるだけで実害が無い
      }
    };

    fetchSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const description =
    scope === 'flatrate'
      ? WATCHLIST_STREAMING_HINT_LABELS.FLATRATE
      : WATCHLIST_STREAMING_HINT_LABELS.ANY;

  return (
    <Tooltip
      trigger={
        <button
          type='button'
          className={styles.c_streaming_sort_hint__trigger}
          aria-label={WATCHLIST_STREAMING_HINT_LABELS.TRIGGER_ARIA}
        >
          <IoInformationCircleOutline aria-hidden='true' />
        </button>
      }
    >
      <span className={styles.c_streaming_sort_hint__body}>
        {description}
        <Link
          href={APP_ROUTES.SETTINGS}
          className={styles.c_streaming_sort_hint__link}
        >
          {WATCHLIST_STREAMING_HINT_LABELS.SETTINGS_LINK}
        </Link>
      </span>
    </Tooltip>
  );
});

StreamingSortHint.displayName = 'StreamingSortHint';
```

`APP_ROUTES.SETTINGS`（`'/settings'`）は `src/constants/common.ts:36` に定義済み。
パスを直接書かずこれを使う。

- [ ] **Step 4: SCSS を書く**

`streamingSortHint.module.scss` を作る。

```scss
@use '@/styles/variables' as *;

.c_streaming_sort_hint {
  &__trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: none;
    color: $text-secondary;
    font-size: $font-size-lg;
    cursor: pointer;

    &:hover {
      color: $text-primary;
    }

    &:focus-visible {
      outline: $border-width-2 solid $primary-500;
      outline-offset: 2px;
      border-radius: $border-radius-sm;
    }
  }

  &__body {
    display: block;
  }

  &__link {
    display: inline-block;
    margin-left: $spacing-1;
    color: $text-link;
    text-decoration: underline;

    &:hover {
      color: $text-link-hover;
    }
  }
}
```

- [ ] **Step 5: ツールバーに組み込む**

`watchlistPage.tsx` の見出しを編集する。

import に追加:

```tsx
import { StreamingSortHint } from '@/features/watchlist/component/streamingSortHint/streamingSortHint';
```

`h1` を次の形にする。

```tsx
<div className={styles.c_watchlist_page__title_group}>
  <h1 className={styles.c_watchlist_page__title}>ウォッチリスト</h1>
  <StreamingSortHint />
</div>
```

`watchlistPage.module.scss` に追記する。

```scss
&__title_group {
  display: flex;
  align-items: center;
  gap: $spacing-2;
}
```

`.c_watchlist_page__toolbar` が `display: flex` で `h1` と `__controls` を
左右に振り分けている場合、`h1` を `div` で包んでも配置は変わらない。
崩れていたら `__title_group` に `flex-shrink: 0` を足す。

- [ ] **Step 6: ページのテストを足す**

`watchlistPage.test.tsx` に追記する。`StreamingSortHint` は設定APIを叩くため、
既存テストを壊さないようモックする。

```tsx
jest.mock(
  '@/features/watchlist/component/streamingSortHint/streamingSortHint',
  () => ({
    StreamingSortHint: () => <div data-testid='streaming-sort-hint' />,
  }),
);
```

```tsx
it('並び順のヒントを表示する', () => {
  render(<WatchlistPage />);

  expect(screen.getByTestId('streaming-sort-hint')).toBeInTheDocument();
});
```

- [ ] **Step 7: テストを実行して通ることを確認**

```bash
npx jest src/features/watchlist/
npx tsc --noEmit
npm run lint
```

Expected: 全件 PASS、型・Lint ともエラーなし。

- [ ] **Step 8: コミット**

```bash
git add src/features/watchlist/
git commit -m "feat(watchlist): ツールバーに並び順と設定の案内を追加"
```

---

### Task 9: E2E と全体検証

**Files:**

- Create: `e2e/settings/streamingNoticeSettings.spec.ts`
- Modify: `e2e/helpers/api.ts`
- Modify: `.claude/documents/roadmap/improvements.md`

- [ ] **Step 1: 型・Lint・全テスト・整形を通す**

```bash
npx tsc --noEmit
npm run lint
npx jest --coverage
npm run prettier:check
```

Expected: すべてエラーなし。カバレッジは全指標 80% 以上。

- [ ] **Step 2: ローカルで動作確認する**

worktree では `npm install` が必要（Task 6 で実行済みのはず）。

```bash
npm run dev
```

1. `/settings` に「配信開始のお知らせ」が出て、選択を変えるとトーストが出る
2. `/watchlist` の見出し横に ⓘ があり、ホバー／フォーカスで説明と設定リンクが出る
3. 設定を「見放題になったときだけ」にすると、レンタルのみの作品が先頭から下がる
4. **レンタルのみの作品のカードには「レンタル」バッジが残っている**（隠さない）
5. 画面左下の Next.js Dev Tools バッジが赤くなっていないこと

- [ ] **Step 3: 設定をリセットするヘルパーを足す**

`e2e/helpers/api.ts` に追加する。

```ts
/**
 * 指定ユーザーの設定を物理削除する（E2E用）
 *
 * 設定は upsert で作られるため、消せば既定値に戻る。
 *
 * @param userId - 対象ユーザーのID
 */
export async function cleanupUserSettings(userId: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/user_settings?user_id=eq.${userId}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
}
```

- [ ] **Step 4: E2E を書く**

`e2e/settings/streamingNoticeSettings.spec.ts` を作る。

```ts
/**
 * 配信開始のお知らせ設定 E2Eテスト（認証済み）
 *
 * 設定の保存と、ウォッチリスト側の並びへの反映を確認する。
 *
 * ⚠️ 共有の TEST_USER は使わない。設定を書き換えるため、
 * 同じユーザーを使う他の spec を並列実行時に壊す。
 */

import { test, expect, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import {
  cleanupStreamingStatus,
  cleanupUserSettings,
  cleanupWatchlistForUser,
  seedStreamingStatus,
} from '../helpers/api';
import { movieTiles } from '../helpers/locators';
import { runScopedEmail } from '../helpers/runScope';

test.describe.configure({ mode: 'serial', timeout: 120000 });

const USER = {
  email: runScopedEmail('e2e-streaming-scope'),
  password: 'StreamingScopeE2e1',
} as const;

/** Amazon Video のプロバイダーID（レンタル側） */
const PROVIDER_AMAZON_VIDEO = 10;

/** 映画をウォッチリストに追加し、その tmdb_movie_id とタイトルを返す */
async function addMovieToWatchlist(
  page: Page,
): Promise<{ tmdbMovieId: number; title: string }> {
  await page.goto('/movies/now-showing');
  await movieTiles(page).first().waitFor({ timeout: 30000 });

  const addButton = movieTiles(page)
    .first()
    .getByRole('button', { name: 'ウォッチリストに追加' });
  await expect(addButton).toBeVisible({ timeout: 15000 });

  const responsePromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/watchlist') &&
      res.request().method() === 'POST' &&
      res.status() === 201,
    { timeout: 30000 },
  );
  await addButton.click();
  const body = await (await responsePromise).json();

  return { tmdbMovieId: body.data.tmdb_movie_id, title: body.data.title };
}

test.describe('配信開始のお知らせ設定', () => {
  let session: DedicatedSession;
  let page: Page;
  const seededMovieIds: number[] = [];

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(120000);
    session = await openDedicatedSession(browser, USER);
    page = session.page;
  });

  test.afterAll(async () => {
    await cleanupStreamingStatus(seededMovieIds);
    await cleanupUserSettings(session.userId);
    await session.close();
  });

  test('設定ページで切り替えると保存される', async () => {
    await cleanupUserSettings(session.userId);
    await page.goto('/settings');

    const flatrateOption = page.getByRole('radio', {
      name: '見放題になったときだけ',
    });
    await expect(flatrateOption).toBeVisible({ timeout: 30000 });

    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/user/settings') &&
        res.request().method() === 'PUT' &&
        res.status() === 200,
      { timeout: 30000 },
    );
    await flatrateOption.click();
    await responsePromise;

    // リロードしても保たれる
    await page.reload();
    await expect(
      page.getByRole('radio', { name: '見放題になったときだけ' }),
    ).toBeChecked({ timeout: 30000 });

    await page.screenshot({
      path: 'docs/e2e-screenshots/settings-streaming-scope.png',
    });
  });

  test('ウォッチリストのヒントが設定を反映する', async () => {
    await page.goto('/watchlist');

    const trigger = page.getByRole('button', { name: '並び順について' });
    await expect(trigger).toBeVisible({ timeout: 30000 });
    await trigger.focus();

    // 直前のテストで flatrate にしてある
    await expect(page.getByText(/見放題のみが対象です/)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('link', { name: '設定で変更' })).toBeVisible();

    await page.screenshot({
      path: 'docs/e2e-screenshots/watchlist-streaming-hint.png',
    });
  });

  test('見放題のみの設定でもレンタルのバッジは残る', async () => {
    await cleanupWatchlistForUser(session.userId);
    const movie = await addMovieToWatchlist(page);
    seededMovieIds.push(movie.tmdbMovieId);

    // レンタルだけで観られる状態にする
    await seedStreamingStatus({
      tmdbMovieId: movie.tmdbMovieId,
      paidProviderIds: [PROVIDER_AMAZON_VIDEO],
    });

    await page.goto('/watchlist');

    // 先頭には来ないが、バッジ自体は出る。
    // 設定は「何を先頭に出すか」であって「何を隠すか」ではない
    const main = page.getByRole('main');
    await expect(main.getByText('レンタル')).toBeVisible({ timeout: 30000 });
  });
});
```

- [ ] **Step 5: E2E を実行する**

```bash
npx playwright test e2e/settings/ e2e/watchlist/ --project=chromium --reporter=line
```

Expected: 全件 PASS。既存の watchlist / settings E2E が壊れていないことも確認する。

- [ ] **Step 6: Issue を作ってロードマップを更新する**

PR1 で作った #899 は PR1 のマージで閉じているため、PR2 用の Issue を新しく作る。
本文は「概要 / 影響範囲 / 対応方針 / 完了条件」の型。
ラベルは `feature` / `P2: nice-to-have`。

`gh auth switch --user Fn-front` と同一コマンドで実行すること。

`.claude/documents/roadmap/improvements.md` の #899 の行の下に、
新しい Issue 番号で1行足す。

- [ ] **Step 7: PR を作る**

E2E のスクリーンショットを `docs/e2e-screenshots/` にコミットし、
PR 本文に**コミットSHA固定の permalink** で埋め込む。

```bash
gh auth switch --user Fn-front && gh pr create \
  --repo Fn-front/movie-app \
  --assignee Fn-front \
  --title "feat(watchlist): 配信開始の対象範囲を設定できるようにする" \
  --body "<本文>"
```

本文は CLAUDE.md の構成（概要 / ロードマップ / レビューポイント / テスト）に従い、
`Closes #<issue番号>` を含める。レビューポイントには最低限これを挙げる。

- 設定は「何を先頭に出すか」であって「何を隠すか」ではないこと（`flatrate` でもレンタルのバッジは残る）
- 設定を引くのは `prioritize_streaming=true` のときだけで、サイドバーからの呼び出しでクエリを増やさないこと
- 設定の取得に失敗しても既定値で並べ、一覧全体は落とさないこと
- `@radix-ui/react-tooltip` を追加したこと（既存 Radix 群と同じファミリ）

- [ ] **Step 8: マージ承認を待つ**

**PR を作ったらここで停止する。** ユーザーの明示的な許可があるまで `gh pr merge` を実行しない。
