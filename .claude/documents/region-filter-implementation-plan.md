# 地域（原語）フィルタ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 映画タブ・配信タブの一覧で、韓国・中華圏・タイ/インドの作品を既定で非表示にし、検索条件で表示を切り替えられるようにする。

**Architecture:** `movie_cache` に `original_language` 列を追加し、原語をそのまま保存する。地域へのグルーピングはアプリ側の定数で行う。既定の除外は `/api/movies`（API層）で効かせ、UIの初期値には依存させない。`original_language IS NULL` の行は常に表示する。

**Tech Stack:** Next.js App Router / Supabase (PostgREST + plpgsql RPC) / zod / TanStack Query / Jest + React Testing Library / Playwright

**Spec:** `.claude/documents/region-filter-design.md`

## Global Constraints

- 地域グループは3つ: `korea` = `ko` / `chinese` = `zh` / `thai_indian` = `th`,`hi`,`te`,`ta`
- 広東語 `cn` は追加しない
- `ALLOWED_LANGUAGES`（`src/constants/movies.ts`）は**変更しない**。保存は従来どおり行い、読み取り時に絞る
- `original_language IS NULL` の行は**常に結果に含める**
- `/api/movies` の `include_regions` 未指定は「3グループすべて除外」
- 既存ユーザーの `saved_filters` は補填しない（一律適用）
- スキーマ変更は `supabase migration new` → `supabase db push`。ダッシュボードでの直接変更は禁止
- 関数を `CREATE OR REPLACE` したら `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` と `GRANT EXECUTE ... TO service_role` を同じマイグレーションに明示する
- テストは対象ファイルと同じディレクトリに `<filename>.test.ts(x)`。全指標 80% 以上
- コンポーネントは `React.memo` + `useCallback` + `displayName` 必須。今回は既存の
  `FilterModal` / `FilterModalContent`（いずれも対応済み）を変更するだけで、新規
  コンポーネントは作らない
- 地域チェックボックスは素の `<input type='checkbox'>` を使う。既存のジャンルタグ・
  配信サービスタグ（`filterModal.tsx:325-339` / `:347-359`）と同じ形を**踏襲する**ため。
  3件のために別パターンを持ち込むと一覧内で不統一になる
- SCSS は HTML タグを直接セレクタにしない。既存クラスを流用する
- バックフィル用の使い捨てスクリプトは**リポジトリに残さない**（`docs/tmp/` 配下で
  実行し、完了後に削除する）

---

### Task 1: 地域グループの定数と導出ヘルパー

**Files:**
- Modify: `src/constants/movies.ts`（末尾の `ALLOWED_LANGUAGES` 定義の直後）
- Modify: `src/constants/strings.ts:112-141`（`FILTER_LABELS`）
- Modify: `src/constants/queryParams.ts:20-37`（`MOVIE_FILTER_QUERY_PARAMS`）
- Create: `src/lib/movies/regionFilter.ts`
- Test: `src/lib/movies/regionFilter.test.ts`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces:
  - `REGION_GROUP_KEYS: readonly ['korea', 'chinese', 'thai_indian']`
  - `type RegionGroupKey = 'korea' | 'chinese' | 'thai_indian'`
  - `REGION_LANGUAGE_GROUPS: Record<RegionGroupKey, readonly string[]>`
  - `getExcludedLanguages(includedRegions?: readonly RegionGroupKey[]): string[]`
  - `FILTER_LABELS.REGION` / `REGION_FILTER` / `REGION_KOREA` / `REGION_CHINESE` / `REGION_THAI_INDIAN`
  - `MOVIE_FILTER_QUERY_PARAMS.INCLUDE_REGIONS = 'include_regions'`

- [ ] **Step 1: 定数を追加する**

`src/constants/movies.ts` の `ALLOWED_LANGUAGES` 定義の直後に追加する。

```ts
/**
 * 地域フィルタのグループキー
 *
 * 一覧（映画・配信）で既定非表示にする地域。原語を地域にまとめる対応表は
 * アプリ側に置く。地域を列に持つと、グループ分けを変えるたびに
 * マイグレーションと全行バックフィルが必要になるため。
 */
export const REGION_GROUP_KEYS = ['korea', 'chinese', 'thai_indian'] as const;

/**
 * 地域フィルタのグループキー
 */
export type RegionGroupKey = (typeof REGION_GROUP_KEYS)[number];

/**
 * 地域グループと原語（ISO 639-1）の対応
 *
 * TMDb は広東語を `cn`、北京語を `zh` と別コードで持つが、ALLOWED_LANGUAGES に
 * `cn` が無いため広東語作品はそもそも保存されていない。今回も追加しない。
 */
export const REGION_LANGUAGE_GROUPS: Record<
  RegionGroupKey,
  readonly string[]
> = {
  korea: ['ko'],
  chinese: ['zh'],
  thai_indian: ['th', 'hi', 'te', 'ta'],
};
```

`src/constants/strings.ts` の `FILTER_LABELS` に追加する（`OFFER_TYPE_PAID` の後、`} as const;` の前）。

```ts
  /** 地域 */
  REGION: '地域',
  /** 地域フィルタ（legend） */
  REGION_FILTER: '地域フィルタ',
  /** 韓国 */
  REGION_KOREA: '韓国',
  /** 中華圏 */
  REGION_CHINESE: '中華圏',
  /** タイ・インド */
  REGION_THAI_INDIAN: 'タイ・インド',
```

`src/constants/queryParams.ts` の `MOVIE_FILTER_QUERY_PARAMS` に追加する（`OFFER_TYPES` の後）。

```ts
  /** 表示に含める地域グループ（カンマ区切り） */
  INCLUDE_REGIONS: 'include_regions',
```

- [ ] **Step 2: 失敗するテストを書く**

`src/lib/movies/regionFilter.test.ts` を作成する。

```ts
/**
 * 地域フィルタの原語導出のテスト
 */

import { getExcludedLanguages } from './regionFilter';

describe('getExcludedLanguages', () => {
  it('未指定なら全グループの原語を除外する（一覧の既定）', () => {
    expect(getExcludedLanguages().sort()).toEqual(
      ['hi', 'ko', 'ta', 'te', 'th', 'zh'].sort(),
    );
  });

  it('空配列なら全グループの原語を除外する', () => {
    expect(getExcludedLanguages([]).sort()).toEqual(
      ['hi', 'ko', 'ta', 'te', 'th', 'zh'].sort(),
    );
  });

  it('韓国を含めると ko が除外対象から外れる', () => {
    const excluded = getExcludedLanguages(['korea']);

    expect(excluded).not.toContain('ko');
    expect(excluded.sort()).toEqual(['hi', 'ta', 'te', 'th', 'zh'].sort());
  });

  it('タイ・インドを含めると4言語がまとめて除外対象から外れる', () => {
    const excluded = getExcludedLanguages(['thai_indian']);

    expect(excluded.sort()).toEqual(['ko', 'zh'].sort());
  });

  it('全グループを含めると除外対象が無くなる', () => {
    expect(getExcludedLanguages(['korea', 'chinese', 'thai_indian'])).toEqual(
      [],
    );
  });

  it('広東語（cn）は対象に含まれない', () => {
    expect(getExcludedLanguages()).not.toContain('cn');
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx jest src/lib/movies/regionFilter.test.ts`
Expected: FAIL（`Cannot find module './regionFilter'`）

- [ ] **Step 4: 実装を書く**

`src/lib/movies/regionFilter.ts` を作成する。

```ts
/**
 * 地域フィルタ: 表示に含める地域から、除外する原語を導出する
 */

import {
  REGION_GROUP_KEYS,
  REGION_LANGUAGE_GROUPS,
  type RegionGroupKey,
} from '@/constants/movies';

/**
 * 表示対象に含める地域から、除外する原語の一覧を導出する
 *
 * 未指定なら全グループを除外する。これが一覧の既定の挙動であり、
 * 「デフォルトは表示しない」をAPI層で担保する。UIの初期値に依存させると、
 * URL直叩き・初回のサーバーレンダリング・保存済みフィルタが無いユーザーで
 * 挙動がぶれる。
 *
 * @param includedRegions - 表示に含める地域グループ
 * @returns 除外する原語（ISO 639-1）の配列
 */
export function getExcludedLanguages(
  includedRegions: readonly RegionGroupKey[] = [],
): string[] {
  return REGION_GROUP_KEYS.filter(
    (key) => !includedRegions.includes(key),
  ).flatMap((key) => [...REGION_LANGUAGE_GROUPS[key]]);
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx jest src/lib/movies/regionFilter.test.ts`
Expected: PASS（6件）

- [ ] **Step 6: 型チェックと lint**

