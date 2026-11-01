# ウォッチリスト 追加年指定の視聴済み一括削除 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ウォッチリストの視聴済み作品を、追加した年を指定して確認モーダル経由でまとめて論理削除できるようにする。

**Architecture:** 追加年ごとの視聴済み件数は集計が要るので Postgres の RPC（`get_watchlist_watched_years`）で返す。対象一覧の取得と一括削除は単純な絞り込みなので PostgREST 直クエリで行い、年の範囲は API 側で JST の `timestamptz` に変換して渡す。UI は既存の Radix ベース `Modal` / `Select` / `Checkbox` / `Button` を組み合わせ、ロジックは `useWatchlistCleanup` フックに寄せる。

**Tech Stack:** Next.js (App Router) / TypeScript / Supabase (PostgREST + RPC) / TanStack Query / zod / Radix UI / SCSS Modules / Jest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-11-01-watchlist-bulk-delete-by-year-design.md`

## Global Constraints

- 会話・コメント・UI 文言はすべて日本語。
- ファイル名は lowerCamelCase、コンポーネントは PascalCase、API Route は kebab-case。
- テストは対象ファイルと同じディレクトリに `<filename>.test.ts(x)`。カバレッジは全指標 80% 以上。
- React コンポーネントは `React.memo` + `displayName` 必須。イベントハンドラーは `useCallback` 必須。
- クラス名結合は `cn()`（`@/utils/cn`）。SCSS Modules を使い、HTML タグを直接セレクタにしない。
- アクセシビリティは WCAG AA 準拠。テストはアクセシビリティ優先クエリ（`getByRole` / `getByLabelText`）を使う。
- スキーマ変更は `supabase migration new` でファイルを作り、`supabase db push` で適用。ダッシュボードでの直接変更は禁止。
- 関数を作ったら同じマイグレーションで `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` と `GRANT EXECUTE ... TO service_role` を書く。`SET search_path = public, pg_temp` を必ず付ける。
- **`withAuth` は `createServiceRoleClient()` を使うため RLS はバイパスされる。** 他ユーザーの行を守るのはクエリの `user_id` 条件だけ。一括更新では特に落とさないこと。
- 年の境界は `Asia/Tokyo` 固定。判定は必ずバックエンドで行う。
- **`watchlist.added_at` / `deleted_at` は現状 `TIMESTAMP`（タイムゾーンなし）。** Task 3 で `TIMESTAMPTZ` に移行するまで、JST の年境界は正しく扱えない。Task 3 を飛ばして Task 5 以降に進まないこと。
- 作業ブランチは `feature/watchlist-bulk-delete-by-year`（main 起点の worktree、作成済み）。

---

### Task 1: JST の年範囲ヘルパー

`added_at` は `TIMESTAMPTZ` で DB は UTC。`2025-01-01 05:00 JST` に追加した行は UTC では `2024-12-31 20:00` なので、素朴に年で切ると前年扱いになる。年の境界を JST で表現する関数を先に作る。

**Files:**

- Modify: `src/utils/date.ts`（末尾に追記）
- Test: `src/utils/date.test.ts`（末尾に追記）

**Interfaces:**

- Consumes: なし
- Produces: `getJstYearRange(year: number): { start: string; end: string }`
  `start` は `YYYY-01-01T00:00:00+09:00`、`end` は翌年の同じ形式。PostgREST の `gte` / `lt` にそのまま渡せる。

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/date.test.ts` の末尾に追記する。ファイル先頭の import に `getJstYearRange` を足すこと。

```ts
describe('getJstYearRange', () => {
  it('JSTの年初と翌年の年初を返す', () => {
    expect(getJstYearRange(2024)).toEqual({
      start: '2024-01-01T00:00:00+09:00',
      end: '2025-01-01T00:00:00+09:00',
    });
  });

  it('UTCでは前年になる時刻（1/1 05:00 JST）がその年に含まれる', () => {
    const { start, end } = getJstYearRange(2025);
    // UTC では 2024-12-31T20:00:00Z
    const boundary = new Date('2025-01-01T05:00:00+09:00').getTime();

    expect(boundary).toBeGreaterThanOrEqual(new Date(start).getTime());
    expect(boundary).toBeLessThan(new Date(end).getTime());
  });

  it('大晦日 23:59 JST はその年に含まれ、翌年には含まれない', () => {
    const { end } = getJstYearRange(2024);
    const lastMoment = new Date('2024-12-31T23:59:59+09:00').getTime();

    expect(lastMoment).toBeLessThan(new Date(end).getTime());
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx jest src/utils/date.test.ts -t getJstYearRange`
Expected: FAIL（`getJstYearRange is not a function` / import エラー）

- [ ] **Step 3: 実装する**

`src/utils/date.ts` の末尾に追記する。

````ts
/**
 * JST（Asia/Tokyo）における指定年の範囲を返す
 *
 * `added_at` などの TIMESTAMPTZ 列を「年」で絞るために使う。DB のタイムゾーンは
 * UTC のため、EXTRACT(YEAR FROM added_at) で切ると 2025-01-01 05:00 JST に
 * 追加した行が 2024年扱いになり、画面に出ている日付とズレる。
 *
 * 返す文字列はオフセット付きなので、PostgREST の gte / lt にそのまま渡せる。
 *
 * @param year - 対象の年（JST）
 * @returns start（その年の始まり、含む）と end（翌年の始まり、含まない）
 *
 * @example
 * ```ts
 * getJstYearRange(2024);
 * // => { start: '2024-01-01T00:00:00+09:00', end: '2025-01-01T00:00:00+09:00' }
 * ```
 */
export function getJstYearRange(year: number): {
  start: string;
  end: string;
} {
  return {
    start: `${year}-01-01T00:00:00+09:00`,
    end: `${year + 1}-01-01T00:00:00+09:00`,
  };
}
````

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `npx jest src/utils/date.test.ts -t getJstYearRange`
Expected: PASS（3件）

- [ ] **Step 5: コミット**

```bash
git add src/utils/date.ts src/utils/date.test.ts
git commit -m "feat(watchlist): JSTの年範囲を返すヘルパーを追加"
```

---

### Task 2: 定数と zod スキーマ

API 3本とモーダルが共有する定数・バリデーションを先に置く。

**Files:**

- Modify: `src/constants/watchlist.ts`
- Modify: `src/constants/apiEndpoints.ts:57-62`（ウォッチリストの節）
- Modify: `src/schema/watchlist.ts`
- Test: `src/schema/watchlist.test.ts`（末尾に追記）

**Interfaces:**

- Consumes: なし
- Produces:
  - `WATCHLIST_CLEANUP_MIN_YEAR = 2000` / `WATCHLIST_CLEANUP_MAX_YEAR = 2100`
  - `WATCHLIST_BULK_DELETE_MAX_EXCLUDE_IDS = 1000`
  - `WATCHLIST_CLEANUP_LABELS`（UI 文言）
  - `WATCHLIST_ERROR_MESSAGES.YEARS_FETCH_FAILED` / `.BULK_DELETE_FAILED`
  - `WATCHLIST_SUCCESS_MESSAGES.bulkDeleted(count: number)`
  - `API_ENDPOINTS.WATCHLIST_WATCHED_YEARS` / `.WATCHLIST_WATCHED` / `.WATCHLIST_BULK_DELETE`
  - `watchlistWatchedQuerySchema`（`{ year: number; cursor?: string; limit: number }`）
  - `watchlistBulkDeleteSchema`（`{ year: number; exclude_ids: string[] }`）
  - 型 `WatchlistBulkDeleteFormData`

- [ ] **Step 1: 失敗するテストを書く**

`src/schema/watchlist.test.ts` の末尾に追記する。既存の import 行に 2つのスキーマを足すこと。

```ts
describe('watchlistWatchedQuerySchema', () => {
  it('年のみ指定で limit がデフォルト値になる', () => {
    const result = watchlistWatchedQuerySchema.safeParse({ year: '2024' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.year).toBe(2024);
      expect(result.data.limit).toBe(20);
    }
  });

  it('年が下限より小さいと失敗する', () => {
    expect(
      watchlistWatchedQuerySchema.safeParse({ year: '1999' }).success,
    ).toBe(false);
  });

  it('年が上限より大きいと失敗する', () => {
    expect(
      watchlistWatchedQuerySchema.safeParse({ year: '2101' }).success,
    ).toBe(false);
  });

  it('年が数値でないと失敗する', () => {
    expect(watchlistWatchedQuerySchema.safeParse({ year: 'abc' }).success).toBe(
      false,
    );
  });

  it('limit が上限を超えると失敗する', () => {
    expect(
      watchlistWatchedQuerySchema.safeParse({ year: '2024', limit: '51' })
        .success,
    ).toBe(false);
  });

  it('cursor 省略時は0になる', () => {
    const result = watchlistWatchedQuerySchema.safeParse({ year: '2024' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cursor).toBe(0);
    }
  });

  it('cursor が負数だと失敗する', () => {
    expect(
      watchlistWatchedQuerySchema.safeParse({ year: '2024', cursor: '-1' })
        .success,
    ).toBe(false);
  });
});

describe('watchlistBulkDeleteSchema', () => {
  it('exclude_ids 省略時は空配列になる', () => {
    const result = watchlistBulkDeleteSchema.safeParse({ year: 2024 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.exclude_ids).toEqual([]);
    }
  });

  it('UUID の配列を受け付ける', () => {
    const result = watchlistBulkDeleteSchema.safeParse({
      year: 2024,
      exclude_ids: ['11111111-1111-4111-8111-111111111111'],
    });

    expect(result.success).toBe(true);
  });

  it('UUID でない要素があると失敗する', () => {
    const result = watchlistBulkDeleteSchema.safeParse({
      year: 2024,
      exclude_ids: ['not-a-uuid'],
    });

    expect(result.success).toBe(false);
  });

  it('exclude_ids が1001件だと失敗する', () => {
    const ids = Array.from(
      { length: 1001 },
      (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    );
    const result = watchlistBulkDeleteSchema.safeParse({
      year: 2024,
      exclude_ids: ids,
    });

    expect(result.success).toBe(false);
  });

  it('年が範囲外だと失敗する', () => {
    expect(watchlistBulkDeleteSchema.safeParse({ year: 1999 }).success).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx jest src/schema/watchlist.test.ts`
Expected: FAIL（`watchlistWatchedQuerySchema` が未定義）

- [ ] **Step 3: 定数を追加する**

`src/constants/watchlist.ts` を編集する。既存の `WATCHLIST_ERROR_MESSAGES` と `WATCHLIST_SUCCESS_MESSAGES` にキーを足し、新しい定数を末尾に追記する。