Run: `npx tsc --noEmit && npx eslint src/lib/movies/regionFilter.ts src/constants/movies.ts src/constants/strings.ts src/constants/queryParams.ts`
Expected: どちらも exit 0

- [ ] **Step 7: コミット**

```bash
git add src/lib/movies/regionFilter.ts src/lib/movies/regionFilter.test.ts src/constants/movies.ts src/constants/strings.ts src/constants/queryParams.ts
git commit -m "feat(movies): 地域グループの定数と除外原語の導出を追加する"
```

---

### Task 2: マイグレーション（`original_language` 列と RPC 更新）

**Files:**
- Create: `supabase/migrations/<timestamp>_add_movie_cache_original_language.sql`
- Modify: `src/types/database.types.ts`（`supabase gen types` で自動生成・上書き）

**Interfaces:**
- Consumes: なし
- Produces:
  - `movie_cache.original_language`（`VARCHAR(10)`、NULL 許容）
  - `upsert_movie_cache(JSONB, BOOLEAN)` が `original_language` を受け付ける
  - `database.types.ts` の `movie_cache.Row` に `original_language: string | null`

- [ ] **Step 1: マイグレーションファイルを作る**

```bash
npx supabase migration new add_movie_cache_original_language
```

- [ ] **Step 2: マイグレーションの中身を書く**

生成されたファイルに以下を書く。`upsert_movie_cache` の本体は
`supabase/migrations/20261019065404_fix_movie_cache_cached_at_timestamptz.sql` の
定義に `original_language` を足したもの。他の列の扱い（リバイバル行の
`release_date` 保護、`is_now_playing` の条件付き更新、`is_revival` の非更新）は変えない。

```sql
-- movie_cache に original_language を追加する
--
-- 背景:
--   映画タブ・配信タブで韓国・中華圏・タイ/インドの作品を既定で非表示にし、
--   検索条件で切り替えられるようにしたい。
--
--   既存の言語フィルタ（ALLOWED_LANGUAGES / src/constants/movies.ts）は
--   保存時に弾くだけで、保存後の行からは原語が分からない。ユーザーが
--   切り替えられるようにするには、行ごとに原語を保存する必要がある。
--
--   原語コードをそのまま持ち、地域へのグルーピングはアプリ側の定数
--   （REGION_LANGUAGE_GROUPS）で行う。地域を列に持つと、グループ分けを
--   変えるたびにマイグレーションと全行バックフィルが必要になるため。
--
--   NULL は「未取得」を表す。読み取り側は NULL 行を常に結果に含める
--   （除外に倒すと、列追加直後に一覧が空になる）。

ALTER TABLE movie_cache
  ADD COLUMN IF NOT EXISTS original_language VARCHAR(10);

-- インデックスは作らない。
--   読み取り側の述語は `original_language IS NULL OR original_language NOT IN (...)`
--   という否定形で、かつ原語は数十種しかない低カーディナリティ列。B-tree は
--   選択されず、INSERT/UPDATE の書き込みコストだけが増える。
--   movie_cache は 1,142 行（2026-10-31 時点）でシーケンシャルスキャンでも
--   十分速い。行数が桁で増えたら EXPLAIN で再評価する。

COMMENT ON COLUMN movie_cache.original_language IS
  'TMDbの原語（ISO 639-1）。地域フィルタの絞り込みに使う。NULLは未取得を表し、除外対象にしない。';

-- --------------------------------------------
-- upsert_movie_cache に original_language を通す
-- --------------------------------------------
CREATE OR REPLACE FUNCTION upsert_movie_cache(
  movies JSONB,
  set_now_playing BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  upserted_count INTEGER;
BEGIN
  INSERT INTO movie_cache (
    id, title, poster_path, backdrop_path, release_date, overview,
    vote_average, vote_count, popularity, genre_ids, release_type,
    original_language, is_now_playing, cached_at
  )
  SELECT
    (item->>'id')::INTEGER,
    item->>'title',
    item->>'poster_path',
    item->>'backdrop_path',
    CASE WHEN item->>'release_date' IS NOT NULL AND item->>'release_date' != ''
      THEN (item->>'release_date')::DATE
      ELSE NULL
    END,
    item->>'overview',
    (item->>'vote_average')::DECIMAL(3,1),
    COALESCE((item->>'vote_count')::INTEGER, 0),
    (item->>'popularity')::DECIMAL(10,3),
    item->'genre_ids',
    item->>'release_type',
    item->>'original_language',
    set_now_playing,
    COALESCE((item->>'cached_at')::TIMESTAMPTZ, now())
  FROM jsonb_array_elements(movies) AS item
  ON CONFLICT (id, release_type) DO UPDATE SET
    title = EXCLUDED.title,
    poster_path = EXCLUDED.poster_path,
    backdrop_path = EXCLUDED.backdrop_path,
    -- リバイバル行の公開日は映画.com側（syncEigaMovies）が持ち主。
    -- TMDbの原公開日で上書きしない。
    release_date = CASE
      WHEN movie_cache.is_revival THEN movie_cache.release_date
      ELSE EXCLUDED.release_date
    END,
    overview = EXCLUDED.overview,
    vote_average = EXCLUDED.vote_average,
    vote_count = EXCLUDED.vote_count,
    popularity = EXCLUDED.popularity,
    genre_ids = EXCLUDED.genre_ids,
    -- 原語は取得できたときだけ更新する。呼び出し側が渡し損ねても、
    -- 既にバックフィル済みの値を NULL で潰さない
    original_language = COALESCE(
      EXCLUDED.original_language,
      movie_cache.original_language
    ),
    -- is_now_playing は明示的に立てるときだけ更新する。
    -- Discover経由（set_now_playing=false）では既存のフラグを保持する。
    is_now_playing = CASE
      WHEN set_now_playing THEN TRUE
      ELSE movie_cache.is_now_playing
    END,
    cached_at = EXCLUDED.cached_at;
    -- is_revival は更新対象に含めない（eiga のみが持ち主のため既存値を保持）

  GET DIAGNOSTICS upserted_count = ROW_COUNT;

  RETURN upserted_count;
END;
$$;

COMMENT ON FUNCTION upsert_movie_cache(JSONB, BOOLEAN) IS
  'movie_cache への UPSERT。is_revival=true の行の release_date は上書きしない。original_language は NULL で既存値を潰さない。';

-- CREATE OR REPLACE は既存権限を保持するが、意図が読み取れるよう明示し直す
-- （.claude/rules/supabase-db.md）
REVOKE EXECUTE ON FUNCTION public.upsert_movie_cache(JSONB, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_movie_cache(JSONB, BOOLEAN)
  TO service_role;
```

- [ ] **Step 3: 既存の関数定義との差分が原語だけであることを確認する**

`CREATE OR REPLACE` で全文を書き直すため、他の列の扱い（リバイバル行の `release_date`
保護、`is_now_playing` の条件付き更新、`is_revival` の非更新）を意図せず退行させうる。
置換前の定義と diff を取って、差分が `original_language` 関連だけであることを確認する。

```bash
diff <(sed -n '/CREATE OR REPLACE FUNCTION upsert_movie_cache/,/^\$\$;/p' \
        supabase/migrations/20261019065404_fix_movie_cache_cached_at_timestamptz.sql) \
     <(sed -n '/CREATE OR REPLACE FUNCTION upsert_movie_cache/,/^\$\$;/p' \
        supabase/migrations/<timestamp>_add_movie_cache_original_language.sql)
```

Expected: 差分は以下の3箇所だけ。
- INSERT の列リストに `original_language` が増えている
- SELECT に `item->>'original_language'` が増えている
- `DO UPDATE SET` に `original_language = COALESCE(...)` が増えている

- [ ] **Step 4: 適用対象を確認してから適用する**

```bash
set -a; . ./.env.local; set +a
npx supabase db push --dry-run
```

Expected: 対象が今回作成した1ファイルだけであること。
「リモートにあるがローカルに無い」で拒否された場合は `.claude/rules/supabase-db.md` の
「安全な回避手順」に従う。**`migration repair --status reverted` は実行しない。**

```bash
npx supabase db push
```

- [ ] **Step 5: 型定義を再生成する**

```bash
set -a; . ./.env.local; set +a
npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" > src/types/database.types.ts
```

`SUPABASE_PROJECT_ID` が `.env.local` に無ければ `npx supabase projects list` で確認する。
型定義ファイルは手動編集しない。

- [ ] **Step 6: 列が追加されたことを実データで確認する**

Run:
```bash
node -e '
const fs=require("fs");
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["\x27]|["\x27]$/g,"")];}));
const h={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`};
fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/movie_cache?select=id,original_language&limit=1`,{headers:h})
  .then(r=>r.json()).then(d=>console.log(JSON.stringify(d)));
'
```
Expected: `[{"id":...,"original_language":null}]`（列が存在し、値は NULL）