```ts
/**
 * 一括削除で指定できる年の下限
 *
 * 上限を「現在年」にするとバリデーションが実行時刻に依存してテストが不安定になる。
 * 未来の年を指定しても対象は0件になるだけなので、固定の範囲で異常入力だけ弾く。
 */
export const WATCHLIST_CLEANUP_MIN_YEAR = 2000;

/**
 * 一括削除で指定できる年の上限
 */
export const WATCHLIST_CLEANUP_MAX_YEAR = 2100;

/**
 * 一括削除で除外できる件数の上限
 */
export const WATCHLIST_BULK_DELETE_MAX_EXCLUDE_IDS = 1000;

/**
 * 視聴済み一括削除の表示ラベル
 */
export const WATCHLIST_CLEANUP_LABELS = {
  /** ツールバーの起動ボタン */
  OPEN_BUTTON: '視聴済みを整理',
  /** モーダルのタイトル */
  MODAL_TITLE: '視聴済みをまとめて削除',
  /** 年セレクトのラベル */
  YEAR_LABEL: '追加年',
  /** 全選択チェックボックス */
  SELECT_ALL: 'すべて選択',
  /** 視聴済みが1件も無いときの表示 */
  EMPTY: '整理できる視聴済みの作品がありません',
  /** キャンセルボタン */
  CANCEL: 'キャンセル',
  /** 削除ボタン: 「{件数}件を削除する」 */
  deleteButton: (count: number) => `${count}件を削除する`,
  /** 選択件数の表示: 「{件数}件を選択中」 */
  selectedCount: (count: number) => `${count}件を選択中`,
  /** 年セレクトの選択肢: 「{年}年（{件数}件）」 */
  yearOption: (year: number, count: number) => `${year}年（${count}件）`,
} as const;
```

`WATCHLIST_ERROR_MESSAGES` に追加するキー:

```ts
  YEARS_FETCH_FAILED: '追加年の取得に失敗しました',
  BULK_DELETE_FAILED: '視聴済みの一括削除に失敗しました',
```

`WATCHLIST_SUCCESS_MESSAGES` に追加するキー:

```ts
  /** 一括削除成功: 「{件数}件を削除しました」 */
  bulkDeleted: (count: number) => `${count}件を削除しました`,
```

`src/constants/apiEndpoints.ts` のウォッチリストの節（`WATCHLIST_CALENDAR` の下）に追加する。

```ts
  /** 視聴済みがある追加年の一覧 */
  WATCHLIST_WATCHED_YEARS: '/api/watchlist/watched-years',
  /** 指定年の視聴済み一覧 */
  WATCHLIST_WATCHED: '/api/watchlist/watched',
  /** 視聴済みの一括削除 */
  WATCHLIST_BULK_DELETE: '/api/watchlist/bulk-delete',
```

- [ ] **Step 4: zod スキーマを追加する**

`src/schema/watchlist.ts` の末尾に追記する。`@/constants` からの import に新しい定数を足すこと。

```ts
/**
 * 一括削除の対象一覧取得クエリのバリデーションスキーマ
 *
 * year は必須。追加日（added_at）の年を JST で解釈する前提で、
 * 実際の範囲計算は API 側の getJstYearRange が行う。
 */
export const watchlistWatchedQuerySchema = z.object({
  year: z.coerce
    .number({ error: '追加年は数値で指定してください' })
    .int('追加年は整数で指定してください')
    .min(
      WATCHLIST_CLEANUP_MIN_YEAR,
      `追加年は${WATCHLIST_CLEANUP_MIN_YEAR}以上で指定してください`,
    )
    .max(
      WATCHLIST_CLEANUP_MAX_YEAR,
      `追加年は${WATCHLIST_CLEANUP_MAX_YEAR}以下で指定してください`,
    ),
  // 既存の watchlistQuerySchema は cursor を z.string() のまま受け、route 側で
  // parseInt と負数チェックをしている。ここはスキーマに寄せて二重化させない
  cursor: z.coerce
    .number({ error: 'カーソルは数値で指定してください' })
    .int('カーソルは整数で指定してください')
    .min(0, 'カーソルは0以上で指定してください')
    .default(0),
  limit: z.coerce
    .number()
    .int()
    .min(1, '取得件数は1以上で指定してください')
    .max(
      WATCHLIST_MAX_LIMIT,
      `取得件数は${WATCHLIST_MAX_LIMIT}以下で指定してください`,
    )
    .default(WATCHLIST_DEFAULT_LIMIT),
});

/**
 * 一括削除の対象一覧取得クエリの型
 */
export type WatchlistWatchedQueryParams = z.infer<
  typeof watchlistWatchedQuerySchema
>;

/**
 * 視聴済み一括削除のバリデーションスキーマ
 *
 * exclude_ids は「チェックを外した作品」。空配列はその年の視聴済み全件が対象。
 * include_ids への切り替えは持たない（全解除に近い使い方でもボディは数十KBに
 * 収まり、分岐を増やす利得が無い）。
 */
export const watchlistBulkDeleteSchema = z.object({
  year: z
    .number({ error: '追加年は数値で指定してください' })
    .int('追加年は整数で指定してください')
    .min(
      WATCHLIST_CLEANUP_MIN_YEAR,
      `追加年は${WATCHLIST_CLEANUP_MIN_YEAR}以上で指定してください`,
    )
    .max(
      WATCHLIST_CLEANUP_MAX_YEAR,
      `追加年は${WATCHLIST_CLEANUP_MAX_YEAR}以下で指定してください`,
    ),
  exclude_ids: z
    .array(z.string().uuid('除外IDの形式が不正です'))
    .max(
      WATCHLIST_BULK_DELETE_MAX_EXCLUDE_IDS,
      `除外できるのは${WATCHLIST_BULK_DELETE_MAX_EXCLUDE_IDS}件までです`,
    )
    .default([]),
});

/**
 * 視聴済み一括削除の型
 */
export type WatchlistBulkDeleteFormData = z.infer<
  typeof watchlistBulkDeleteSchema
>;
```

- [ ] **Step 5: テストを実行して通ることを確認**

Run: `npx jest src/schema/watchlist.test.ts`
Expected: PASS（既存分を含めて全件）

- [ ] **Step 6: コミット**

```bash
git add src/constants/watchlist.ts src/constants/apiEndpoints.ts src/schema/watchlist.ts src/schema/watchlist.test.ts
git commit -m "feat(watchlist): 視聴済み一括削除の定数とバリデーションを追加"
```

---

### Task 3: DB スキーマ変更（型移行 + 集計 RPC）

**前提:** `watchlist.added_at` と `watchlist.deleted_at` は今も `TIMESTAMP`（タイムゾーンなし）。
`20260319000000_index_and_schema_optimization.sql` で `TIMESTAMPTZ` へ移行されたのは
`favorites` / `saved_filters` / `dismissed_movies` / `users` だけで、`watchlist` は対象外だった。

`TIMESTAMP` のままだと本機能の JST 処理が2箇所とも壊れる。

- `added_at AT TIME ZONE 'Asia/Tokyo'` は `timestamp` に適用すると**逆変換**になる
  （壁時計時刻を JST とみなして `timestamptz` を返す）
- `.gte('added_at', '2024-01-01T00:00:00+09:00')` は `timestamp` 列との比較で
  オフセットが捨てられ、JST 補正が効かない

先に型を揃えてから RPC を足す。`watched_at` は既に `TIMESTAMPTZ` なので対象外。

**Files:**

- Create: `supabase/migrations/<timestamp1>_fix_watchlist_timestamptz.sql`
- Create: `supabase/migrations/<timestamp2>_add_watchlist_watched_years_rpc.sql`
- Modify: `src/types/database.types.ts`（`supabase gen types` による自動生成。手で編集しない）

**Interfaces:**

- Consumes: なし
- Produces: RPC `get_watchlist_watched_years(p_user_id UUID) → (added_year INT, watched_count BIGINT)[]`
  戻り値の列名は `added_year` / `watched_count`。`count` を列名にすると `COUNT(*)` と紛らわしいため避けている。

- [ ] **Step 1: 型移行のマイグレーションを作る**

```bash
npx supabase migration new fix_watchlist_timestamptz
```

生成されたファイルに以下を書く。手順は `favorites` の前例
（`20260319000000_index_and_schema_optimization.sql:60-96`）に合わせている。

```sql
-- watchlist の added_at / deleted_at を TIMESTAMPTZ に揃える
--
-- 背景:
--   #160 で TIMESTAMP → TIMESTAMPTZ の統一を進めたとき、favorites /
--   saved_filters / dismissed_movies / users は移行したが watchlist が漏れていた。
--   watched_at だけは後から TIMESTAMPTZ で追加されており、同じテーブル内で
--   型が食い違った状態になっている。
--
-- 今ここで直す理由:
--   追加年（added_at）を JST で切る機能を足すため。TIMESTAMP のままだと
--   AT TIME ZONE 'Asia/Tokyo' が逆変換になり、PostgREST にオフセット付きの
--   境界値を渡してもオフセットが捨てられる。型を揃えないと、読んで正しそうに
--   見えるクエリが9時間ズレる。
--
--   get_watchlist_sorted は RETURNS TABLE (added_at TIMESTAMPTZ) と宣言しており、
--   実列が TIMESTAMP のため暗黙キャストが DB のタイムゾーン設定に依存していた。
--   この移行でその曖昧さも消える。
--
-- 既存値の解釈:
--   DEFAULT now() は DB のタイムゾーン（UTC）で書かれ、アプリも
--   new Date().toISOString()（UTC）で渡している。よって AT TIME ZONE 'UTC' で
--   解釈するのが正しい。

-- deleted_at を参照するポリシーをDROP
DROP POLICY IF EXISTS watchlist_select_own ON watchlist;

-- deleted_at を WHERE 句に持つ部分インデックスをDROP
DROP INDEX IF EXISTS idx_watchlist_user_movie;
DROP INDEX IF EXISTS idx_watchlist_user_watched;

-- 型変更
ALTER TABLE watchlist
  ALTER COLUMN added_at TYPE TIMESTAMPTZ USING added_at AT TIME ZONE 'UTC',
  ALTER COLUMN deleted_at TYPE TIMESTAMPTZ USING deleted_at AT TIME ZONE 'UTC';

-- ポリシーを再作成（定義は initial_schema と同一）
CREATE POLICY watchlist_select_own ON watchlist
  FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

-- 部分インデックスを再作成（定義は元と同一）
CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_user_movie
  ON watchlist (user_id, tmdb_movie_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_watchlist_user_watched
  ON watchlist (user_id, watched_at)
  WHERE deleted_at IS NULL;
```

`idx_watchlist_user_id` / `idx_watchlist_added_at` / `idx_watchlist_deleted_at` は
部分インデックスではないため `ALTER COLUMN TYPE` が自動で再構築する。明示的な DROP は不要。

- [ ] **Step 2: 集計 RPC のマイグレーションを作る**

```bash
npx supabase migration new add_watchlist_watched_years_rpc
```

生成されたファイルに以下を書く。