- [ ] **Step 7: 型チェック**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 8: コミット**

```bash
git add supabase/migrations src/types/database.types.ts
git commit -m "feat(db): movie_cache に original_language を追加する"
```

---

### Task 3: RPC 経由の書き込み2経路に原語を通す

**Files:**
- Modify: `src/lib/sync/syncNowPlayingMovies.ts:118-139`（`supabase.rpc('upsert_movie_cache', ...)` の引数）
- Modify: `src/app/api/movies/route.ts:287-300`（`movieRows` の構築）
- Test: `src/lib/sync/syncNowPlayingMovies.test.ts`
- Test: `src/app/api/movies/route.test.ts`

**Interfaces:**
- Consumes: Task 2 の `upsert_movie_cache`（`original_language` を受け付ける）
- Produces: なし（既存経路に列を足すだけ）

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/sync/syncNowPlayingMovies.test.ts` に追加する。既存の RPC アサーションの
近くに置く。

```ts
it('upsert_movie_cache に original_language を渡す', async () => {
  // 既存テストと同じ setup を使う（TMDb now_playing が1件返る状態）
  mockedGetNowPlayingMovies.mockResolvedValue({
    results: [createMockMovie({ id: 501, original_language: 'ko' })],
    page: 1,
    total_pages: 1,
    total_results: 1,
  });
  mockedHasExcludedKeyword.mockResolvedValue(false);

  await syncNowPlayingMovies();

  expect(mockRpc).toHaveBeenCalledWith(
    'upsert_movie_cache',
    expect.objectContaining({
      movies: [expect.objectContaining({ id: 501, original_language: 'ko' })],
      set_now_playing: true,
    }),
  );
});
```

`src/app/api/movies/route.test.ts` に追加する。Discover 経由の UPSERT を見るテスト。
RPC の検証は既存テスト（`:1649` / `:1866` 付近）と同じく `mockSupabaseClient!.rpc` を使う。

```ts
it('Discover 経由の UPSERT に original_language を含める', async () => {
  // キャッシュ失効 → Discover を叩く状態を作る（既存テストの setup を流用）
  mockDiscoverMovies.mockResolvedValue({
    results: [createMockMovie({ id: 601, original_language: 'fr' })],
    page: 1,
    total_pages: 1,
    total_results: 1,
  });

  await GET(createRequest('?release_type=theatrical&time_frame=upcoming'));

  const upsertRows = mockSupabaseClient!.rpc.mock.calls[0][1].movies;
  expect(upsertRows).toContainEqual(
    expect.objectContaining({ id: 601, original_language: 'fr' }),
  );
});
```

`createMockMovie` / `createRequest` / `mockedGetNowPlayingMovies` は各テストファイルの
既存定義に合わせる（名前が違う場合は既存テストが使っているものをそのまま使う）。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx jest src/lib/sync/syncNowPlayingMovies.test.ts src/app/api/movies/route.test.ts -t "original_language"`
Expected: FAIL（`original_language` が渡されていない）

- [ ] **Step 3: 実装する**

`src/lib/sync/syncNowPlayingMovies.ts` の RPC 引数、`genre_ids` の次の行に追加する。

```ts
            genre_ids: movie.genre_ids,
            original_language: movie.original_language,
            release_type: RELEASE_TYPE.THEATRICAL,
```

`src/app/api/movies/route.ts` の `movieRows` にも同じ位置で追加する。

```ts
            genre_ids: movie.genre_ids,
            original_language: movie.original_language,
            release_type,
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx jest src/lib/sync/syncNowPlayingMovies.test.ts src/app/api/movies/route.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add src/lib/sync/syncNowPlayingMovies.ts src/lib/sync/syncNowPlayingMovies.test.ts src/app/api/movies/route.ts src/app/api/movies/route.test.ts
git commit -m "feat(movies): RPC経由の書き込みに original_language を通す"
```

---

### Task 4: 直接 upsert の書き込み2経路に原語を通す

**Files:**
- Modify: `src/lib/sync/syncStreamingMovies.ts:325-345`（`movieRows` の構築）
- Modify: `src/lib/eiga/syncEigaMovies.ts`（`supabase.from('movie_cache').upsert({...})` の引数）
- Test: `src/lib/sync/syncStreamingMovies.test.ts`
- Test: `src/lib/eiga/syncEigaMovies.test.ts`

**Interfaces:**
- Consumes: Task 2 の `movie_cache.original_language`
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/sync/syncStreamingMovies.test.ts` に追加する。

```ts
it('upsert に original_language を含める', async () => {
  mockedDiscoverMovies.mockResolvedValue({
    results: [createMockMovie({ id: 701, original_language: 'th' })],
    page: 1,
    total_pages: 1,
    total_results: 1,
  });
  mockedGetJpStreamingAvailability.mockResolvedValue({
    isCurrentlyStreaming: true,
    digitalReleaseDate: '2026-01-01',
    keywordIds: [],
    watchProviderIds: { flatrate: [8], rent: [], buy: [] },
  });

  await syncStreamingMovies();

  expect(mockUpsert).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ id: 701, original_language: 'th' }),
    ]),
    { onConflict: 'id,release_type' },
  );
});
```

`src/lib/eiga/syncEigaMovies.test.ts` に追加する。

```ts
it('upsert に original_language を含める', async () => {
  mockedFetchEigaMovies.mockResolvedValue([
    { title: 'テスト映画', releaseDate: '2026-03-01', eigaUrl: null },
  ]);
  mockedSearchMovies.mockResolvedValue({
    results: [
      createMockMovie({
        id: 801,
        title: 'テスト映画',
        original_language: 'ko',
      }),
    ],
    page: 1,
    total_pages: 1,
    total_results: 1,
  });
  mockedHasExcludedKeyword.mockResolvedValue(false);

  await syncEigaMovies();

  expect(mockUpsert).toHaveBeenCalledWith(
    expect.objectContaining({ id: 801, original_language: 'ko' }),
    { onConflict: 'id,release_type' },
  );
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx jest src/lib/sync/syncStreamingMovies.test.ts src/lib/eiga/syncEigaMovies.test.ts -t "original_language"`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/lib/sync/syncStreamingMovies.ts` の `movieRows` に追加する。

```ts
        genre_ids: movie.genre_ids,
        original_language: movie.original_language,
        release_type: RELEASE_TYPE.STREAMING,
```

`src/lib/eiga/syncEigaMovies.ts` の upsert 引数に追加する。

```ts
          genre_ids: movie.genre_ids,
          original_language: movie.original_language,
          release_type: RELEASE_TYPE.THEATRICAL,
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx jest src/lib/sync/syncStreamingMovies.test.ts src/lib/eiga/syncEigaMovies.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add src/lib/sync/syncStreamingMovies.ts src/lib/sync/syncStreamingMovies.test.ts src/lib/eiga/syncEigaMovies.ts src/lib/eiga/syncEigaMovies.test.ts
git commit -m "feat(movies): 直接upsertの経路に original_language を通す"
```

---

### Task 5: 日次バックフィル（`getMovieCacheStats` と `update-movies`）

**Files:**
- Modify: `src/lib/types/index.ts:178-187`（`MovieCacheStats`）
- Modify: `src/lib/tmdb/tmdb.ts:227-240`（`getMovieCacheStats`）
- Modify: `src/lib/sync/updateMoviesCacheByBatch.ts:124-131`（`UPDATE` の値）
- Test: `src/lib/tmdb/tmdb.test.ts`
- Test: `src/lib/sync/updateMoviesCacheByBatch.test.ts`

**Interfaces:**
- Consumes: Task 2 の `movie_cache.original_language`
- Produces: `MovieCacheStats.originalLanguage: string | null`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/tmdb/tmdb.test.ts` に追加する。

```ts
it('getMovieCacheStats は original_language を返す', async () => {
  mockGet.mockResolvedValue({
    data: {
      genres: [{ id: 28, name: 'アクション' }],
      vote_average: 7.1,
      vote_count: 54,
      popularity: 2.2,
      original_language: 'ja',
    },
  });

  const stats = await getMovieCacheStats(106378);

  expect(stats.originalLanguage).toBe('ja');
});

it('getMovieCacheStats は original_language が無ければ null を返す', async () => {
  mockGet.mockResolvedValue({
    data: {
      genres: [],
      vote_average: 0,
      vote_count: 0,
      popularity: 0,
    },
  });

  const stats = await getMovieCacheStats(1);

  expect(stats.originalLanguage).toBeNull();
});
```

`src/lib/sync/updateMoviesCacheByBatch.test.ts` を2箇所いじる。

まず既存の `createFromMock`（`src/lib/sync/updateMoviesCacheByBatch.test.ts:48-84`）で
`update` のモックを変数に出し、戻り値に含める。現在はインラインで作られていて
呼び出し引数を検証できない。

```ts
  const updateMock = jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ error: updateError }),
  });

  const fromMock = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      order: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({ range: rangeMock }),
      }),
    }),
    update: updateMock,
    delete: deleteMock,
  });

  return Object.assign(fromMock, {
    rangeMock,
    updateMock,
    deleteMock,
    deleteEqMock,
  });
```

既存の `createMockCacheStats`（同ファイル `:28-37`）の既定値に `originalLanguage` を足す。

```ts
function createMockCacheStats(overrides: Record<string, unknown> = {}) {
  return {
    genreIds: [],
    voteAverage: 8.0,
    voteCount: 0,
    popularity: 150.5,
    originalLanguage: null,
    ...overrides,
  };
}
```

そのうえでテストを追加する。

```ts
it('UPDATE に original_language を含める（既存行のバックフィル）', async () => {
  setValidEnv();
  const fromMock = createFromMock({
    selectData: [{ id: 901, release_type: 'theatrical' }],
  });
  (createClient as jest.Mock).mockReturnValue({ from: fromMock });
  (getMovieCacheStats as jest.Mock).mockResolvedValue(
    createMockCacheStats({ originalLanguage: 'ko' }),
  );

  await updateMoviesCacheByBatch();

  expect(fromMock.updateMock).toHaveBeenCalledWith(
    expect.objectContaining({ original_language: 'ko' }),
  );
});
```

`tmdb.test.ts` 側のモック変数名（`mockGet` 相当）は同ファイルの既存定義に合わせる。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx jest src/lib/tmdb/tmdb.test.ts src/lib/sync/updateMoviesCacheByBatch.test.ts -t "original_language"`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/lib/types/index.ts` の `MovieCacheStats` に追加する。

```ts
  /** 人気度 */
  popularity: number;
  /** 原語（ISO 639-1）。TMDbが返さない場合は null */
  originalLanguage: string | null;
}
```

`src/lib/tmdb/tmdb.ts` の `getMovieCacheStats` を変更する。

```ts
  const { genres, vote_average, vote_count, popularity, original_language } =
    response.data;

  return {
    genreIds: (genres ?? []).map((genre) => genre.id),
    voteAverage: vote_average,
    voteCount: vote_count ?? 0,
    popularity,
    originalLanguage: original_language ?? null,
  };
```

`MovieDetail` 型に `original_language` が無ければ `src/lib/types/index.ts` の
`MovieDetail` に `original_language: string;` を追加する（`Movie` 型には既にある）。

`src/lib/sync/updateMoviesCacheByBatch.ts` の `UPDATE` に追加する。

```ts
          .update({
            vote_average: stats.voteAverage,
            vote_count: stats.voteCount,
            popularity: stats.popularity,
            original_language: stats.originalLanguage,
            updated_at: now,
          })
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx jest src/lib/tmdb/tmdb.test.ts src/lib/sync/updateMoviesCacheByBatch.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: 型チェック**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 6: コミット**

```bash
git add src/lib/types/index.ts src/lib/tmdb/tmdb.ts src/lib/tmdb/tmdb.test.ts src/lib/sync/updateMoviesCacheByBatch.ts src/lib/sync/updateMoviesCacheByBatch.test.ts
git commit -m "feat(movies): 日次バッチで original_language を埋める"
```

---

### Task 6: 読み取り側のフィルタ条件

**Files:**
- Modify: `src/helpers/movieCacheFilters.ts`（`MovieCacheFilters` と `applyMovieCacheFilters`）
- Test: `src/helpers/movieCacheFilters.test.ts`

**Interfaces:**
- Consumes: Task 2 の `movie_cache.original_language`
- Produces: `MovieCacheFilters.excludedLanguages: string[]`

- [ ] **Step 1: 失敗するテストを書く**

まず既存の `baseFilters`（`src/helpers/movieCacheFilters.test.ts:51-57`）に
`excludedLanguages: []` を追加する（必須プロパティのため、無いと全テストが型エラーになる）。

```ts
const baseFilters: MovieCacheFilters = {
  releaseType: 'theatrical',
  isNowPlayingTheatrical: false,
  genreIds: [],
  watchProviderIds: [],
  watchProviderOfferTypes: [],
  excludedLanguages: [],
};
```

そのうえで、既存の `createQueryBuilderSpy()`（呼び出しを `calls` 配列に記録する）を
使ってテストを追加する。

```ts
describe('地域（原語）フィルタ', () => {
  it('除外原語があれば NULL を温存した or 条件を付ける', () => {
    const builder = createQueryBuilderSpy();

    applyMovieCacheFilters(builder, {
      ...baseFilters,
      excludedLanguages: ['ko', 'zh'],
    });

    expect(builder.calls).toContainEqual({
      method: 'or',
      args: ['original_language.is.null,original_language.not.in.(ko,zh)'],
    });
  });

  it('除外原語が空なら言語で絞らない', () => {
    const builder = createQueryBuilderSpy();

    applyMovieCacheFilters(builder, {
      ...baseFilters,
      excludedLanguages: [],
    });

    expect(
      builder.calls.filter((call) => call.method === 'or'),
    ).toHaveLength(0);
  });

  it('ジャンル条件と併用しても両方が適用される', () => {
    const builder = createQueryBuilderSpy();

    applyMovieCacheFilters(builder, {
      ...baseFilters,
      genreIds: [28],
      excludedLanguages: ['ko'],
    });

    expect(builder.calls).toContainEqual({
      method: 'or',
      args: ['genre_ids.cs.[28]'],
    });
    expect(builder.calls).toContainEqual({
      method: 'or',
      args: ['original_language.is.null,original_language.not.in.(ko)'],
    });
  });

  it('フィルタ構文を壊す文字を含む原語は連結しない', () => {
    const builder = createQueryBuilderSpy();

    applyMovieCacheFilters(builder, {
      ...baseFilters,
      excludedLanguages: ['ko', 'x),original_language.is.null', 'z.z'],
    });

    expect(builder.calls).toContainEqual({
      method: 'or',
      args: ['original_language.is.null,original_language.not.in.(ko)'],
    });
  });

  it('不正な原語しか無ければ言語で絞らない', () => {
    const builder = createQueryBuilderSpy();

    applyMovieCacheFilters(builder, {
      ...baseFilters,
      excludedLanguages: ['*'],
    });

    expect(
      builder.calls.filter((call) => call.method === 'or'),
    ).toHaveLength(0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx jest src/helpers/movieCacheFilters.test.ts`
Expected: FAIL（型エラー、または `or` が呼ばれない）

- [ ] **Step 3: 実装する**

`MovieCacheFilters` に追加する（`watchProviderOfferTypes` の後）。

```ts
  /**
   * 除外する原語（ISO 639-1）。空配列なら言語で絞らない
   *
   * `original_language IS NULL` の行は常に含める。NULL は「未取得」を表し、
   * 「対象地域である」こととは区別する。除外に倒すと、列追加直後や
   * バックフィル未完了の行が一覧から消える
   */
  excludedLanguages: string[];
```

ファイル先頭（`applyMovieCacheFilters` の前）に検証用の正規表現を置く。

```ts
/**
 * PostgREST のフィルタ構文に埋め込んでよい原語コードの形
 *
 * 除外原語は `not.in.(ko,zh)` の形で文字列連結するため、`,` `)` `.` が
 * 混ざると構文が壊れる。現状の呼び出し元（getExcludedLanguages）は定数しか
 * 返さないが、型は string[] であり将来の呼び出しまでは縛れない。
 * 連結する直前にここで弾く。
 */
const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}$/;
```

`applyMovieCacheFilters` の `watchProviderIds` ブロックの後、`return` の前に追加する。

```ts
  const safeLanguages = filters.excludedLanguages.filter((code) =>
    LANGUAGE_CODE_PATTERN.test(code),
  );

  if (safeLanguages.length > 0) {
    filtered = filtered.or(
      `original_language.is.null,original_language.not.in.(${safeLanguages.join(',')})`,
    );
  }
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx jest src/helpers/movieCacheFilters.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add src/helpers/movieCacheFilters.ts src/helpers/movieCacheFilters.test.ts
git commit -m "feat(movies): movie_cache クエリに原語の除外条件を追加する"
```

---

### Task 7: API（`include_regions` の受け口と既定の除外）

**Files:**
- Modify: `src/schema/movies.ts`（`moviesQuerySchema`）
- Modify: `src/app/api/movies/route.ts`（クエリの分解と `filters` の構築）
- Test: `src/schema/movies.test.ts`
- Test: `src/app/api/movies/route.test.ts`