```sql
-- 追加年ごとの視聴済み件数を返す
--
-- 視聴済み一括削除の年セレクトに出す選択肢を作る。
-- 集計（GROUP BY）は PostgREST で表現できないため RPC にする。
-- 対象一覧の取得と削除は単純な絞り込みなので PostgREST 直クエリで足りる。
--
-- 年を Asia/Tokyo で切る理由:
--   added_at は TIMESTAMPTZ で DB のタイムゾーンは UTC。素朴に
--   EXTRACT(YEAR FROM added_at) とすると、2025-01-01 05:00 JST に追加した行が
--   2024年扱いになり、画面に出ている日付とズレる。日本向けのアプリなので
--   JST 固定で切り、年の定義はバックエンドに一本化する。
--
-- 戻り値の列名を count にしない理由:
--   COUNT(*) と紛らわしく、クエリを読み違える余地があるため watched_count にする。

CREATE OR REPLACE FUNCTION public.get_watchlist_watched_years(
  p_user_id UUID
)
RETURNS TABLE (
  added_year INT,
  watched_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    EXTRACT(YEAR FROM (w.added_at AT TIME ZONE 'Asia/Tokyo'))::INT AS added_year,
    COUNT(*) AS watched_count
  FROM watchlist w
  WHERE w.user_id = p_user_id
    AND w.deleted_at IS NULL
    AND w.watched_at IS NOT NULL
  GROUP BY 1
  ORDER BY 1 DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_watchlist_watched_years(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_watchlist_watched_years(UUID) TO service_role;

COMMENT ON FUNCTION public.get_watchlist_watched_years(UUID) IS
  '追加年（JST）ごとの視聴済み件数を降順で返す。0件の年は返さない。EXECUTE は service_role のみ。';
```

- [ ] **Step 3: 適用対象を確認する**

```bash
set -a; . ./.env.local; set +a
npx supabase db push --dry-run
```

Expected: 対象が今回作った 2件だけで、型移行 → RPC の順に並んでいること。

もし `LegacyDbPushMissingLocalError`（リモートにあるがローカルに無い）が出たら、`.claude/rules/supabase-db.md` の「安全な回避手順」に従う。**`migration repair --status reverted` は実行しない。**

- [ ] **Step 4: 適用する**

```bash
npx supabase db push
```

Expected: 成功。エラーが出たら止めて報告する。

型移行は本番データを書き換える。失敗した場合、ポリシーとインデックスだけ DROP された
中途半端な状態が残りうるので、**エラーが出たら自己判断で再実行せず報告する**。

- [ ] **Step 5: 型を再生成する**

```bash
npx supabase gen types typescript --project-id <project-id> > src/types/database.types.ts
```

`<project-id>` は `npx supabase projects list` で確認する。
生成後、RPC が型に出ていることを確認する。

```bash
grep -n "get_watchlist_watched_years" src/types/database.types.ts
```

- [ ] **Step 6: 型チェックと既存テストが通ることを確認**

```bash
npx tsc --noEmit
npx jest src/app/api/watchlist/ src/features/watchlist/
```

Expected: どちらもエラーなし。

型移行で `get_watchlist_sorted` の暗黙キャストが解消されるため、既存の一覧・カレンダーが
壊れていないことをここで確認する。落ちたら型移行の影響を疑う。

- [ ] **Step 7: コミット（関心ごとに分ける）**

```bash
git add supabase/migrations/*_fix_watchlist_timestamptz.sql src/types/database.types.ts
git commit -m "fix(watchlist): added_at/deleted_at を TIMESTAMPTZ に揃える"

git add supabase/migrations/*_add_watchlist_watched_years_rpc.sql
git commit -m "feat(watchlist): 追加年ごとの視聴済み件数を返すRPCを追加"
```

---

### Task 4: `GET /api/watchlist/watched-years`

年セレクトの選択肢を返す。

**Files:**

- Create: `src/app/api/watchlist/watched-years/route.ts`
- Test: `src/app/api/watchlist/watched-years/route.test.ts`

**Interfaces:**

- Consumes: RPC `get_watchlist_watched_years`（Task 3）、`WATCHLIST_ERROR_MESSAGES.YEARS_FETCH_FAILED`（Task 2）
- Produces: `GET /api/watchlist/watched-years` → `{ success: true, data: { years: Array<{ year: number; count: number }> } }`

- [ ] **Step 1: 失敗するテストを書く**

`src/app/api/watchlist/watched-years/route.test.ts` を作る。

```ts
/**
 * @jest-environment node
 */

/**
 * 視聴済みの追加年一覧API Route テスト (GET)
 */

import { GET } from './route';

// --- Mocks ---

const mockRpc = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ rpc: mockRpc }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

jest.mock('@/helpers/auth', () => ({
  getAuthSession: jest.fn().mockResolvedValue({ user: { id: 'user-123' } }),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
}));

import { getAuthSession } from '@/helpers/auth';

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// --- Helpers ---

const createGetRequest = () =>
  new Request('http://localhost/api/watchlist/watched-years');

// --- Tests ---

describe('GET /api/watchlist/watched-years', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('視聴済みがある年を件数付きで返す', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        { added_year: 2025, watched_count: 3 },
        { added_year: 2024, watched_count: 12 },
      ],
      error: null,
    });

    const response = await GET(createGetRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.years).toEqual([
      { year: 2025, count: 3 },
      { year: 2024, count: 12 },
    ]);
  });

  it('ログイン中のユーザーIDでRPCを呼ぶ', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(createGetRequest());

    expect(mockRpc).toHaveBeenCalledWith('get_watchlist_watched_years', {
      p_user_id: 'user-123',
    });
  });

  it('視聴済みが1件も無いときは空配列を返す', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    const response = await GET(createGetRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.years).toEqual([]);
  });

  it('未認証なら401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(createGetRequest());

    expect(response.status).toBe(401);
  });

  it('レート制限を超えたら429を返す', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

    const response = await GET(createGetRequest());

    expect(response.status).toBe(429);
  });

  it('RPCが失敗したら500を返す', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'boom' },
    });

    const response = await GET(createGetRequest());

    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx jest src/app/api/watchlist/watched-years/route.test.ts`
Expected: FAIL（`./route` が存在しない）

- [ ] **Step 3: 実装する**

`src/app/api/watchlist/watched-years/route.ts` を作る。

```ts
/**
 * 視聴済みの追加年一覧API
 * GET /api/watchlist/watched-years - 視聴済みがある追加年と件数を取得
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  WATCHLIST_ERROR_MESSAGES,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { withAuth } from '@/helpers/routeHandler';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';

/** RPC の戻り行 */
interface WatchedYearRow {
  added_year: number;
  watched_count: number;
}

export const GET = withAuth(
  async ({ session, supabase }) => {
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.READ_USER_DATA,
      RATE_LIMIT_CONFIG.READ_USER_DATA.maxAttempts,
      RATE_LIMIT_CONFIG.READ_USER_DATA.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    // 年ごとの集計は PostgREST で表現できないため RPC に寄せている。
    // 年の境界は RPC 内で Asia/Tokyo に揃えている
    const { data, error } = await supabase.rpc('get_watchlist_watched_years', {
      p_user_id: session.user.id,
    });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as WatchedYearRow[];

    return NextResponse.json(
      {
        success: true,
        data: {
          years: rows.map((row) => ({
            year: Number(row.added_year),
            count: Number(row.watched_count),
          })),
        },
      },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Watchlist watched years fetch error',
    errorMessage: WATCHLIST_ERROR_MESSAGES.YEARS_FETCH_FAILED,
  },
);
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `npx jest src/app/api/watchlist/watched-years/route.test.ts`
Expected: PASS（6件）

- [ ] **Step 5: コミット**

```bash
git add src/app/api/watchlist/watched-years/
git commit -m "feat(watchlist): 視聴済みの追加年一覧APIを追加"
```

---

### Task 5: `GET /api/watchlist/watched`

モーダルに出す対象一覧。既存の一覧ページと同じオフセットページング。

**Files:**

- Create: `src/app/api/watchlist/watched/route.ts`
- Test: `src/app/api/watchlist/watched/route.test.ts`

**Interfaces:**

- Consumes: `getJstYearRange`（Task 1）、`watchlistWatchedQuerySchema`（Task 2）
- Produces: `GET /api/watchlist/watched?year=&cursor=&limit=` →
  `{ success: true, data: { watchlist: WatchlistItem[]; next_cursor: string | null; has_more: boolean } }`

- [ ] **Step 1: 失敗するテストを書く**

`src/app/api/watchlist/watched/route.test.ts` を作る。

```ts
/**
 * @jest-environment node
 */

/**
 * 指定年の視聴済み一覧API Route テスト (GET)
 */

import { GET } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

jest.mock('@/helpers/auth', () => ({
  getAuthSession: jest.fn().mockResolvedValue({ user: { id: 'user-123' } }),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
}));

import { getAuthSession } from '@/helpers/auth';

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// --- Helpers ---

const createGetRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/watchlist/watched');
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  return new Request(url.toString());
};

/** eq / is / not / gte / lt / order / range に渡された引数を記録する */
const calls: Record<string, unknown[][]> = {};

const mockWatchedQuery = (
  data: unknown[] | null,
  count: number | null,
  error: unknown = null,
) => {
  for (const key of Object.keys(calls)) delete calls[key];

  const record = (name: string) => {
    return (...args: unknown[]) => {
      calls[name] = [...(calls[name] ?? []), args];
      return chain;
    };
  };

  const chain: Record<string, unknown> = {
    eq: record('eq'),
    is: record('is'),
    not: record('not'),
    gte: record('gte'),
    lt: record('lt'),
    order: record('order'),
    range: (...args: unknown[]) => {
      calls.range = [...(calls.range ?? []), args];
      return Promise.resolve({ data, count, error });
    },
  };

  mockFrom.mockReturnValueOnce({
    select: (...args: unknown[]) => {
      calls.select = [...(calls.select ?? []), args];
      return chain;
    },
  });
};

const sampleItem = {
  id: '11111111-1111-4111-8111-111111111111',
  tmdb_movie_id: 100,
  title: '映画A',
  poster_path: '/a.jpg',
  release_date: '2024-03-15',
  added_at: '2024-03-01T00:00:00Z',
  watched_at: '2024-04-01T00:00:00Z',
};

// --- Tests ---