**Interfaces:**
- Consumes: Task 1 の `getExcludedLanguages` / `REGION_GROUP_KEYS`、Task 6 の `MovieCacheFilters.excludedLanguages`
- Produces: `/api/movies?include_regions=korea,chinese` が解釈される

- [ ] **Step 1: 失敗するテストを書く**

`src/schema/movies.test.ts` に追加する。

```ts
describe('include_regions', () => {
  it('未指定なら undefined になる', () => {
    const result = moviesQuerySchema.parse({});

    expect(result.include_regions).toBeUndefined();
  });

  it('カンマ区切りを配列に変換する', () => {
    const result = moviesQuerySchema.parse({
      include_regions: 'korea,thai_indian',
    });

    expect(result.include_regions).toEqual(['korea', 'thai_indian']);
  });

  it('未知の地域キーは拒否する', () => {
    const result = moviesQuerySchema.safeParse({
      include_regions: 'korea,atlantis',
    });

    expect(result.success).toBe(false);
  });

  it('空文字は拒否する', () => {
    const result = moviesQuerySchema.safeParse({ include_regions: '' });

    expect(result.success).toBe(false);
  });
});
```

`src/app/api/movies/route.test.ts` に追加する。`or` 条件の検証は既存の
`collectFilterCalls`（`:68-70`）を使い、記録済みチェインを横断して集める。

```ts
describe('地域フィルタの既定', () => {
  /** 原語に関する or 条件を1件取り出す（無ければ undefined） */
  const findLanguageOr = (): string | undefined =>
    collectFilterCalls('or')
      .map((args) => String(args[0]))
      .find((arg) => arg.includes('original_language'));

  it('include_regions 未指定なら3グループの原語を除外する', async () => {
    await GET(createRequest('?release_type=theatrical&time_frame=upcoming'));

    const condition = findLanguageOr();
    expect(condition).toContain('original_language.is.null');
    for (const lang of ['ko', 'zh', 'th', 'hi', 'te', 'ta']) {
      expect(condition).toContain(lang);
    }
  });

  it('include_regions で指定した地域は除外しない', async () => {
    await GET(
      createRequest(
        '?release_type=theatrical&time_frame=upcoming&include_regions=korea',
      ),
    );

    const condition = findLanguageOr();
    // 除外リストの中身だけを見る（or 条件全体には列名が含まれるため）
    const excluded = condition?.match(/not\.in\.\(([^)]*)\)/)?.[1].split(',');
    expect(excluded).not.toContain('ko');
    expect(excluded).toContain('zh');
  });

  it('全地域を指定すれば言語で絞らない', async () => {
    await GET(
      createRequest(
        '?release_type=theatrical&time_frame=upcoming&include_regions=korea,chinese,thai_indian',
      ),
    );

    expect(findLanguageOr()).toBeUndefined();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx jest src/schema/movies.test.ts src/app/api/movies/route.test.ts -t "include_regions|地域フィルタ"`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/schema/movies.ts` の import に追加する。

```ts
import { REGION_GROUP_KEYS } from '@/constants/movies';
```

`moviesQuerySchema` の `offer_types` の後に追加する。

```ts
  // 表示に含める地域グループ。未指定は「3グループすべて除外」を意味する
  // （既定で非表示にする挙動をAPI層で担保する）
  include_regions: z
    .string()
    .transform((val) => val.split(','))
    .pipe(z.array(z.enum(REGION_GROUP_KEYS)))
    .optional(),
```

`src/app/api/movies/route.ts` の import に追加する。

```ts
import { getExcludedLanguages } from '@/lib/movies/regionFilter';
```

バリデーション結果の分解に `include_regions` を加え（既存の `offer_types` と同じ箇所）、
`filters` オブジェクトに追加する。

```ts
      watchProviderOfferTypes: offer_types ?? [],
      // 未指定なら3グループすべてを除外する（既定で非表示）
      excludedLanguages: getExcludedLanguages(include_regions),
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx jest src/schema/movies.test.ts src/app/api/movies/route.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add src/schema/movies.ts src/schema/movies.test.ts src/app/api/movies/route.ts src/app/api/movies/route.test.ts
git commit -m "feat(movies): /api/movies に include_regions を追加し既定で3地域を除外する"
```

---

### Task 8: フィルタの永続化（URL / localStorage / saved_filters）

**Files:**
- Modify: `src/schema/filters.ts`（`filterConditionsSchema`）
- Modify: `src/features/movies/utils/movieFilterParams.ts:76-225`
- Test: `src/schema/filters.test.ts`
- Test: `src/features/movies/utils/movieFilterParams.test.ts`

**Interfaces:**
- Consumes: Task 1 の `REGION_GROUP_KEYS`
- Produces: `FilterConditions.include_regions?: RegionGroupKey[]`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/movies/utils/movieFilterParams.test.ts` に追加する。

```ts
describe('include_regions の永続化', () => {
  it('URLのカンマ区切りを配列に復元する', () => {
    const params = new URLSearchParams('include_regions=korea,chinese');

    const conditions = parseFilterConditionsFromParams(params);

    expect(conditions.include_regions).toEqual(['korea', 'chinese']);
  });

  it('未知の地域キーが混ざるフィールドは捨てる', () => {
    const params = new URLSearchParams('include_regions=korea,atlantis');

    const conditions = parseFilterConditionsFromParams(params);

    expect(conditions.include_regions).toBeUndefined();
  });

  it('配列をカンマ区切りでURLに書き戻す', () => {
    const params = buildFilterSearchParams(new URLSearchParams(), {
      include_regions: ['korea', 'thai_indian'],
    });

    expect(params.get('include_regions')).toBe('korea,thai_indian');
  });

  it('空配列はURLに書かない', () => {
    const params = buildFilterSearchParams(new URLSearchParams(), {
      include_regions: [],
    });

    expect(params.has('include_regions')).toBe(false);
  });
});
```

`src/schema/filters.test.ts` に追加する。

```ts
it('include_regions に未知のキーがあれば拒否する', () => {
  const result = filterConditionsSchema.safeParse({
    include_regions: ['korea', 'atlantis'],
  });

  expect(result.success).toBe(false);
});

it('include_regions の配列を受け付ける', () => {
  const result = filterConditionsSchema.parse({
    include_regions: ['korea', 'chinese', 'thai_indian'],
  });

  expect(result.include_regions).toEqual(['korea', 'chinese', 'thai_indian']);
});

it('include_regions を持たない既存の保存済みフィルタも通る', () => {
  // saved_filters の既存レコードにはこのキーが無い。optional なので
  // パースに失敗せず、未指定（＝3グループ除外）として扱われる
  const result = filterConditionsSchema.safeParse({
    sort_by: 'release_date',
    release_type: 'theatrical',
    genre_ids: [28],
  });

  expect(result.success).toBe(true);
  expect(result.success && result.data.include_regions).toBeUndefined();
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx jest src/schema/filters.test.ts src/features/movies/utils/movieFilterParams.test.ts -t "include_regions"`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/schema/filters.ts` の import に `REGION_GROUP_KEYS` を足し、スキーマに追加する。

```ts
  // 表示に含める地域グループ。未指定は「すべて除外」を意味する
  include_regions: z.array(z.enum(REGION_GROUP_KEYS)).optional(),
```

`src/features/movies/utils/movieFilterParams.ts` の `RawFilterConditions` に追加する。

```ts
  offer_types?: unknown;
  include_regions?: unknown;
```

`validateFilterConditions` の `offerTypes` の後に追加する。

```ts
  // 提供形態と同じく、URLはカンマ区切り文字列・localStorage は配列で来る
  const includeRegions = parseField(
    'include_regions',
    normalizeStringList(raw.include_regions),
  );
  if (includeRegions) conditions.include_regions = includeRegions;
```

`parseFilterConditionsFromParams` の読み取りに追加する。

```ts
    include_regions:
      searchParams.get(MOVIE_FILTER_QUERY_PARAMS.INCLUDE_REGIONS) ?? undefined,
```

`buildFilterSearchParams` の末尾（`return params;` の前）に追加する。

```ts
  setOrDelete(
    MOVIE_FILTER_QUERY_PARAMS.INCLUDE_REGIONS,
    conditions.include_regions && conditions.include_regions.length > 0
      ? conditions.include_regions.join(',')
      : undefined,
  );
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx jest src/schema/filters.test.ts src/features/movies/utils/movieFilterParams.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add src/schema/filters.ts src/schema/filters.test.ts src/features/movies/utils/movieFilterParams.ts src/features/movies/utils/movieFilterParams.test.ts
git commit -m "feat(movies): 地域フィルタをURL・localStorage・保存済みフィルタに通す"
```

---

### Task 9: `useMovieList` に地域の状態を持たせる

**Files:**
- Modify: `src/features/movies/hooks/useMovieList.ts`
- Test: `src/features/movies/hooks/useMovieList.test.ts`

**Interfaces:**
- Consumes: Task 8 の `FilterConditions.include_regions`、Task 1 の `RegionGroupKey`
- Produces:
  - `UseMovieListReturn.selectedRegions: RegionGroupKey[]`
  - `handleFilterApply(genreIds, dateRange, isRevival, watchProviderIds?, offerTypes?, regions?)`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/movies/hooks/useMovieList.test.ts` に追加する。

```ts
describe('地域フィルタ', () => {
  it('初期状態では selectedRegions が空（＝全地域を除外）', () => {
    const { result } = renderHook(() => useMovieList(defaultOptions), {
      wrapper,
    });

    expect(result.current.selectedRegions).toEqual([]);
  });

  it('URLの include_regions を初期値に反映する', () => {
    mockSearchParams = new URLSearchParams('include_regions=korea');

    const { result } = renderHook(() => useMovieList(defaultOptions), {
      wrapper,
    });

    expect(result.current.selectedRegions).toEqual(['korea']);
  });

  it('適用すると API パラメータに include_regions が載る', async () => {
    const { result } = renderHook(() => useMovieList(defaultOptions), {
      wrapper,
    });

    act(() => {
      result.current.handleFilterApply({}, {}, undefined, [], [], ['chinese']);
    });

    await waitFor(() => {
      expect(mockGetMovies).toHaveBeenCalledWith(
        expect.objectContaining({ include_regions: 'chinese' }),
        expect.anything(),
      );
    });
  });

  it('地域が空なら include_regions を送らない', async () => {
    const { result } = renderHook(() => useMovieList(defaultOptions), {
      wrapper,
    });

    await waitFor(() => {
      expect(mockGetMovies).toHaveBeenCalledWith(
        expect.objectContaining({ include_regions: undefined }),
        expect.anything(),
      );
    });
  });
});
```

既存テストのモック名（`wrapper` / `defaultOptions` / `mockGetMovies` / `mockSearchParams`）は
ファイルの既存定義に合わせる。`handleFilterApply` の第1引数はジャンルID配列なので、
既存テストの呼び出し形に合わせて引数を渡す。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx jest src/features/movies/hooks/useMovieList.test.ts -t "地域フィルタ"`
Expected: FAIL

- [ ] **Step 3: 実装する**

import に追加する。

```ts
import type { RegionGroupKey } from '@/constants/movies';
```

`UseMovieListReturn` に追加する（`selectedOfferTypes` の後）。

```ts
  /** 表示に含める地域グループ（空配列なら全地域を除外） */
  selectedRegions: RegionGroupKey[];
```

`handleFilterApply` のシグネチャを更新する。

```ts
  handleFilterApply: (
    genreIds: number[],
    dateRange: DateRange,
    isRevival: boolean | undefined,
    watchProviderIds?: number[],
    offerTypes?: WatchProviderOfferType[],
    regions?: RegionGroupKey[],
  ) => void;
```

`FilterState` に追加する。

```ts
  offerTypes: WatchProviderOfferType[];
  regions: RegionGroupKey[];
```

`buildFilterConditions` に追加する（`offer_types` の後）。

```ts
  if (state.regions.length > 0) {
    conditions.include_regions = state.regions;
  }
```

state を追加する（`selectedOfferTypes` の宣言の後）。

```ts
  const [selectedRegions, setSelectedRegions] = useState<RegionGroupKey[]>(
    urlFilters.include_regions ?? [],
  );
```

保存済みフィルタの反映 `useEffect` に追加する（`setSelectedOfferTypes` の後）。

```ts
    setSelectedRegions(conditions.include_regions || []);
```

`moviesBaseParams` に追加する。`saved` の分岐も既存と同じ形に揃える。

```ts
    const effectiveRegions = saved?.include_regions ?? selectedRegions;
```

```ts
      include_regions:
        effectiveRegions.length > 0 ? effectiveRegions.join(',') : undefined,
```

`useMemo` の依存配列に `selectedRegions` を追加する。

`handleSortChange` / `handleReleaseTypeChange` の `buildFilterConditions` 呼び出しに
`regions: selectedRegions` を追加し、依存配列にも `selectedRegions` を足す。

`handleFilterApply` を更新する。

```ts
  const handleFilterApply = useCallback(
    (
      genreIds: number[],
      newDateRange: DateRange,
      isRevival: boolean | undefined,
      watchProviderIds: number[] = [],
      offerTypes: WatchProviderOfferType[] = [],
      regions: RegionGroupKey[] = [],
    ) => {
      setSelectedGenreIds(genreIds);
      setDateRange(newDateRange);
      setIsRevivalFilter(isRevival);
      setSelectedWatchProviderIds(watchProviderIds);
      setSelectedOfferTypes(offerTypes);
      setSelectedRegions(regions);
      setIsFilterModalOpen(false);
      persistFilters(
        buildFilterConditions({
          sortBy,
          releaseType,
          genreIds,
          dateRange: newDateRange,
          isRevival,
          watchProviderIds,
          offerTypes,
          regions,
        }),
      );
    },
    [sortBy, releaseType, persistFilters],
  );
```

戻り値の `useMemo` に `selectedRegions` を追加し、依存配列にも足す。

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx jest src/features/movies/hooks/useMovieList.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: 型チェック**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 6: コミット**

```bash
git add src/features/movies/hooks/useMovieList.ts src/features/movies/hooks/useMovieList.test.ts
git commit -m "feat(movies): useMovieList に地域フィルタの状態を追加する"
```

---

### Task 10: フィルタモーダルに「地域」セクションを追加する

**Files:**
- Modify: `src/components/ui/movie/filterModal/filterModal.tsx`
- Modify: `src/features/movies/component/movieListContent/movieListContent.tsx:111-122`
- Test: `src/components/ui/movie/filterModal/filterModal.test.tsx`

**Interfaces:**
- Consumes: Task 9 の `selectedRegions` / `handleFilterApply`、Task 1 の `FILTER_LABELS.REGION*` と `RegionGroupKey`
- Produces: なし（最終的な利用側）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/ui/movie/filterModal/filterModal.test.tsx` に追加する。

```tsx
describe('地域セクション', () => {
  it('3つの地域チェックボックスを表示する', () => {
    render(<FilterModal {...defaultProps} open />);

    expect(screen.getByRole('checkbox', { name: '韓国' })).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: '中華圏' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'タイ・インド' }),
    ).toBeInTheDocument();
  });

  it('既定ではすべて未選択', () => {
    render(<FilterModal {...defaultProps} open selectedRegions={[]} />);

    expect(screen.getByRole('checkbox', { name: '韓国' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '中華圏' })).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'タイ・インド' }),
    ).not.toBeChecked();
  });

  it('選択済みの地域はチェックされる', () => {
    render(
      <FilterModal {...defaultProps} open selectedRegions={['korea']} />,
    );

    expect(screen.getByRole('checkbox', { name: '韓国' })).toBeChecked();
  });

  it('チェックして適用すると地域が onApply に渡る', async () => {
    const user = userEvent.setup();
    const onApply = jest.fn();
    render(<FilterModal {...defaultProps} open onApply={onApply} />);

    await user.click(screen.getByRole('checkbox', { name: '中華圏' }));
    await user.click(screen.getByRole('button', { name: '適用' }));

    expect(onApply).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      [],
      [],
      ['chinese'],
    );
  });

  it('クリアで地域の選択も解除される', async () => {
    const user = userEvent.setup();
    render(
      <FilterModal {...defaultProps} open selectedRegions={['korea']} />,
    );

    await user.click(screen.getByRole('button', { name: 'クリア' }));

    expect(screen.getByRole('checkbox', { name: '韓国' })).not.toBeChecked();
  });

  it('劇場公開タブでも地域セクションを表示する', () => {
    render(
      <FilterModal {...defaultProps} open releaseType='theatrical' />,
    );

    expect(screen.getByRole('checkbox', { name: '韓国' })).toBeInTheDocument();
  });
});
```

既存テストの `defaultProps` に `selectedRegions: []` を追加する（必須 prop のため）。
「適用」「クリア」のボタン名は `BUTTON_LABELS.APPLY` / `BUTTON_LABELS.CLEAR` の実値に合わせる。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx jest src/components/ui/movie/filterModal/filterModal.test.tsx -t "地域セクション"`
Expected: FAIL

- [ ] **Step 3: 実装する**

`filterModal.tsx` の import に追加する。

```tsx
import type { RegionGroupKey } from '@/constants/movies';
```

`FILTER_LABELS` の import は既にあるのでそのまま使う。ファイル先頭（`FilterModalProps` の前）に
選択肢を定義する。

```tsx
/**
 * 地域フィルタの選択肢
 *
 * 既定ではすべて未選択＝非表示。APIは include_regions 未指定を
 * 「3グループすべて除外」として扱う
 */