describe('GET /api/watchlist/watched', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('指定年の視聴済みを返す', async () => {
    mockWatchedQuery([sampleItem], 1);

    const response = await GET(createGetRequest({ year: '2024' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.watchlist).toHaveLength(1);
    expect(body.data.has_more).toBe(false);
    expect(body.data.next_cursor).toBeNull();
  });

  it('JSTの年範囲で絞り込む（UTCの前年を取りこぼさない）', async () => {
    mockWatchedQuery([], 0);

    await GET(createGetRequest({ year: '2025' }));

    expect(calls.gte).toContainEqual(['added_at', '2025-01-01T00:00:00+09:00']);
    expect(calls.lt).toContainEqual(['added_at', '2026-01-01T00:00:00+09:00']);
  });

  it('自分のユーザーIDと視聴済み・未削除で絞り込む', async () => {
    mockWatchedQuery([], 0);

    await GET(createGetRequest({ year: '2024' }));

    expect(calls.eq).toContainEqual(['user_id', 'user-123']);
    expect(calls.is).toContainEqual(['deleted_at', null]);
    expect(calls.not).toContainEqual(['watched_at', 'is', null]);
  });

  it('総件数が取得件数を上回るとき次カーソルを返す', async () => {
    mockWatchedQuery([sampleItem], 30);

    const response = await GET(createGetRequest({ year: '2024', limit: '20' }));
    const body = await response.json();

    expect(body.data.has_more).toBe(true);
    expect(body.data.next_cursor).toBe('20');
  });

  it('カーソル指定でオフセットが進む', async () => {
    mockWatchedQuery([sampleItem], 30);

    await GET(createGetRequest({ year: '2024', limit: '20', cursor: '20' }));

    expect(calls.range).toContainEqual([20, 39]);
  });

  it('0件なら空配列を返す', async () => {
    mockWatchedQuery([], 0);

    const response = await GET(createGetRequest({ year: '2024' }));
    const body = await response.json();

    expect(body.data.watchlist).toEqual([]);
    expect(body.data.has_more).toBe(false);
  });

  it('year が無いと400を返す', async () => {
    const response = await GET(createGetRequest());

    expect(response.status).toBe(400);
  });

  it('year が範囲外だと400を返す', async () => {
    const response = await GET(createGetRequest({ year: '1999' }));

    expect(response.status).toBe(400);
  });

  it('cursor が負数だと400を返す', async () => {
    const response = await GET(
      createGetRequest({ year: '2024', cursor: '-1' }),
    );

    expect(response.status).toBe(400);
  });

  it('未認証なら401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(createGetRequest({ year: '2024' }));

    expect(response.status).toBe(401);
  });

  it('レート制限を超えたら429を返す', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

    const response = await GET(createGetRequest({ year: '2024' }));

    expect(response.status).toBe(429);
  });

  it('クエリが失敗したら500を返す', async () => {
    mockWatchedQuery(null, null, { message: 'boom' });

    const response = await GET(createGetRequest({ year: '2024' }));

    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx jest src/app/api/watchlist/watched/route.test.ts`
Expected: FAIL（`./route` が存在しない）

- [ ] **Step 3: 実装する**

`src/app/api/watchlist/watched/route.ts` を作る。

```ts
/**
 * 指定年の視聴済み一覧API
 * GET /api/watchlist/watched - 追加年を指定して視聴済みを取得（一括削除の確認用）
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  ERROR_CODE,
  WATCHLIST_SELECT,
  WATCHLIST_ERROR_MESSAGES,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { withAuth } from '@/helpers/routeHandler';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { watchlistWatchedQuerySchema } from '@/schema/watchlist';
import { getJstYearRange } from '@/utils/date';

export const GET = withAuth(
  async ({ session, supabase, request }) => {
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.READ_USER_DATA,
      RATE_LIMIT_CONFIG.READ_USER_DATA.maxAttempts,
      RATE_LIMIT_CONFIG.READ_USER_DATA.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    const { searchParams } = new URL(request.url);
    const queryResult = watchlistWatchedQuerySchema.safeParse({
      year: searchParams.get('year') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!queryResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: WATCHLIST_ERROR_MESSAGES.INVALID_QUERY,
            details: queryResult.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 一覧ページ（get_watchlist_sorted）と同じオフセットページング。
    // cursor の数値化と負数チェックはスキーマ側に寄せている
    const { year, cursor: offset, limit } = queryResult.data;

    // 年の境界は JST。UTC のまま切ると 1/1 早朝に追加した行が前年に落ちる
    const { start, end } = getJstYearRange(year);

    // withAuth は service role クライアントを使うため RLS は効かない。
    // 他ユーザーの行を守るのは user_id 条件だけなので必ず付ける
    const { data, count, error } = await supabase
      .from('watchlist')
      .select(WATCHLIST_SELECT, { count: 'exact' })
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .not('watched_at', 'is', null)
      .gte('added_at', start)
      .lt('added_at', end)
      .order('added_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    const totalCount = count ?? 0;
    const hasMore = offset + limit < totalCount;

    return NextResponse.json(
      {
        success: true,
        data: {
          watchlist: data ?? [],
          next_cursor: hasMore ? String(offset + limit) : null,
          has_more: hasMore,
        },
      },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Watchlist watched fetch error',
    errorMessage: WATCHLIST_ERROR_MESSAGES.FETCH_FAILED,
  },
);
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `npx jest src/app/api/watchlist/watched/route.test.ts`
Expected: PASS（12件）

- [ ] **Step 5: コミット**

```bash
git add src/app/api/watchlist/watched/
git commit -m "feat(watchlist): 追加年を指定した視聴済み一覧APIを追加"
```

---

### Task 6: `POST /api/watchlist/bulk-delete`

**Files:**

- Create: `src/app/api/watchlist/bulk-delete/route.ts`
- Test: `src/app/api/watchlist/bulk-delete/route.test.ts`

**Interfaces:**

- Consumes: `getJstYearRange`（Task 1）、`watchlistBulkDeleteSchema`（Task 2）
- Produces: `POST /api/watchlist/bulk-delete` →
  `{ success: true, message: string, data: { deleted_count: number } }`

- [ ] **Step 1: 失敗するテストを書く**

`src/app/api/watchlist/bulk-delete/route.test.ts` を作る。

```ts
/**
 * @jest-environment node
 */

/**
 * 視聴済み一括削除API Route テスト (POST)
 */

import { POST } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

jest.mock('@/helpers/auth', () => ({
  getAuthSession: jest.fn().mockResolvedValue({ user: { id: 'user-123' } }),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
}));

import { getAuthSession } from '@/helpers/auth';

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// --- Helpers ---

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

const createPostRequest = (body: unknown) =>
  new Request('http://localhost/api/watchlist/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** update / eq / is / not / gte / lt / select に渡された引数を記録する */
const calls: Record<string, unknown[][]> = {};

const mockBulkDelete = (
  data: Array<{ id: string }> | null,
  error: unknown = null,
) => {
  for (const key of Object.keys(calls)) delete calls[key];

  const record = (name: string) => {
    return (...args: unknown[]) => {
      calls[name] = [...(calls[name] ?? []), args];
      return chain;
    };
  };

  const chain: Record<string, unknown> = {
    eq: record('eq'),
    is: record('is'),
    not: record('not'),
    gte: record('gte'),
    lt: record('lt'),
    select: (...args: unknown[]) => {
      calls.select = [...(calls.select ?? []), args];
      return Promise.resolve({ data, error });
    },
  };

  mockFrom.mockReturnValueOnce({
    update: (...args: unknown[]) => {
      calls.update = [...(calls.update ?? []), args];
      return chain;
    },
  });
};

// --- Tests ---

describe('POST /api/watchlist/bulk-delete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('削除した件数を返す', async () => {
    mockBulkDelete([{ id: UUID_A }, { id: UUID_B }]);

    const response = await POST(createPostRequest({ year: 2024 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.deleted_count).toBe(2);
  });

  it('論理削除（deleted_at）で消す', async () => {
    mockBulkDelete([]);

    await POST(createPostRequest({ year: 2024 }));

    const updatePayload = calls.update?.[0]?.[0] as { deleted_at: string };
    expect(updatePayload.deleted_at).toEqual(expect.any(String));
  });

  it('自分のユーザーIDで絞り込む（他ユーザーの行を消さない）', async () => {
    mockBulkDelete([]);

    await POST(createPostRequest({ year: 2024 }));

    expect(calls.eq).toContainEqual(['user_id', 'user-123']);
  });

  it('視聴済み・未削除のみを対象にする', async () => {
    mockBulkDelete([]);

    await POST(createPostRequest({ year: 2024 }));

    expect(calls.is).toContainEqual(['deleted_at', null]);
    expect(calls.not).toContainEqual(['watched_at', 'is', null]);
  });

  it('JSTの年範囲で絞り込む（UTCの前年を取りこぼさない）', async () => {
    mockBulkDelete([]);

    await POST(createPostRequest({ year: 2025 }));

    expect(calls.gte).toContainEqual(['added_at', '2025-01-01T00:00:00+09:00']);
    expect(calls.lt).toContainEqual(['added_at', '2026-01-01T00:00:00+09:00']);
  });

  it('exclude_ids を除外条件に渡す', async () => {
    mockBulkDelete([]);

    await POST(
      createPostRequest({ year: 2024, exclude_ids: [UUID_A, UUID_B] }),
    );

    expect(calls.not).toContainEqual(['id', 'in', `(${UUID_A},${UUID_B})`]);
  });

  it('exclude_ids が空なら除外条件を付けない', async () => {
    mockBulkDelete([]);

    await POST(createPostRequest({ year: 2024, exclude_ids: [] }));

    // watched_at の1回だけで、id の除外は無い
    expect(calls.not).toEqual([['watched_at', 'is', null]]);
  });

  it('year が無いと400を返す', async () => {
    const response = await POST(createPostRequest({}));

    expect(response.status).toBe(400);
  });

  it('year が範囲外だと400を返す', async () => {
    const response = await POST(createPostRequest({ year: 1999 }));

    expect(response.status).toBe(400);
  });

  it('exclude_ids にUUIDでない値があると400を返す', async () => {
    const response = await POST(
      createPostRequest({ year: 2024, exclude_ids: ['not-a-uuid'] }),
    );

    expect(response.status).toBe(400);
  });

  it('exclude_ids が1001件だと400を返す', async () => {
    const ids = Array.from(
      { length: 1001 },
      (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    );

    const response = await POST(
      createPostRequest({ year: 2024, exclude_ids: ids }),
    );

    expect(response.status).toBe(400);
  });

  it('未認証なら401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await POST(createPostRequest({ year: 2024 }));

    expect(response.status).toBe(401);
  });

  it('レート制限を超えたら429を返す', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

    const response = await POST(createPostRequest({ year: 2024 }));

    expect(response.status).toBe(429);
  });

  it('更新が失敗したら500を返す', async () => {
    mockBulkDelete(null, { message: 'boom' });

    const response = await POST(createPostRequest({ year: 2024 }));

    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx jest src/app/api/watchlist/bulk-delete/route.test.ts`
Expected: FAIL（`./route` が存在しない）

- [ ] **Step 3: 実装する**

`src/app/api/watchlist/bulk-delete/route.ts` を作る。

```ts
/**
 * 視聴済み一括削除API
 * POST /api/watchlist/bulk-delete - 追加年を指定して視聴済みをまとめて論理削除
 *
 * DELETE ではなく POST にしているのは、ボディ付き DELETE が fetch やプロキシで
 * 扱いが揺れるため。
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  WATCHLIST_ERROR_MESSAGES,
  WATCHLIST_SUCCESS_MESSAGES,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { parseAndValidate } from '@/helpers/requestValidation';
import { withAuth } from '@/helpers/routeHandler';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { watchlistBulkDeleteSchema } from '@/schema/watchlist';
import { getJstYearRange } from '@/utils/date';

export const POST = withAuth(
  async ({ session, supabase, request }) => {
    // 1リクエストで多数の行を更新するが、レート制限は他の書き込みと同じ枠を共有する
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.WRITE_WATCHLIST,
      RATE_LIMIT_CONFIG.WRITE_WATCHLIST.maxAttempts,
      RATE_LIMIT_CONFIG.WRITE_WATCHLIST.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    const parsed = await parseAndValidate(
      request,
      watchlistBulkDeleteSchema,
      WATCHLIST_ERROR_MESSAGES.INVALID_BODY,
    );
    if (parsed.error) return parsed.error;

    const { year, exclude_ids } = parsed.data;

    // 年の境界は JST。UTC のまま切ると 1/1 早朝に追加した行が前年に落ちる
    const { start, end } = getJstYearRange(year);

    // withAuth は service role クライアントを使うため RLS は効かない。
    // 他ユーザーの行を守るのは user_id 条件だけ。一括更新では特に落とさないこと
    let query = supabase
      .from('watchlist')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .not('watched_at', 'is', null)
      .gte('added_at', start)
      .lt('added_at', end);

    // 空配列で not('id', 'in', '()') を組むと構文エラーになるため、
    // 除外が無いときは条件自体を付けない。
    //
    // join で PostgREST のフィルタ構文を組み立てている。ここが安全なのは
    // watchlistBulkDeleteSchema が各要素を UUID に限定しているからで、
    // スキーマ側の検証を緩めるとそのままクエリ構文への注入経路になる。
    // exclude_ids の型を変えるときは必ずこの行も見直すこと。
    if (exclude_ids.length > 0) {
      query = query.not('id', 'in', `(${exclude_ids.join(',')})`);
    }

    const { data, error } = await query.select('id');

    if (error) {
      throw error;
    }

    const deletedCount = data?.length ?? 0;

    return NextResponse.json(
      {
        success: true,
        message: WATCHLIST_SUCCESS_MESSAGES.bulkDeleted(deletedCount),
        data: { deleted_count: deletedCount },
      },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Watchlist bulk delete error',
    errorMessage: WATCHLIST_ERROR_MESSAGES.BULK_DELETE_FAILED,
  },
);
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `npx jest src/app/api/watchlist/bulk-delete/route.test.ts`
Expected: PASS（14件）

- [ ] **Step 5: コミット**

```bash
git add src/app/api/watchlist/bulk-delete/
git commit -m "feat(watchlist): 追加年を指定した視聴済み一括削除APIを追加"
```

---

### Task 7: API クライアントとクエリキー

**Files:**

- Modify: `src/lib/api/watchlist/watchlist.ts`（末尾に追記）
- Modify: `src/constants/queryKeys.ts:23-27`（`watchlistKeys` に追記）
- Test: `src/lib/api/watchlist/watchlist.test.ts`（末尾に追記）

**Interfaces:**

- Consumes: Task 2 の `API_ENDPOINTS`、Task 4〜6 のエンドポイント
- Produces:
  - `getWatchlistWatchedYears(): Promise<GetWatchlistWatchedYearsResponse>`
  - `getWatchlistWatched(params: GetWatchlistWatchedRequest): Promise<GetWatchlistResponse>`
  - `bulkDeleteWatchlist(data: WatchlistBulkDeleteFormData): Promise<BulkDeleteWatchlistResponse>`
  - 型 `WatchlistWatchedYear = { year: number; count: number }`
  - `watchlistKeys.watchedYears()` / `watchlistKeys.watched(year)`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/api/watchlist/watchlist.test.ts` の末尾に追記する。既存のモック構成（`axiosInstance` のモック）に合わせること。既存ファイルの先頭を読んでから書く。

```ts
describe('getWatchlistWatchedYears', () => {
  it('追加年一覧を取得する', async () => {
    const mockResponse = {
      success: true,
      data: { years: [{ year: 2024, count: 12 }] },
    };
    (axiosInstance.get as jest.Mock).mockResolvedValue({ data: mockResponse });

    const result = await getWatchlistWatchedYears();

    expect(axiosInstance.get).toHaveBeenCalledWith(
      '/api/watchlist/watched-years',
    );
    expect(result).toEqual(mockResponse);
  });
});

describe('getWatchlistWatched', () => {
  it('年とページングパラメータを渡す', async () => {
    const mockResponse = {
      success: true,
      data: { watchlist: [], next_cursor: null, has_more: false },
    };
    (axiosInstance.get as jest.Mock).mockResolvedValue({ data: mockResponse });

    const result = await getWatchlistWatched({ year: 2024, cursor: '20' });

    expect(axiosInstance.get).toHaveBeenCalledWith('/api/watchlist/watched', {
      params: { year: 2024, cursor: '20' },
    });
    expect(result).toEqual(mockResponse);
  });
});

describe('bulkDeleteWatchlist', () => {
  it('年と除外IDをPOSTする', async () => {
    const mockResponse = {
      success: true,
      message: '10件を削除しました',
      data: { deleted_count: 10 },
    };
    (axiosInstance.post as jest.Mock).mockResolvedValue({ data: mockResponse });

    const result = await bulkDeleteWatchlist({
      year: 2024,
      exclude_ids: ['11111111-1111-4111-8111-111111111111'],
    });

    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/api/watchlist/bulk-delete',
      {
        year: 2024,
        exclude_ids: ['11111111-1111-4111-8111-111111111111'],
      },
    );
    expect(result).toEqual(mockResponse);
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx jest src/lib/api/watchlist/watchlist.test.ts`
Expected: FAIL（`getWatchlistWatchedYears` が未定義）

- [ ] **Step 3: API クライアントを実装する**

`src/lib/api/watchlist/watchlist.ts` の末尾に追記する。import に `WatchlistBulkDeleteFormData` を足すこと。

```ts
/**
 * 視聴済みがある追加年の型
 */
export interface WatchlistWatchedYear {
  /** 追加年（JST） */
  year: number;
  /** その年の視聴済み件数 */
  count: number;
}

/**
 * 追加年一覧取得レスポンスの型
 */
export interface GetWatchlistWatchedYearsResponse {
  success: true;
  data: {
    years: WatchlistWatchedYear[];
  };
}

/**
 * 指定年の視聴済み一覧取得リクエストの型
 */
export interface GetWatchlistWatchedRequest {
  /** 追加年（JST） */
  year: number;
  /** ページングカーソル（オフセット） */
  cursor?: string;
  /** 1ページあたりの取得件数 */
  limit?: number;
}

/**
 * 一括削除レスポンスの型
 */
export interface BulkDeleteWatchlistResponse {
  success: true;
  message: string;
  data: {
    deleted_count: number;
  };
}

/**
 * 視聴済みがある追加年の一覧を取得
 *
 * @returns 追加年と件数の一覧（降順）
 */
export async function getWatchlistWatchedYears(): Promise<GetWatchlistWatchedYearsResponse> {
  const response = await axiosInstance.get<GetWatchlistWatchedYearsResponse>(
    API_ENDPOINTS.WATCHLIST_WATCHED_YEARS,
  );
  return response.data;
}

/**
 * 指定した追加年の視聴済み一覧を取得
 *
 * @param params - 年とページングパラメータ
 * @returns ウォッチリスト一覧レスポンス（一覧APIと同じ形）
 */
export async function getWatchlistWatched(
  params: GetWatchlistWatchedRequest,
): Promise<GetWatchlistResponse> {
  const response = await axiosInstance.get<GetWatchlistResponse>(
    API_ENDPOINTS.WATCHLIST_WATCHED,
    { params },
  );
  return response.data;
}

/**
 * 指定した追加年の視聴済みをまとめて削除
 *
 * @param data - 年と除外ID（除外IDが空ならその年の視聴済み全件）
 * @returns 削除件数を含むレスポンス
 */
export async function bulkDeleteWatchlist(
  data: WatchlistBulkDeleteFormData,
): Promise<BulkDeleteWatchlistResponse> {
  const response = await axiosInstance.post<BulkDeleteWatchlistResponse>(
    API_ENDPOINTS.WATCHLIST_BULK_DELETE,
    data,
  );
  return response.data;
}
```

- [ ] **Step 4: クエリキーを追加する**

`src/constants/queryKeys.ts` の `watchlistKeys` を次の形にする。

```ts
export const watchlistKeys = {
  all: ['watchlist'] as const,
  list: (params?: { sort?: string; excludeWatched?: boolean }) =>
    ['watchlist', 'list', params] as const,
  /** 視聴済みがある追加年の一覧 */
  watchedYears: () => ['watchlist', 'watchedYears'] as const,
  /**
   * 指定年の視聴済み一覧
   *
   * 年が未選択（null）の状態でもキーは組まれる（クエリ自体は enabled で止める）。
   * 架空の年 0 に丸めるとキャッシュの意味がずれるため、null のまま持つ。
   */
  watched: (year: number | null) => ['watchlist', 'watched', year] as const,
};
```

`all` が `['watchlist']` なので、既存の `invalidateQueries({ queryKey: watchlistKeys.all })` は
新しいキーも巻き込んで無効化する。意図どおり（視聴済みを付け外ししたら年一覧の件数も変わる）。

- [ ] **Step 5: テストを実行して通ることを確認**

Run: `npx jest src/lib/api/watchlist/watchlist.test.ts`
Expected: PASS（既存分を含めて全件）

- [ ] **Step 6: コミット**

```bash
git add src/lib/api/watchlist/watchlist.ts src/lib/api/watchlist/watchlist.test.ts src/constants/queryKeys.ts
git commit -m "feat(watchlist): 一括削除のAPIクライアントとクエリキーを追加"
```

---

### Task 8: `useWatchlistCleanup` フック

**Files:**

- Create: `src/features/watchlist/hooks/useWatchlistCleanup.ts`
- Test: `src/features/watchlist/hooks/useWatchlistCleanup.test.ts`

**Interfaces:**

- Consumes: Task 7 の API クライアントとクエリキー、`WATCHLIST_ERROR_MESSAGES` / `WATCHLIST_SUCCESS_MESSAGES`（Task 2）
- Produces:

```ts
interface UseWatchlistCleanupOptions {
  /** モーダルが開いているか。閉じている間はクエリを発行しない */
  enabled: boolean;
  /** 削除が成功したときに呼ばれる（モーダルを閉じる用途） */
  onDeleted: () => void;
}

interface UseWatchlistCleanupReturn {
  years: WatchlistWatchedYear[];
  isYearsLoading: boolean;
  selectedYear: number | null;
  handleYearChange: (value: string) => void;
  items: WatchlistItem[];
  isItemsLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  /** 選択中の件数（= その年の件数 - 除外数） */
  selectedCount: number;
  /** その年の総件数 */
  totalCount: number;
  isSelected: (id: string) => boolean;
  toggleItem: (id: string) => void;
  isAllSelected: boolean;
  toggleAll: () => void;
  handleDelete: () => void;
  isDeleting: boolean;
}
```

`selectedCount` は `totalCount - excludeIds.size` で求める。読み込み済みの件数ではなく**その年の総件数**から引くのが肝で、未スクロール分も削除対象に含まれることと一致する。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/watchlist/hooks/useWatchlistCleanup.test.ts` を作る。既存の `useWatchlistPage.test.ts` の QueryClient ラッパーの作り方を先に読んで合わせること。

```ts
/**
 * useWatchlistCleanup フックのテスト
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useWatchlistCleanup } from './useWatchlistCleanup';

jest.mock('@/lib/api/watchlist/watchlist', () => ({
  getWatchlistWatchedYears: jest.fn(),
  getWatchlistWatched: jest.fn(),
  bulkDeleteWatchlist: jest.fn(),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

import {
  getWatchlistWatchedYears,
  getWatchlistWatched,
  bulkDeleteWatchlist,
} from '@/lib/api/watchlist/watchlist';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

const mockItem = (id: string, title: string) => ({
  id,
  tmdb_movie_id: 1,
  title,
  poster_path: null,
  release_date: null,
  added_at: '2024-03-01T00:00:00Z',
  watched_at: '2024-04-01T00:00:00Z',
});

describe('useWatchlistCleanup', () => {
  const onDeleted = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (getWatchlistWatchedYears as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        years: [
          { year: 2025, count: 3 },
          { year: 2024, count: 12 },
        ],
      },
    });
    (getWatchlistWatched as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        watchlist: [mockItem(UUID_A, '映画A'), mockItem(UUID_B, '映画B')],
        next_cursor: null,
        has_more: false,
      },
    });
    (bulkDeleteWatchlist as jest.Mock).mockResolvedValue({
      success: true,
      message: '12件を削除しました',
      data: { deleted_count: 12 },
    });
  });

  it('年一覧を取得し最新年を初期選択する', async () => {
    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.selectedYear).toBe(2025));
    expect(result.current.years).toHaveLength(2);
  });

  it('enabled が false ならクエリを発行しない', () => {
    renderHook(() => useWatchlistCleanup({ enabled: false, onDeleted }), {
      wrapper: createWrapper(),
    });

    expect(getWatchlistWatchedYears).not.toHaveBeenCalled();
  });

  it('初期状態は全選択で、選択件数はその年の総件数と一致する', async () => {
    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.selectedYear).toBe(2025));

    expect(result.current.isAllSelected).toBe(true);
    expect(result.current.selectedCount).toBe(3);
  });

  it('チェックを外すと選択件数が減る', async () => {
    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(2));

    act(() => result.current.toggleItem(UUID_A));

    expect(result.current.isSelected(UUID_A)).toBe(false);
    expect(result.current.selectedCount).toBe(2);
    expect(result.current.isAllSelected).toBe(false);
  });

  it('年を切り替えると除外選択がリセットされる', async () => {
    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    act(() => result.current.toggleItem(UUID_A));
    expect(result.current.isSelected(UUID_A)).toBe(false);

    act(() => result.current.handleYearChange('2024'));

    await waitFor(() => expect(result.current.selectedYear).toBe(2024));
    expect(result.current.isSelected(UUID_A)).toBe(true);
    expect(result.current.selectedCount).toBe(12);
  });

  it('除外したIDを付けて削除APIを呼ぶ', async () => {
    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    act(() => result.current.toggleItem(UUID_A));
    act(() => result.current.handleDelete());

    await waitFor(() =>
      expect(bulkDeleteWatchlist).toHaveBeenCalledWith({
        year: 2025,
        exclude_ids: [UUID_A],
      }),
    );
  });

  it('削除に成功したらトーストを出して onDeleted を呼ぶ', async () => {
    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.selectedYear).toBe(2025));
    act(() => result.current.handleDelete());

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ description: '12件を削除しました' }),
    );
  });

  it('削除に失敗したらエラートーストを出し onDeleted を呼ばない', async () => {
    (bulkDeleteWatchlist as jest.Mock).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.selectedYear).toBe(2025));
    act(() => result.current.handleDelete());

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      ),
    );
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('すべて選択を押すと除外がリセットされる', async () => {
    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    act(() => result.current.toggleItem(UUID_A));
    expect(result.current.selectedCount).toBe(2);

    act(() => result.current.toggleAll());

    expect(result.current.selectedCount).toBe(3);
    expect(result.current.isAllSelected).toBe(true);
  });

  it('視聴済みが1件も無いとき selectedYear は null のまま', async () => {
    (getWatchlistWatchedYears as jest.Mock).mockResolvedValue({
      success: true,
      data: { years: [] },
    });

    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isYearsLoading).toBe(false));
    expect(result.current.selectedYear).toBeNull();
    expect(result.current.years).toEqual([]);
  });
});
```

テストファイルに JSX を書くため、拡張子は `.test.tsx` にする（`createWrapper` が JSX を返すため）。
ファイル名: `useWatchlistCleanup.test.tsx`

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx jest src/features/watchlist/hooks/useWatchlistCleanup.test.tsx`
Expected: FAIL（`./useWatchlistCleanup` が存在しない）

- [ ] **Step 3: 実装する**

`src/features/watchlist/hooks/useWatchlistCleanup.ts` を作る。

```ts
/**
 * 視聴済み一括削除 カスタムフック
 *
 * 年セレクトの選択肢・対象一覧（無限スクロール）・除外選択・削除をまとめる。
 *
 * 「すべて選択」は画面に出ている分ではなく、その年の視聴済み全件を意味する。
 * そのため選択件数は読み込み済み件数ではなく、サーバーが返す総件数から
 * 除外数を引いて求める。未スクロール分も削除対象に含まれることと一致させるため。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  watchlistKeys,
  WATCHLIST_DEFAULT_LIMIT,
  WATCHLIST_ERROR_MESSAGES,
} from '@/constants';
import { useToast } from '@/hooks/useToast';
import {
  bulkDeleteWatchlist,
  getWatchlistWatched,
  getWatchlistWatchedYears,
} from '@/lib/api/watchlist/watchlist';
import type {
  WatchlistItem,
  WatchlistWatchedYear,
} from '@/lib/api/watchlist/watchlist';

/**
 * useWatchlistCleanupフックのオプション
 */
export interface UseWatchlistCleanupOptions {
  /** モーダルが開いているか。閉じている間はクエリを発行しない */
  enabled: boolean;
  /** 削除が成功したときに呼ばれる */
  onDeleted: () => void;
}

/**
 * useWatchlistCleanupフックの返り値
 */
export interface UseWatchlistCleanupReturn {
  /** 視聴済みがある追加年の一覧 */
  years: WatchlistWatchedYear[];
  /** 年一覧の読み込み中 */
  isYearsLoading: boolean;
  /** 選択中の年 */
  selectedYear: number | null;
  /** 年の変更ハンドラー */
  handleYearChange: (value: string) => void;
  /** 読み込み済みの対象アイテム */
  items: WatchlistItem[];
  /** 対象一覧の初回読み込み中 */
  isItemsLoading: boolean;
  /** 次ページ読み込み中 */
  isFetchingNextPage: boolean;
  /** 次ページがあるか */
  hasNextPage: boolean;
  /** 次ページを読み込む */
  fetchNextPage: () => void;
  /** 削除対象の件数（その年の総件数 - 除外数） */
  selectedCount: number;
  /** その年の視聴済み総件数 */
  totalCount: number;
  /** 指定IDが削除対象か */
  isSelected: (id: string) => boolean;
  /** 指定IDの選択を切り替える */
  toggleItem: (id: string) => void;
  /** 全件が選択されているか */
  isAllSelected: boolean;
  /** 全選択・全解除を切り替える */
  toggleAll: () => void;
  /** 削除を実行する */
  handleDelete: () => void;
  /** 削除中 */
  isDeleting: boolean;
}

/**
 * 視聴済み一括削除 カスタムフック
 */
export function useWatchlistCleanup({
  enabled,
  onDeleted,
}: UseWatchlistCleanupOptions): UseWatchlistCleanupReturn {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [excludeIds, setExcludeIds] = useState<Set<string>>(new Set());

  // 年セレクトの選択肢
  const yearsQuery = useQuery({
    queryKey: watchlistKeys.watchedYears(),
    queryFn: getWatchlistWatchedYears,
    enabled,
  });

  const years = useMemo(
    () => yearsQuery.data?.data.years ?? [],
    [yearsQuery.data],
  );

  // 年一覧が届いたら最新年を初期選択する。
  // 選択済みの年が一覧から消えた場合（その年を消し切った直後など）も入れ直す
  useEffect(() => {
    if (years.length === 0) {
      setSelectedYear(null);
      return;
    }

    setSelectedYear((current) =>
      current !== null && years.some((entry) => entry.year === current)
        ? current
        : years[0].year,
    );
  }, [years]);

  // 対象一覧（無限スクロール）
  const itemsQuery = useInfiniteQuery({
    queryKey: watchlistKeys.watched(selectedYear),
    queryFn: ({ pageParam }) =>
      getWatchlistWatched({
        year: selectedYear as number,
        cursor: pageParam,
        limit: WATCHLIST_DEFAULT_LIMIT,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.data.has_more
        ? (lastPage.data.next_cursor ?? undefined)
        : undefined,
    enabled: enabled && selectedYear !== null,
  });

  const items = useMemo(
    () => itemsQuery.data?.pages.flatMap((page) => page.data.watchlist) ?? [],
    [itemsQuery.data],
  );

  // 総件数は年一覧の集計を使う。対象一覧のページングとは独立して正しい値が得られる
  const totalCount = useMemo(
    () => years.find((entry) => entry.year === selectedYear)?.count ?? 0,
    [years, selectedYear],
  );

  const selectedCount = Math.max(0, totalCount - excludeIds.size);
  const isAllSelected = totalCount > 0 && excludeIds.size === 0;

  const deleteMutation = useMutation({
    mutationFn: bulkDeleteWatchlist,
    onSuccess: (response) => {
      toast({
        title: '削除しました',
        description: response.message,
        variant: 'success',
      });
      // 一覧・サイドバー・年一覧すべてに効かせる
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
      setExcludeIds(new Set());
      onDeleted();
    },
    onError: () => {
      toast({
        title: 'エラー',
        description: WATCHLIST_ERROR_MESSAGES.BULK_DELETE_FAILED,
        variant: 'error',
      });
    },
  });

  const handleYearChange = useCallback((value: string) => {
    setSelectedYear(Number(value));
    // 別の年は別の対象なので、除外選択を持ち越さない
    setExcludeIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: string) => !excludeIds.has(id),
    [excludeIds],
  );

  const toggleItem = useCallback((id: string) => {
    setExcludeIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 「すべて選択」は全選択に戻す操作だけを持つ。
  //
  // 全解除を用意しない理由: 未読み込みの行を除外IDに積めないため、
  // 「その年の全件を除外した状態」をこの実装では正しく表せない。
  // 全部残したいユーザーはモーダルを閉じればよく、削除ボタンは要らない。
  // そのためチェックボックスは全選択時のみ無効（押せない）にする。
  const toggleAll = useCallback(() => {
    setExcludeIds(new Set());
  }, []);

  const handleDelete = useCallback(() => {
    if (selectedYear === null) return;

    deleteMutation.mutate({
      year: selectedYear,
      exclude_ids: Array.from(excludeIds),
    });
  }, [deleteMutation, selectedYear, excludeIds]);

  // itemsQuery 全体を依存に入れると毎レンダー参照が変わり useCallback が効かない。
  // react-query の fetchNextPage は参照が安定しているので、それだけを取り出す
  const { fetchNextPage: fetchNextPageRaw } = itemsQuery;

  const fetchNextPage = useCallback(() => {
    fetchNextPageRaw();
  }, [fetchNextPageRaw]);

  return useMemo(
    () => ({
      years,
      isYearsLoading: yearsQuery.isLoading,
      selectedYear,
      handleYearChange,
      items,
      isItemsLoading: itemsQuery.isLoading,
      isFetchingNextPage: itemsQuery.isFetchingNextPage,
      hasNextPage: itemsQuery.hasNextPage,
      fetchNextPage,
      selectedCount,
      totalCount,
      isSelected,
      toggleItem,
      isAllSelected,
      toggleAll,
      handleDelete,
      isDeleting: deleteMutation.isPending,
    }),
    [
      years,
      yearsQuery.isLoading,
      selectedYear,
      handleYearChange,
      items,
      itemsQuery.isLoading,
      itemsQuery.isFetchingNextPage,
      itemsQuery.hasNextPage,
      fetchNextPage,
      selectedCount,
      totalCount,
      isSelected,
      toggleItem,
      isAllSelected,
      toggleAll,
      handleDelete,
      deleteMutation.isPending,
    ],
  );
}
```

**設計上の注意（実装時に崩さないこと）:**

`selectedCount` は読み込み済み件数ではなく `totalCount - excludeIds.size` で求める。
`totalCount` は年一覧 RPC の集計値なので、無限スクロールの進み具合に左右されない。
これが「すべて選択 = その年の視聴済み全件」という仕様と一致する唯一の計算方法。

「すべて選択」チェックボックスに全解除を持たせないのは、未読み込みの行を
`excludeIds` に積めず「全件を除外した状態」を正しく表せないため。
全選択時は `disabled` にして押せなくする（Task 9 のモーダル側で指定）。

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `npx jest src/features/watchlist/hooks/useWatchlistCleanup.test.tsx`
Expected: PASS（10件）

- [ ] **Step 5: コミット**

```bash
git add src/features/watchlist/hooks/useWatchlistCleanup.ts src/features/watchlist/hooks/useWatchlistCleanup.test.tsx
git commit -m "feat(watchlist): 視聴済み一括削除のカスタムフックを追加"
```

---

### Task 9: `WatchlistCleanupModal` コンポーネント

**Files:**

- Create: `src/features/watchlist/component/watchlistCleanupModal/watchlistCleanupModal.tsx`
- Create: `src/features/watchlist/component/watchlistCleanupModal/watchlistCleanupModal.module.scss`
- Test: `src/features/watchlist/component/watchlistCleanupModal/watchlistCleanupModal.test.tsx`

**Interfaces:**

- Consumes: `useWatchlistCleanup`（Task 8）、`WATCHLIST_CLEANUP_LABELS`（Task 2）
- Produces:

```ts
interface WatchlistCleanupModalProps {
  /** モーダルの開閉状態 */
  open: boolean;
  /** 開閉状態の変更 */
  onOpenChange: (open: boolean) => void;
}
```

- [ ] **Step 1: 失敗するテストを書く**

`watchlistCleanupModal.test.tsx` を作る。既存の `watchlistList.test.tsx` のレンダリング方法を先に読んで合わせること。

```tsx
/**
 * WatchlistCleanupModal コンポーネントのテスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { WatchlistCleanupModal } from './watchlistCleanupModal';

const mockCleanup = {
  years: [
    { year: 2025, count: 3 },
    { year: 2024, count: 12 },
  ],
  isYearsLoading: false,
  selectedYear: 2025,
  handleYearChange: jest.fn(),
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      tmdb_movie_id: 1,
      title: '映画A',
      poster_path: null,
      release_date: '2024-03-15',
      added_at: '2025-03-01T00:00:00Z',
      watched_at: '2025-04-01T00:00:00Z',
    },
  ],
  isItemsLoading: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: jest.fn(),
  selectedCount: 3,
  totalCount: 3,
  isSelected: jest.fn().mockReturnValue(true),
  toggleItem: jest.fn(),
  isAllSelected: true,
  toggleAll: jest.fn(),
  handleDelete: jest.fn(),
  isDeleting: false,
};

jest.mock('@/features/watchlist/hooks/useWatchlistCleanup', () => ({
  useWatchlistCleanup: jest.fn(() => mockCleanup),
}));

import { useWatchlistCleanup } from '@/features/watchlist/hooks/useWatchlistCleanup';

describe('WatchlistCleanupModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useWatchlistCleanup as jest.Mock).mockReturnValue(mockCleanup);
  });

  it('対象作品のタイトルを表示する', () => {
    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    expect(screen.getByText('映画A')).toBeInTheDocument();
  });

  it('削除ボタンに件数が入る', () => {
    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: '3件を削除する' }),
    ).toBeInTheDocument();
  });

  it('削除ボタンを押すと handleDelete が呼ばれる', async () => {
    const user = userEvent.setup();
    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    await user.click(screen.getByRole('button', { name: '3件を削除する' }));

    expect(mockCleanup.handleDelete).toHaveBeenCalled();
  });

  it('作品のチェックを外すと toggleItem が呼ばれる', async () => {
    const user = userEvent.setup();
    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    await user.click(
      screen.getByRole('checkbox', { name: '映画Aを削除対象にする' }),
    );

    expect(mockCleanup.toggleItem).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('選択件数が0なら削除ボタンが無効になる', () => {
    (useWatchlistCleanup as jest.Mock).mockReturnValue({
      ...mockCleanup,
      selectedCount: 0,
    });

    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: '0件を削除する' }),
    ).toBeDisabled();
  });

  it('削除中は削除ボタンが無効になる', () => {
    (useWatchlistCleanup as jest.Mock).mockReturnValue({
      ...mockCleanup,
      isDeleting: true,
    });

    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: '3件を削除する' }),
    ).toBeDisabled();
  });

  it('視聴済みが無いときは空状態を出し、削除ボタンを出さない', () => {
    (useWatchlistCleanup as jest.Mock).mockReturnValue({
      ...mockCleanup,
      years: [],
      selectedYear: null,
      items: [],
      selectedCount: 0,
      totalCount: 0,
    });

    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    expect(
      screen.getByText('整理できる視聴済みの作品がありません'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /件を削除する/ }),
    ).not.toBeInTheDocument();
  });

  it('キャンセルで onOpenChange(false) が呼ばれる', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();
    render(<WatchlistCleanupModal open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('キーボードで作品のチェックを操作できる', async () => {
    const user = userEvent.setup();
    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    const checkbox = screen.getByRole('checkbox', {
      name: '映画Aを削除対象にする',
    });
    checkbox.focus();
    await user.keyboard(' ');

    expect(mockCleanup.toggleItem).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx jest src/features/watchlist/component/watchlistCleanupModal/`
Expected: FAIL（`./watchlistCleanupModal` が存在しない）

- [ ] **Step 3: 実装する**

`watchlistCleanupModal.tsx` を作る。

```tsx
/**
 * WatchlistCleanupModalコンポーネント
 * 追加年を指定して視聴済みをまとめて削除する確認モーダル
 */

'use client';

import { memo, useCallback, useMemo } from 'react';
import Image from 'next/image';

import { Button } from '@/components/ui/button/button';
import { Checkbox } from '@/components/ui/checkbox/checkbox';
import { Loading } from '@/components/ui/loading/loading';
import { Modal } from '@/components/ui/modal/modal';
import { Select } from '@/components/ui/select/select';
import { IMAGE_SIZES, WATCHLIST_CLEANUP_LABELS } from '@/constants';
import { useWatchlistCleanup } from '@/features/watchlist/hooks/useWatchlistCleanup';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import type { WatchlistItem } from '@/lib/api/watchlist/watchlist';
import { formatDate } from '@/utils/date';
import { getTMDbImageUrl } from '@/utils/image';

import styles from './watchlistCleanupModal.module.scss';

/**
 * WatchlistCleanupModalコンポーネントのプロパティ
 */
export interface WatchlistCleanupModalProps {
  /** モーダルの開閉状態 */
  open: boolean;
  /** 開閉状態の変更 */
  onOpenChange: (open: boolean) => void;
}

/**
 * WatchlistCleanupModalコンポーネント
 */
export const WatchlistCleanupModal = memo<WatchlistCleanupModalProps>(
  function WatchlistCleanupModal({ open, onOpenChange }) {
    const handleDeleted = useCallback(() => {
      onOpenChange(false);
    }, [onOpenChange]);

    const {
      years,
      isYearsLoading,
      selectedYear,
      handleYearChange,
      items,
      isItemsLoading,
      isFetchingNextPage,
      hasNextPage,
      fetchNextPage,
      selectedCount,
      isSelected,
      toggleItem,
      isAllSelected,
      toggleAll,
      handleDelete,
      isDeleting,
    } = useWatchlistCleanup({ enabled: open, onDeleted: handleDeleted });

    const yearOptions = useMemo(
      () =>
        years.map((entry) => ({
          label: WATCHLIST_CLEANUP_LABELS.yearOption(entry.year, entry.count),
          value: String(entry.year),
        })),
      [years],
    );

    const handleCancel = useCallback(() => {
      onOpenChange(false);
    }, [onOpenChange]);

    const sentinelRef = useIntersectionObserver(fetchNextPage, {
      enabled: hasNextPage && !isFetchingNextPage,
      rootMargin: '100px',
    });

    const hasYears = years.length > 0;

    return (
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={WATCHLIST_CLEANUP_LABELS.MODAL_TITLE}
        size='lg'
      >
        {isYearsLoading ? (
          <div className={styles.c_watchlist_cleanup__loading}>
            <Loading size='sm' />
          </div>
        ) : !hasYears ? (
          <p className={styles.c_watchlist_cleanup__empty}>
            {WATCHLIST_CLEANUP_LABELS.EMPTY}
          </p>
        ) : (
          <div className={styles.c_watchlist_cleanup}>
            <div className={styles.c_watchlist_cleanup__header}>
              <Select
                options={yearOptions}
                value={selectedYear === null ? undefined : String(selectedYear)}
                onValueChange={handleYearChange}
                aria-label={WATCHLIST_CLEANUP_LABELS.YEAR_LABEL}
                disabled={isDeleting}
              />
              <div className={styles.c_watchlist_cleanup__select_all}>
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={toggleAll}
                  disabled={isAllSelected || isDeleting}
                  label={WATCHLIST_CLEANUP_LABELS.SELECT_ALL}
                />
                <span className={styles.c_watchlist_cleanup__count}>
                  {WATCHLIST_CLEANUP_LABELS.selectedCount(selectedCount)}
                </span>
              </div>
            </div>

            {isItemsLoading ? (
              <div className={styles.c_watchlist_cleanup__loading}>
                <Loading size='sm' />
              </div>
            ) : (
              <ul className={styles.c_watchlist_cleanup__list}>
                {items.map((item) => (
                  <CleanupRow
                    key={item.id}
                    item={item}
                    checked={isSelected(item.id)}
                    disabled={isDeleting}
                    onToggle={toggleItem}
                  />
                ))}
              </ul>
            )}

            {hasNextPage && (
              <div
                ref={sentinelRef}
                className={styles.c_watchlist_cleanup__sentinel}
              />
            )}

            {isFetchingNextPage && (
              <div className={styles.c_watchlist_cleanup__loading}>
                <Loading size='sm' />
              </div>
            )}

            <div className={styles.c_watchlist_cleanup__footer}>
              <Button
                variant='ghost'
                onClick={handleCancel}
                disabled={isDeleting}
              >
                {WATCHLIST_CLEANUP_LABELS.CANCEL}
              </Button>
              <Button
                variant='danger'
                onClick={handleDelete}
                disabled={selectedCount === 0 || isDeleting}
              >
                {WATCHLIST_CLEANUP_LABELS.deleteButton(selectedCount)}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    );
  },
);

WatchlistCleanupModal.displayName = 'WatchlistCleanupModal';

/**
 * CleanupRowコンポーネントのプロパティ
 */
interface CleanupRowProps {
  /** 対象アイテム */
  item: WatchlistItem;
  /** 削除対象として選択されているか */
  checked: boolean;
  /** 操作不可か */
  disabled: boolean;
  /** 選択の切り替え */
  onToggle: (id: string) => void;
}

/**
 * CleanupRowコンポーネント
 * 削除対象1件の行（チェックボックス + ポスター + タイトル + 追加日）
 */
const CleanupRow = memo<CleanupRowProps>(function CleanupRow({
  item,
  checked,
  disabled,
  onToggle,
}) {
  const handleToggle = useCallback(() => {
    onToggle(item.id);
  }, [onToggle, item.id]);

  const posterUrl = getTMDbImageUrl(item.poster_path, 'w92');

  return (
    <li className={styles.c_watchlist_cleanup__row}>
      <Checkbox
        checked={checked}
        onCheckedChange={handleToggle}
        disabled={disabled}
        aria-label={`${item.title}を削除対象にする`}
      />
      {posterUrl ? (
        <Image
          className={styles.c_watchlist_cleanup__poster}
          src={posterUrl}
          alt=''
          width={IMAGE_SIZES.THUMBNAIL.WIDTH}
          height={IMAGE_SIZES.THUMBNAIL.HEIGHT}
        />
      ) : (
        <div
          className={styles.c_watchlist_cleanup__poster_fallback}
          aria-hidden='true'
        >
          🎬
        </div>
      )}
      <span className={styles.c_watchlist_cleanup__title}>{item.title}</span>
      <span className={styles.c_watchlist_cleanup__date}>
        {formatDate(item.added_at)}
      </span>
    </li>
  );
});

CleanupRow.displayName = 'CleanupRow';
```

ポスターの `alt` を空文字にしているのは、同じ行にタイトルのテキストがあり、
読み上げが二重になるのを避けるため（装飾的な画像として扱う）。

- [ ] **Step 4: SCSS を書く**

`watchlistCleanupModal.module.scss` を作る。
ポスターのサイズ（36x54px）は既存の `watchlistItem.module.scss` に合わせている。

```scss
@use '@/styles/variables' as *;

.c_watchlist_cleanup {
  display: flex;
  flex-direction: column;
  gap: $spacing-4;

  &__header {
    display: flex;
    flex-direction: column;
    gap: $spacing-3;
  }

  &__select_all {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-3;
    padding-bottom: $spacing-2;
    border-bottom: $border-width-1 solid $border-color;
  }

  &__count {
    color: $text-secondary;
    font-size: $font-size-sm;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: $spacing-2;
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 50vh;
    overflow-y: auto;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: $spacing-3;
    padding: $spacing-2;
    border-radius: $border-radius-md;
  }

  &__poster {
    width: 36px;
    height: 54px;
    border-radius: $border-radius-sm;
    object-fit: cover;
    flex-shrink: 0;
  }

  &__poster_fallback {
    width: 36px;
    height: 54px;
    border-radius: $border-radius-sm;
    background-color: $background-secondary;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: $text-disabled;
    font-size: $font-size-2xs;
  }

  &__title {
    flex: 1;
    min-width: 0;
    color: $text-primary;
    font-size: $font-size-sm;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  &__date {
    flex-shrink: 0;
    color: $text-secondary;
    font-size: $font-size-xs;
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: $spacing-2;
    padding-top: $spacing-2;
    border-top: $border-width-1 solid $border-color;
  }

  &__empty {
    padding: $spacing-6 0;
    color: $text-secondary;
    font-size: $font-size-sm;
    text-align: center;
  }

  &__loading {
    display: flex;
    justify-content: center;
    padding: $spacing-4 0;
  }

  &__sentinel {
    height: 1px;
  }
}
```

使っている変数はすべて `src/styles/_variables.scss` に定義済み
（`$spacing-*` / `$border-width-1` / `$border-radius-*` / `$border-color` /
`$text-primary` / `$text-secondary` / `$text-disabled` / `$background-secondary` /
`$font-size-2xs` / `$font-size-xs` / `$font-size-sm`）。値を直書きしないこと。

- [ ] **Step 5: テストを実行して通ることを確認**

Run: `npx jest src/features/watchlist/component/watchlistCleanupModal/`
Expected: PASS（9件）

- [ ] **Step 6: コミット**

```bash
git add src/features/watchlist/component/watchlistCleanupModal/
git commit -m "feat(watchlist): 視聴済み一括削除の確認モーダルを追加"
```

---

### Task 10: ツールバーへの結線

**Files:**

- Modify: `src/features/watchlist/watchlistPage/watchlistPage.tsx:103-116`（ツールバー）
- Modify: `src/features/watchlist/watchlistPage/watchlistPage.module.scss`
- Test: `src/features/watchlist/watchlistPage/watchlistPage.test.tsx`（追記）

**Interfaces:**

- Consumes: `WatchlistCleanupModal`（Task 9）、`WATCHLIST_CLEANUP_LABELS.OPEN_BUTTON`（Task 2）
- Produces: なし（最終的な結線）

- [ ] **Step 1: 失敗するテストを書く**

`watchlistPage.test.tsx` に追記する。既存のモック構成を先に読み、
`WatchlistCleanupModal` をモックしてボタンの開閉だけを検証する形にすること。

```tsx
jest.mock(
  '@/features/watchlist/component/watchlistCleanupModal/watchlistCleanupModal',
  () => ({
    WatchlistCleanupModal: ({ open }: { open: boolean }) =>
      open ? <div data-testid='cleanup-modal' /> : null,
  }),
);
```

```tsx
describe('視聴済みの一括削除', () => {
  it('整理ボタンを表示する', () => {
    render(<WatchlistPage />);

    expect(
      screen.getByRole('button', { name: '視聴済みを整理' }),
    ).toBeInTheDocument();
  });

  it('整理ボタンを押すとモーダルが開く', async () => {
    const user = userEvent.setup();
    render(<WatchlistPage />);

    expect(screen.queryByTestId('cleanup-modal')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '視聴済みを整理' }));

    expect(screen.getByTestId('cleanup-modal')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx jest src/features/watchlist/watchlistPage/`
Expected: FAIL（`視聴済みを整理` ボタンが見つからない）

- [ ] **Step 3: 実装する**

`watchlistPage.tsx` を編集する。

import に追加:

```tsx
import { Button } from '@/components/ui/button/button';
import { WatchlistCleanupModal } from '@/features/watchlist/component/watchlistCleanupModal/watchlistCleanupModal';
import { WATCHLIST_CLEANUP_LABELS } from '@/constants';
```

状態とハンドラーを追加（既存の `selectedMovieId` の近く）:

```tsx
const [isCleanupOpen, setIsCleanupOpen] = useState(false);

const handleCleanupOpen = useCallback(() => {
  setIsCleanupOpen(true);
}, []);
```

ツールバーの `__controls` を次の形にする:

```tsx
<div className={styles.c_watchlist_page__controls}>
  <Select
    options={SORT_OPTIONS}
    value={sortBy}
    onValueChange={handleSortChange}
    aria-label='ソート順を選択'
    className={styles.c_watchlist_page__sort}
  />
  <Button variant='secondary' size='sm' onClick={handleCleanupOpen}>
    {WATCHLIST_CLEANUP_LABELS.OPEN_BUTTON}
  </Button>
</div>
```

`FavoriteRatingModal` の下にモーダルを足す:

```tsx
<WatchlistCleanupModal open={isCleanupOpen} onOpenChange={setIsCleanupOpen} />
```

`setIsCleanupOpen` は `useState` のセッターなので参照が安定しており、
そのまま prop に渡してよい（`useCallback` でラップする必要はない）。

- [ ] **Step 4: SCSS は変更不要なことを確認する**

`.c_watchlist_page__controls` は既に `display: flex` + `gap: $spacing-2` のため
（`watchlistPage.module.scss:31-36`）、ボタンを足すだけで横並びになる。
崩れていなければ SCSS は触らない。

- [ ] **Step 5: テストを実行して通ることを確認**

Run: `npx jest src/features/watchlist/`
Expected: PASS（ページ・リスト・フック・モーダルすべて）

- [ ] **Step 6: コミット**

```bash
git add src/features/watchlist/watchlistPage/
git commit -m "feat(watchlist): ツールバーから視聴済み整理モーダルを開けるようにする"
```

---

### Task 11: 全体検証と PR

**Files:**

- Modify: `.claude/documents/roadmap.md`（該当タスクがあればチェックを付ける）

- [ ] **Step 1: 型チェックと Lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: どちらもエラーなし

- [ ] **Step 2: 全テストとカバレッジ**

```bash
npx jest --coverage
```

Expected: 全件 PASS、カバレッジが全指標 80% 以上。
80% を下回ったら、足りない観点のテストを足してから次へ進む。

- [ ] **Step 3: ローカルで動作確認**

worktree では `npm install` が必要。

```bash
npm install
npm run dev
```

ブラウザで `/watchlist` を開き、次を確認する。

1. ツールバーに `視聴済みを整理` が出る
2. 押すとモーダルが開き、年セレクトに `YYYY年（N件）` が並ぶ
3. 年を切り替えるとリストが差し替わり、チェックが全選択に戻る
4. チェックを外すと削除ボタンの件数が減る
5. 削除するとトーストが出てモーダルが閉じ、一覧から消える
6. **画面左下の Next.js Dev Tools バッジが赤くなっていないこと**（赤ならエラー内容を取得して原因を切り分ける）

- [ ] **Step 4: ビジュアル証跡を取る**

```bash
# Before は main で dev を起動して撮る
node scripts/pr-visual.mjs shot http://localhost:3000/watchlist docs/tmp/watchlist-cleanup-before.png
# After は本ブランチで
node scripts/pr-visual.mjs shot http://localhost:3000/watchlist docs/tmp/watchlist-cleanup-after.png
```

デモ動画は `.claude/rules/visual-evidence.md` に従う。
agent-browser の録画はモーダル（ポータル）を撮れないため、
スクリーンショットを並べて ffmpeg で繋ぐ方法を使う。

アップロードは `--repo` を明示する。

- [ ] **Step 5: ロードマップを更新する**

`.claude/documents/roadmap.md` に該当タスクがあれば `- [ ]` → `- [x]` にする。
無ければこの Step はスキップしてよい。

- [ ] **Step 6: Issue を作る**

CLAUDE.md の運用に従い、本機能の Issue を起票する（まだ無ければ）。
本文は「概要 / 影響範囲 / 対応方針 / 完了条件」の型に従う。
ラベルは `P2: nice-to-have` と `feature`。

- [ ] **Step 7: PR を作る**

`gh auth switch` と同じコマンドで実行すること（アカウントが戻る）。

```bash
gh pr create \
  --title "feat(watchlist): 追加年を指定して視聴済みをまとめて削除できるようにする" \
  --body "<本文>" \
  --assignee Fn-front
```

本文は CLAUDE.md の構成（概要 / ロードマップ / レビューポイント / テスト）に従い、
`Closes #<issue番号>` と Before/After・デモ動画を含める。

レビューポイントとして最低限これを挙げる:

- `withAuth` が service role を使うため RLS が効かず、`user_id` 条件だけが他ユーザーの行を守っていること
- 年の境界を JST で切っていること（UTC で切ると 1/1 早朝の行が前年に落ちる）
- 「すべて選択」が読み込み済みの行ではなく、その年の視聴済み全件を意味すること

- [ ] **Step 8: マージ承認を待つ**

**PR を作ったらここで停止する。** ユーザーの明示的な許可があるまで `gh pr merge` を実行しない。