const REGION_OPTIONS: { key: RegionGroupKey; label: string }[] = [
  { key: 'korea', label: FILTER_LABELS.REGION_KOREA },
  { key: 'chinese', label: FILTER_LABELS.REGION_CHINESE },
  { key: 'thai_indian', label: FILTER_LABELS.REGION_THAI_INDIAN },
];
```

`FilterModalProps` と `FilterModalContent` の props 型に追加する。

```tsx
  /** 表示に含める地域グループ（空配列なら全地域を除外） */
  selectedRegions: RegionGroupKey[];
```

`onApply` の型を両方で更新する。

```tsx
  onApply: (
    genreIds: number[],
    dateRange: DateRange,
    isRevival: boolean | undefined,
    watchProviderIds: number[],
    offerTypes: WatchProviderOfferType[],
    regions: RegionGroupKey[],
  ) => void;
```

`FilterModalContent` に state とハンドラを追加する。

```tsx
  const [tempRegions, setTempRegions] =
    useState<RegionGroupKey[]>(selectedRegions);
```

```tsx
  const handleRegionToggle = useCallback((key: RegionGroupKey) => {
    setTempRegions((prev) =>
      prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key],
    );
  }, []);
```

`handleClear` に `setTempRegions([]);` を追加する。

`handleApply` を更新する（`tempRegions` を渡し、依存配列にも足す）。

```tsx
  const handleApply = useCallback(() => {
    onApply(
      tempSelectedIds,
      tempDateRange,
      tempIsRevival,
      showWatchProviders ? tempWatchProviderIds : [],
      showWatchProviders ? tempOfferTypes : [],
      tempRegions,
    );
  }, [
    onApply,
    tempSelectedIds,
    tempDateRange,
    tempIsRevival,
    tempWatchProviderIds,
    tempOfferTypes,
    tempRegions,
    showWatchProviders,
  ]);
```

ジャンルセクション（`FILTER_LABELS.GENRE` のブロック）の**直前**に地域セクションを挿入する。
既存クラスをそのまま流用するので SCSS の変更は不要。

```tsx
        <div className={styles.c_filter__section}>
          <h3 className={styles.c_filter__section_title}>
            {FILTER_LABELS.REGION}
          </h3>
          <fieldset className={styles.c_filter__tag_grid}>
            <legend className={styles.c_filter__visually_hidden}>
              {FILTER_LABELS.REGION_FILTER}
            </legend>
            {REGION_OPTIONS.map((option) => (
              <label key={option.key} className={styles.c_filter__tag}>
                <input
                  type='checkbox'
                  checked={tempRegions.includes(option.key)}
                  onChange={() => handleRegionToggle(option.key)}
                  className={styles.c_filter__tag_input}
                />
                <span className={styles.c_filter__tag_label}>
                  {option.label}
                </span>
              </label>
            ))}
          </fieldset>
        </div>
```

`FilterModal`（外側）でも `selectedRegions` を受けて `FilterModalContent` に渡す。

`movieListContent.tsx` の `<FilterModal>` に prop を追加する。`useMovieList` の
戻り値から `selectedRegions` を取り出す（同ファイル内の分割代入に追加）。

```tsx
          selectedOfferTypes={selectedOfferTypes}
          selectedRegions={selectedRegions}
          onApply={handleFilterApply}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx jest src/components/ui/movie/filterModal/filterModal.test.tsx`
Expected: PASS（全件）

- [ ] **Step 5: 型チェックと lint**

Run: `npx tsc --noEmit && npx eslint src/components/ui/movie/filterModal/filterModal.tsx src/features/movies/component/movieListContent/movieListContent.tsx`
Expected: どちらも exit 0

- [ ] **Step 6: コミット**

```bash
git add src/components/ui/movie/filterModal/filterModal.tsx src/components/ui/movie/filterModal/filterModal.test.tsx src/features/movies/component/movieListContent/movieListContent.tsx
git commit -m "feat(movies): フィルタモーダルに地域セクションを追加する"
```

---

### Task 11: 既存行の一括バックフィルを実行する

**Files:**
- Create: `docs/tmp/backfill-original-language.mjs`（`.gitignore` 対象。実行後に削除する）

**Interfaces:**
- Consumes: Task 2 の `movie_cache.original_language`
- Produces: なし（本番データの更新のみ）

- [ ] **Step 1: 全テストが通ることを確認する**

Run: `npx jest`
Expected: すべて PASS（本番データを触る前に、コード側の健全性を確認する）

- [ ] **Step 2: バックフィルスクリプトを書く**

`docs/tmp/backfill-original-language.mjs` を作成する。

```js
/**
 * movie_cache.original_language の初回バックフィル（使い捨て）
 *
 * 日次 cron（update-movies）でも埋まるが、リリース直後からフィルタを
 * 機能させるため一度だけ手で流す。TMDb のレート制限（50 req/s）に対し
 * 同時実行を 10 に絞る。
 */
import fs from 'node:fs';

const env = Object.fromEntries(
  fs
    .readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const DB_HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const TMDB_HEADERS = { Authorization: `Bearer ${env.TMDB_API_KEY}` };
const CONCURRENCY = 10;

/** original_language が未取得の行からユニークIDを集める */
async function fetchPendingIds() {
  const ids = new Set();
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(
      `${SUPABASE}/rest/v1/movie_cache?select=id&original_language=is.null&order=id.asc&offset=${offset}&limit=1000`,
      { headers: DB_HEADERS },
    );
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    rows.forEach((r) => ids.add(r.id));
    if (rows.length < 1000) break;
  }
  return [...ids];
}

async function backfillOne(id) {
  const res = await fetch(`https://api.themoviedb.org/3/movie/${id}`, {
    headers: TMDB_HEADERS,
  });
  if (!res.ok) return { id, ok: false, reason: `tmdb ${res.status}` };

  const { original_language: lang } = await res.json();
  if (!lang) return { id, ok: false, reason: 'no original_language' };

  const upd = await fetch(`${SUPABASE}/rest/v1/movie_cache?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...DB_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ original_language: lang }),
  });
  return upd.ok
    ? { id, ok: true, lang }
    : { id, ok: false, reason: `db ${upd.status}` };
}

const pending = await fetchPendingIds();

if (process.env.DRY_RUN) {
  console.log(`[dry-run] 対象: ${pending.length} 件 / 更新は行いません`);
  process.exit(0);
}

console.log(`対象: ${pending.length} 件`);

const failures = [];
for (let i = 0; i < pending.length; i += CONCURRENCY) {
  const batch = pending.slice(i, i + CONCURRENCY);
  const results = await Promise.all(batch.map(backfillOne));
  failures.push(...results.filter((r) => !r.ok));
  console.log(`  ${Math.min(i + CONCURRENCY, pending.length)}/${pending.length}`);
}

console.log(`完了: 成功 ${pending.length - failures.length} / 失敗 ${failures.length}`);
if (failures.length > 0) console.log(JSON.stringify(failures.slice(0, 20), null, 1));
```

- [ ] **Step 3: ドライラン（更新せずに対象件数だけ数える）**

本番データを一括更新する前に、対象が想定どおりかを確認する。

Run: `DRY_RUN=1 node docs/tmp/backfill-original-language.mjs`
Expected: 「[dry-run] 対象: 1112 件 / 更新は行いません」。
件数が 0 ならマイグレーションが未適用（Task 2 に戻る）。件数が総行数より極端に多ければ
クエリが間違っている。

- [ ] **Step 4: バックフィルを実行する**

Run: `node docs/tmp/backfill-original-language.mjs`
Expected: 「対象: 1112 件」程度から始まり、「完了: 成功 N / 失敗 M」で終わる。
失敗は TMDb 側に原語が無い作品だけのはず（その行は NULL のまま＝常に表示される）。

**冪等性とリカバリ:** 対象を `original_language=is.null` の行に限っているため、
途中で中断しても**そのまま再実行すればよい**（更新済みの行は次回の対象から外れる）。
ロールバックは不要。仮に誤った値を書いても、日次 cron（`update-movies`）が
TMDb の値で毎日上書きするため自己修復する。

- [ ] **Step 5: 結果を実データで検証する**

Run:
```bash
node -e '
const fs=require("fs");
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["\x27]|["\x27]$/g,"")];}));
const h={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,Prefer:"count=exact",Range:"0-0"};
const q=async(f)=>(await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/movie_cache?select=id&${f}`,{headers:h})).headers.get("content-range");
(async()=>{
  console.log("全行:", await q(""));
  console.log("NULL残り:", await q("original_language=is.null"));
  for (const lang of ["ko","zh","th","hi","te","ta"]) {
    console.log(`  ${lang}:`, await q(`original_language=eq.${lang}`));
  }
})();
'
```
Expected: `NULL残り` がごく少数（TMDb に原語が無い作品のみ）。`ko` などに件数が付く。

- [ ] **Step 6: 使い捨てスクリプトを削除する**

```bash
rm docs/tmp/backfill-original-language.mjs
```

`docs/tmp/` は `.gitignore` 対象（`.gitignore:89`）なのでコミット対象には入らない。
このタスクにコミットは無い（本番データの更新のみ）。

---

### Task 12: E2E（地域フィルタのユーザーストーリー）

**Files:**
- Create: `e2e/movies/regionFilter.spec.ts`

**Interfaces:**
- Consumes: Task 10 までの全機能
- Produces: なし

- [ ] **Step 1: E2E を書く**

`e2e/movies/regionFilter.spec.ts` を作成する。既存の
`e2e/movies/crossReleaseType.spec.ts` / `e2e/movies/streamingJpAvailability.spec.ts` の
ヘルパー（`e2e/helpers/api.ts` / `e2e/helpers/runScope.ts`）の使い方に合わせる。

```ts
/**
 * 地域（原語）フィルタのE2E
 *
 * ストーリー: 既定ではアジア圏の作品が一覧に出ず、検索条件で表示に含められる
 *
 * API のレスポンスを差し替えて検証する。本番DBの中身に依存させると、
 * 作品の入れ替わりでテストが壊れるため
 */

import { test, expect } from '@playwright/test';

/** 一覧APIを固定のレスポンスに差し替える */
async function stubMovies(
  page: import('@playwright/test').Page,
  movies: { id: number; title: string }[],
) {
  await page.route('**/api/movies?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          movies: movies.map((m) => ({
            ...m,
            poster_path: null,
            backdrop_path: null,
            release_date: '2026-12-01',
            overview: '',
            vote_average: 7,
            vote_count: 100,
            popularity: 10,
            genre_ids: [28],
            release_type: 'theatrical',
            is_now_playing: false,
            is_revival: false,
            digital_release_date: null,
          })),
          genres: { 28: 'アクション' },
          pagination: { page: 1, totalPages: 1, nextPage: null },
        },
      }),
    });
  });
}

test.describe('地域フィルタ', () => {
  test('既定では include_regions を送らない（APIが3地域を除外する）', async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/movies?')) requests.push(req.url());
    });
    await stubMovies(page, [{ id: 1, title: '普通の映画' }]);

    await page.goto('/movies/upcoming');
    await expect(page.getByText('普通の映画')).toBeVisible();

    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((url) => !url.includes('include_regions'))).toBe(
      true,
    );
  });

  test('既定では韓国作品が一覧に出ず、韓国を選ぶと出る', async ({ page }) => {
    // APIの既定は3地域を除外するため、スタブ側でも同じ振る舞いを再現する
    await page.route('**/api/movies?**', async (route) => {
      const includesKorea = route.request().url().includes('include_regions');
      const movies = includesKorea
        ? [
            { id: 1, title: '普通の映画' },
            { id: 2, title: 'ハイジャック作戦' },
          ]
        : [{ id: 1, title: '普通の映画' }];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            movies: movies.map((m) => ({
              ...m,
              poster_path: null,
              backdrop_path: null,
              release_date: '2026-12-01',
              overview: '',
              vote_average: 7,
              vote_count: 100,
              popularity: 10,
              genre_ids: [28],
              release_type: 'theatrical',
              is_now_playing: false,
              is_revival: false,
              digital_release_date: null,
            })),
            genres: { 28: 'アクション' },
            pagination: { page: 1, totalPages: 1, nextPage: null },
          },
        }),
      });
    });

    await page.goto('/movies/upcoming');
    await expect(page.getByText('普通の映画')).toBeVisible();
    await expect(page.getByText('ハイジャック作戦')).toHaveCount(0);

    await page.getByRole('button', { name: '絞り込み' }).click();
    await page.getByRole('checkbox', { name: '韓国' }).check();
    await page.getByRole('button', { name: '適用' }).click();

    await expect(page.getByText('ハイジャック作戦')).toBeVisible();
    await expect(page).toHaveURL(/include_regions=korea/);
  });

  test('結果が0件なら空状態を表示する', async ({ page }) => {
    await stubMovies(page, []);

    await page.goto('/movies/upcoming');

    await expect(page.getByText('普通の映画')).toHaveCount(0);
    // 空状態の文言は movieListContent の実装に合わせる
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('リロードしても選んだ地域が保持される', async ({ page }) => {
    await stubMovies(page, [{ id: 1, title: '普通の映画' }]);

    await page.goto('/movies/upcoming?include_regions=korea');
    await page.getByRole('button', { name: '絞り込み' }).click();

    await expect(page.getByRole('checkbox', { name: '韓国' })).toBeChecked();
  });

  test('キーボードだけで地域を選択できる', async ({ page }) => {
    await stubMovies(page, [{ id: 1, title: '普通の映画' }]);

    await page.goto('/movies/upcoming');
    await page.getByRole('button', { name: '絞り込み' }).click();

    const korea = page.getByRole('checkbox', { name: '韓国' });
    await korea.focus();
    await page.keyboard.press('Space');

    await expect(korea).toBeChecked();
  });

  test('配信タブでも地域セクションが使える', async ({ page }) => {
    await stubMovies(page, [{ id: 1, title: '普通の映画' }]);

    await page.goto('/movies/upcoming?release_type=streaming');
    await page.getByRole('button', { name: '絞り込み' }).click();

    await expect(
      page.getByRole('checkbox', { name: 'タイ・インド' }),
    ).toBeVisible();
  });
});
```

「絞り込み」ボタンの名前は `movieListToolbar.tsx` の実装に、空状態の文言は
`movieListContent.tsx` の実装に合わせる。一覧APIのレスポンス形も
`src/lib/api/movies/movies.ts` の型に合わせる（上記は雛形）。

- [ ] **Step 2: E2E を実行する**

Run: `npx playwright test e2e/movies/regionFilter.spec.ts`
Expected: 6件 PASS

- [ ] **Step 3: シナリオのスクリーンショットを取得する**

`.claude/CLAUDE.md` の「E2E結果のスクショをPRに添付」に従い、
`docs/e2e-screenshots/` にコミットする。ファイル名はシナリオ単位で安定させ、
再取得時は上書きする。

```bash
node scripts/pr-visual.mjs shot http://localhost:3000/movies/upcoming \
  docs/e2e-screenshots/region-filter-default.png
node scripts/pr-visual.mjs shot "http://localhost:3000/movies/upcoming?include_regions=korea" \
  docs/e2e-screenshots/region-filter-korea-included.png
```

PR本文にはコミットSHA固定の permalink で埋め込む
（`https://github.com/Fn-front/movie-app/blob/<commit-sha>/docs/e2e-screenshots/<file>.png?raw=true`）。
`<branch>` 指定はマージ後のブランチ削除でリンク切れになるため使わない。

- [ ] **Step 4: 全テストとビルドを確認する**

Run: `npx jest --coverage && npx tsc --noEmit && npx eslint src && npx next build`
Expected: すべて成功。カバレッジは全指標 80% 以上

- [ ] **Step 5: コミット**

```bash
git add e2e/movies/regionFilter.spec.ts docs/e2e-screenshots
git commit -m "test(movies): 地域フィルタのE2Eを追加する"
```

---

## 完了後の作業

- [ ] Issue を作成する（本文は `.claude/documents/region-filter-design.md` の内容を要約し、完了条件を列挙）
- [ ] `.claude/documents/roadmap/` に該当タスクがあるか確認し、あればチェックボックスを
      `- [x]` に更新してコミットに含める（`.claude/CLAUDE.md` の必須ルール）。
      新規機能で該当が無ければ、その旨を PR の「ロードマップ」節に書く
- [ ] PR を作成する（`--assignee Fn-front`、`Closes #<issue>`、概要 / ロードマップ / レビューポイント / テスト の4節）
- [ ] **E2E 結果のスクショ**を PR 本文に埋め込む（Task 12 Step 3 で `docs/e2e-screenshots/`
      にコミット済み。コミットSHA固定の permalink を使う）
- [ ] **画面修正の Before/After とデモ動画**を `.claude/rules/visual-evidence.md` の手順
      （`scripts/pr-visual.mjs` + gh-image の user-attachments）で PR に添付する。
      こちらはリポジトリにコミットしない
- [ ] マージ承認を待つ（`gh pr merge` は許可があるまで実行しない）
