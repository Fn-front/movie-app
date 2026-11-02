# ウォッチリスト 配信開始の優先表示（PR1: 追跡基盤 + 優先表示）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ウォッチリストの未視聴作品の配信状況を毎日追い、配信中の作品を一覧の先頭に出して、カードに提供形態とサービスのロゴを表示する。

**Architecture:** 作品単位の `movie_streaming_status` テーブルに配信状況と「この配信期間がいつ始まったか」を保存する。状態遷移は純粋関数に切り出してテストし、cron は TMDb 問い合わせと DB 更新だけを担う。並び替えは `get_watchlist_sorted` RPC を差し替えて行い、ウォッチリストページだけが優先表示を有効にする。

**Tech Stack:** Next.js (App Router) / TypeScript / Supabase (PostgREST + RPC) / TMDb API / TanStack Query / SCSS Modules / Jest + React Testing Library / Playwright

**Spec:** `docs/superpowers/specs/2026-11-01-watchlist-streaming-priority-design.md`

## Global Constraints

- 会話・コメント・UI 文言はすべて日本語。
- ファイル名は lowerCamelCase、コンポーネントは PascalCase、API Route は kebab-case。
- テストは対象ファイルと同じディレクトリに `<filename>.test.ts(x)`。カバレッジは全指標 80% 以上。
- React コンポーネントは `React.memo` + `displayName` 必須。イベントハンドラーは `useCallback` 必須。
- クラス名結合は `cn()`（`@/utils/cn`）。SCSS Modules を使い、HTML タグを直接セレクタにしない。デザインシステム変数を使い値を直書きしない。
- アクセシビリティは WCAG AA 準拠。テストはアクセシビリティ優先クエリを使う。
- スキーマ変更は `supabase migration new` でファイルを作り `supabase db push` で適用。ダッシュボードでの直接変更は禁止。
- **新規テーブルには `ENABLE ROW LEVEL SECURITY` と明示的な `GRANT` が必須。** GRANT が無いと PostgREST は `42501` を返す。
- 関数には `SET search_path = public, pg_temp` を付け、`REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` + 必要ロールへの `GRANT EXECUTE` を同じマイグレーションに書く。
- **型を再生成したら `npx prettier --write src/types/database.types.ts` まで行う。** 生成物は Prettier 未適用で出るため、忘れると CI の Prettier Check が落ちる。
- `withAuth` は `createServiceRoleClient()` を使うため **RLS はバイパスされる**。他ユーザーの行を守るのはクエリの `user_id` 条件だけ。
- 再配信とみなす閾値は **7日**（`STREAMING_RESUME_THRESHOLD_DAYS`）。
- 作業ブランチは `feature/watchlist-streaming-priority`（main 起点の worktree、作成済み）。
- PR1 では**ユーザー設定を作らない**。配信の判定は `any`（見放題・レンタル・購入のいずれか）で固定する。

---

### Task 1: 配信状態の遷移ロジック（純粋関数）

状態遷移がこの機能の肝なので、DB にも TMDb にも触らない純粋関数に切り出してテストする。

**Files:**

- Create: `src/lib/sync/resolveStreamingStatus.ts`
- Create: `src/lib/sync/resolveStreamingStatus.test.ts`
- Modify: `src/constants/movies.ts`（末尾に定数を追記）

**Interfaces:**

- Consumes: なし
- Produces:

```ts
/** 1つの提供形態（見放題 or 有料）の保存済み状態 */
export interface StreamingOfferState {
  providerIds: number[];
  since: string | null;
  lastSeenAt: string | null;
  resumed: boolean;
}

export function resolveStreamingOffer(
  previous: StreamingOfferState | null,
  currentProviderIds: number[],
  now: Date,
): StreamingOfferState;
```

- [ ] **Step 1: 定数を追加する**

`src/constants/movies.ts` の末尾に追記する。

```ts
/**
 * 配信が途切れてから再開したとき、「再配信」とみなす日数
 *
 * プロバイダー移行の過渡期や TMDb のデータが1日欠けただけで
 * 「配信終了 → 再開」と誤検知すると、継続配信中の作品が最上位に浮上する。
 * この日数未満の欠落は一時的なものとみなし、配信期間の開始日時を保つ。
 *
 * 再配信と誤判定しても先頭グループの末尾に回るだけなので、
 * この値が多少ズレても実害は小さい。
 */
export const STREAMING_RESUME_THRESHOLD_DAYS = 7;
```

- [ ] **Step 2: 失敗するテストを書く**

`src/lib/sync/resolveStreamingStatus.test.ts` を作る。

```ts
/**
 * 配信状態の遷移ロジック テスト
 */

import { resolveStreamingOffer } from './resolveStreamingStatus';
import type { StreamingOfferState } from './resolveStreamingStatus';

const NOW = new Date('2026-11-01T12:00:00Z');

/** 日数を引いた ISO 文字列を作る */
const daysAgo = (days: number): string =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe('resolveStreamingOffer', () => {
  describe('初めて配信を確認したとき', () => {
    it('since に現在時刻を記録する', () => {
      const result = resolveStreamingOffer(null, [8, 84], NOW);

      expect(result.providerIds).toEqual([8, 84]);
      expect(result.since).toBe(NOW.toISOString());
      expect(result.lastSeenAt).toBe(NOW.toISOString());
      expect(result.resumed).toBe(false);
    });

    it('保存済みの状態はあるが since が無いときも初配信として扱う', () => {
      const previous: StreamingOfferState = {
        providerIds: [],
        since: null,
        lastSeenAt: null,
        resumed: false,
      };

      const result = resolveStreamingOffer(previous, [8], NOW);

      expect(result.since).toBe(NOW.toISOString());
      expect(result.resumed).toBe(false);
    });
  });

  describe('配信が続いているとき', () => {
    it('since を変えずに lastSeenAt だけ進める', () => {
      const previous: StreamingOfferState = {
        providerIds: [8],
        since: daysAgo(30),
        lastSeenAt: daysAgo(1),
        resumed: false,
      };

      const result = resolveStreamingOffer(previous, [8, 84], NOW);

      expect(result.since).toBe(daysAgo(30));
      expect(result.lastSeenAt).toBe(NOW.toISOString());
      expect(result.providerIds).toEqual([8, 84]);
    });

    it('resumed の値を引き継ぐ', () => {
      const previous: StreamingOfferState = {
        providerIds: [8],
        since: daysAgo(10),
        lastSeenAt: daysAgo(1),
        resumed: true,
      };

      const result = resolveStreamingOffer(previous, [8], NOW);

      expect(result.resumed).toBe(true);
    });
  });

  describe('配信が見えなくなったとき', () => {
    it('providerIds は空にするが since と lastSeenAt は保つ', () => {
      const previous: StreamingOfferState = {
        providerIds: [8],
        since: daysAgo(30),
        lastSeenAt: daysAgo(1),
        resumed: false,
      };

      const result = resolveStreamingOffer(previous, [], NOW);

      expect(result.providerIds).toEqual([]);
      expect(result.since).toBe(daysAgo(30));
      expect(result.lastSeenAt).toBe(daysAgo(1));
      expect(result.resumed).toBe(false);
    });

    it('一度も配信が無かった作品は空のままにする', () => {
      const result = resolveStreamingOffer(null, [], NOW);

      expect(result.providerIds).toEqual([]);
      expect(result.since).toBeNull();
      expect(result.lastSeenAt).toBeNull();
      expect(result.resumed).toBe(false);
    });
  });

  describe('途切れてから復活したとき', () => {
    it('7日未満の欠落なら since を保ち、再配信にしない', () => {
      const previous: StreamingOfferState = {
        providerIds: [],
        since: daysAgo(30),
        lastSeenAt: daysAgo(2),
        resumed: false,
      };

      const result = resolveStreamingOffer(previous, [8], NOW);

      expect(result.since).toBe(daysAgo(30));
      expect(result.resumed).toBe(false);
      expect(result.lastSeenAt).toBe(NOW.toISOString());
    });

    it('7日以上空いていたら since を更新して再配信にする', () => {
      const previous: StreamingOfferState = {
        providerIds: [],
        since: daysAgo(100),
        lastSeenAt: daysAgo(30),
        resumed: false,
      };

      const result = resolveStreamingOffer(previous, [8], NOW);

      expect(result.since).toBe(NOW.toISOString());
      expect(result.resumed).toBe(true);
    });

    it('ちょうど7日の欠落は再配信として扱う', () => {
      const previous: StreamingOfferState = {
        providerIds: [],
        since: daysAgo(100),
        lastSeenAt: daysAgo(7),
        resumed: false,
      };

      const result = resolveStreamingOffer(previous, [8], NOW);

      expect(result.since).toBe(NOW.toISOString());
      expect(result.resumed).toBe(true);
    });

    it('一度再配信になった作品が継続してもフラグは下りない', () => {
      const previous: StreamingOfferState = {
        providerIds: [],
        since: daysAgo(5),
        lastSeenAt: daysAgo(1),
        resumed: true,
      };

      const result = resolveStreamingOffer(previous, [8], NOW);

      expect(result.resumed).toBe(true);
    });
  });
});
```

- [ ] **Step 3: テストを実行して落ちることを確認**

Run: `npx jest src/lib/sync/resolveStreamingStatus.test.ts`
Expected: FAIL（`./resolveStreamingStatus` が存在しない）

- [ ] **Step 4: 実装する**

`src/lib/sync/resolveStreamingStatus.ts` を作る。

```ts
/**
 * 配信状態の遷移ロジック
 *
 * DB にも TMDb にも触らない純粋関数として切り出している。
 * この機能の難しさは「一時的な欠落」と「本当の配信終了 → 再配信」の
 * 区別に集中しており、そこだけを単体でテストできるようにするため。
 */

import { STREAMING_RESUME_THRESHOLD_DAYS } from '@/constants/movies';

/**
 * 1つの提供形態（見放題 or 有料）の保存済み状態
 */
export interface StreamingOfferState {
  /** 今配信しているプロバイダーID。空なら現在は観られない */
  providerIds: number[];
  /** 今の配信期間がいつ始まったか。一度も配信が無ければ null */
  since: string | null;
  /** 最後に配信を確認した日時 */
  lastSeenAt: string | null;
  /** 一度途切れたあとの再配信か */
  resumed: boolean;
}

/** 空の状態（一度も配信を確認していない） */
const EMPTY_STATE: StreamingOfferState = {
  providerIds: [],
  since: null,
  lastSeenAt: null,
  resumed: false,
};

/** ミリ秒単位の再配信しきい値 */
const RESUME_THRESHOLD_MS =
  STREAMING_RESUME_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

/**
 * 今回の問い合わせ結果から、保存すべき配信状態を求める
 *
 * `since` は配信が見えなくなっても消さない。「配信終了をいつ確定させるか」を
 * 決めずに済ませるためで、現在観られるかは `providerIds` が空かどうかで表す。
 * これにより、データが1日欠けただけで継続配信中の作品が最上位へ浮上することを防ぐ。
 *
 * @param previous - 保存済みの状態。未登録なら null
 * @param currentProviderIds - 今回確認できたプロバイダーID（空なら配信なし）
 * @param now - 現在時刻
 * @returns 保存すべき状態
 */
export function resolveStreamingOffer(
  previous: StreamingOfferState | null,
  currentProviderIds: number[],
  now: Date,
): StreamingOfferState {
  const state = previous ?? EMPTY_STATE;

  // 今回は配信を確認できなかった。
  // 現在観られないことだけ反映し、配信期間の記録には触れない
  if (currentProviderIds.length === 0) {
    return { ...state, providerIds: [] };
  }

  const nowIso = now.toISOString();

  // 一度も配信が無かった作品。今回が初配信
  if (state.since === null) {
    return {
      providerIds: currentProviderIds,
      since: nowIso,
      lastSeenAt: nowIso,
      resumed: false,
    };
  }

  // 前回も配信中だった。期間は続いているので since は動かさない
  if (state.providerIds.length > 0) {
    return {
      providerIds: currentProviderIds,
      since: state.since,
      lastSeenAt: nowIso,
      resumed: state.resumed,
    };
  }

  // 空から復活した。空いた期間でが一時的な欠落か再配信かを分ける
  const lastSeenTime = state.lastSeenAt
    ? new Date(state.lastSeenAt).getTime()
    : 0;
  const isResumed = now.getTime() - lastSeenTime >= RESUME_THRESHOLD_MS;

  return {
    providerIds: currentProviderIds,
    since: isResumed ? nowIso : state.since,
    lastSeenAt: nowIso,
    resumed: isResumed ? true : state.resumed,
  };
}
```

- [ ] **Step 5: テストを実行して通ることを確認**

Run: `npx jest src/lib/sync/resolveStreamingStatus.test.ts`
Expected: PASS（11件）

- [ ] **Step 6: コミット**

```bash
git add src/lib/sync/resolveStreamingStatus.ts src/lib/sync/resolveStreamingStatus.test.ts src/constants/movies.ts
git commit -m "feat(watchlist): 配信状態の遷移ロジックを追加"
```

---

### Task 2: `movie_streaming_status` テーブル

**Files:**

- Create: `supabase/migrations/<timestamp>_add_movie_streaming_status.sql`
- Modify: `src/types/database.types.ts`（自動生成。手で編集しない）

**Interfaces:**

- Consumes: なし
- Produces: テーブル `public.movie_streaming_status`

| 列                                            | 型                               |
| --------------------------------------------- | -------------------------------- |
| `tmdb_movie_id`                               | `INTEGER PRIMARY KEY`            |
| `flatrate_provider_ids`                       | `JSONB NOT NULL DEFAULT '[]'`    |
| `paid_provider_ids`                           | `JSONB NOT NULL DEFAULT '[]'`    |
| `flatrate_since` / `paid_since`               | `TIMESTAMPTZ`                    |
| `flatrate_last_seen_at` / `paid_last_seen_at` | `TIMESTAMPTZ`                    |
| `flatrate_resumed` / `paid_resumed`           | `BOOLEAN NOT NULL DEFAULT FALSE` |
| `checked_at`                                  | `TIMESTAMPTZ NOT NULL`           |

- [ ] **Step 1: マイグレーションを作る**

```bash
npx supabase migration new add_movie_streaming_status
```

生成されたファイルに以下を書く。

```sql
-- ウォッチリストの作品の配信状況を追う
--
-- 背景:
--   movie_cache の配信情報は TMDb Discover 由来で、人気度と公開日ウィンドウで
--   絞られている。実測ではウォッチリストの未視聴26件のうち、movie_cache で
--   配信状況が分かるのは1件だけだった。ウォッチリストの作品を直接
--   問い合わせる置き場所が要る。
--
-- 作品単位で持つ理由:
--   同じ映画を複数ユーザーがウォッチリストに入れていても、TMDb への
--   問い合わせは1回で済む。ユーザーに紐づく情報は持たない。
--
-- rent と buy を paid にまとめる理由:
--   実測で「購入のみ」は0件。UI でも「レンタル」の一語で足り、
--   分けても表示に差が出ない。
--
-- since を消さない理由:
--   「配信終了をいつ確定させるか」を決めずに済ませるため。現在観られるかは
--   provider_ids が空かどうかで表し、since は並び順にだけ使う。
--   これにより TMDb のデータが1日欠けても、継続配信中の作品が
--   最上位へ再浮上しない。

CREATE TABLE IF NOT EXISTS public.movie_streaming_status (
  tmdb_movie_id INTEGER PRIMARY KEY,
  flatrate_provider_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  paid_provider_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  flatrate_since TIMESTAMPTZ,
  paid_since TIMESTAMPTZ,
  flatrate_last_seen_at TIMESTAMPTZ,
  paid_last_seen_at TIMESTAMPTZ,
  flatrate_resumed BOOLEAN NOT NULL DEFAULT FALSE,
  paid_resumed BOOLEAN NOT NULL DEFAULT FALSE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.movie_streaming_status IS
  'ウォッチリストの作品の日本での配信状況。作品単位で持ち、ユーザーには紐づかない。';
COMMENT ON COLUMN public.movie_streaming_status.flatrate_since IS
  '今の見放題期間がいつ始まったか。配信が見えなくなっても消さない（並び順に使う）。';
COMMENT ON COLUMN public.movie_streaming_status.flatrate_resumed IS
  '一度途切れたあとの再配信か。TRUE の作品は先頭グループの末尾へ送る。';

-- 配信中の作品を引くための部分インデックス。
-- JSONB の空配列判定はインデックスに乗らないため、式インデックスにする
CREATE INDEX IF NOT EXISTS idx_movie_streaming_status_flatrate_since
  ON public.movie_streaming_status (flatrate_since DESC)
  WHERE flatrate_provider_ids <> '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_movie_streaming_status_paid_since
  ON public.movie_streaming_status (paid_since DESC)
  WHERE paid_provider_ids <> '[]'::jsonb;

-- --------------------------------------------
-- RLS と権限
-- --------------------------------------------
--
-- GRANT が無いと PostgREST は 42501 を返す（.claude/rules/supabase-db.md）。
-- 作品単位の情報でユーザーには紐づかないため、authenticated は読み取りのみ。
-- 書き込みは cron と API（service role）だけが行う。
-- anon には付与しない（未認証で見る画面にこの情報は出ない）。

ALTER TABLE public.movie_streaming_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY movie_streaming_status_select_authenticated
  ON public.movie_streaming_status
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.movie_streaming_status TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movie_streaming_status TO service_role;
```

- [ ] **Step 2: 適用対象を確認する**

```bash
npx supabase db push --dry-run
```

Expected: 対象が今回作ったファイル1件だけであること。

`LegacyDbPushMissingLocalError` が出たら `.claude/rules/supabase-db.md` の
「安全な回避手順」に従う。**`migration repair --status reverted` は実行しない。**

- [ ] **Step 3: 適用する**

```bash
npx supabase db push
```

Expected: 成功。エラーが出たら止めて報告する。

- [ ] **Step 4: 型を再生成して整形する**

```bash
npx supabase gen types typescript --project-id <project-id> > src/types/database.types.ts
npx prettier --write src/types/database.types.ts
grep -n "movie_streaming_status" src/types/database.types.ts
```

`<project-id>` は `cat supabase/.temp/project-ref` で確認する。
差分が RLS/テーブル追加分だけになっていることを `git diff --stat` で確認する。

- [ ] **Step 5: 権限を実測する**

`docs/tmp/check-grants.mjs` を作って実行する（`docs/tmp` は gitignore 対象）。

```js
import { createClient } from '@supabase/supabase-js';
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

const service = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const { error: svcErr } = await service
  .from('movie_streaming_status')
  .select('tmdb_movie_id')
  .limit(1);
console.log(
  'service_role の読み取り:',
  svcErr ? `ERROR ${svcErr.message}` : 'OK',
);

const anon = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const { error: anonErr } = await anon
  .from('movie_streaming_status')
  .select('tmdb_movie_id')
  .limit(1);
console.log(
  'anon の読み取り:',
  anonErr ? `拒否 (${anonErr.code ?? ''})` : '⚠️ 読めてしまう',
);
```

Run: `node docs/tmp/check-grants.mjs`
Expected: service_role は OK、anon は拒否。

- [ ] **Step 6: 型チェックとコミット**

```bash
npx tsc --noEmit
git add supabase/migrations/ src/types/database.types.ts
git commit -m "feat(watchlist): 作品の配信状況を保存するテーブルを追加"
```

---

### Task 3: 配信状況の同期処理

**Files:**

- Create: `src/lib/sync/syncWatchlistStreaming.ts`
- Create: `src/lib/sync/syncWatchlistStreaming.test.ts`

**Interfaces:**

- Consumes: `resolveStreamingOffer`（Task 1）、テーブル `movie_streaming_status`（Task 2）、既存 `getJpStreamingAvailability(movieId)`
- Produces:

```ts
export interface WatchlistStreamingSyncResult {
  /** 問い合わせ対象のユニーク映画数 */
  targets: number;
  /** 更新に成功した映画数 */
  updated: number;
  /** 今回新たに配信を確認した映画数 */
  newlyAvailable: number;
  /** TMDb 問い合わせに失敗した映画数 */
  failed: number;
  /** 実行時間（ミリ秒） */
  durationMs: number;
  errors: string[];
}

export function syncWatchlistStreaming(): Promise<WatchlistStreamingSyncResult>;
```

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/sync/syncWatchlistStreaming.test.ts` を作る。

```ts
/**
 * ウォッチリストの配信状況 同期処理 テスト
 */

import { syncWatchlistStreaming } from './syncWatchlistStreaming';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}));

const mockGetJpStreamingAvailability = jest.fn();
jest.mock('@/lib/tmdb/tmdb', () => ({
  getJpStreamingAvailability: (...args: unknown[]) =>
    mockGetJpStreamingAvailability(...args),
}));

// --- Helpers ---

/** watchlist の取得 → movie_streaming_status の取得 → upsert をモックする */
const mockTables = (options: {
  watchlistRows: Array<{ tmdb_movie_id: number }>;
  statusRows?: Array<Record<string, unknown>>;
  upsertError?: { message: string } | null;
}) => {
  mockFrom.mockReset();
  upsertedRows.length = 0;

  mockFrom.mockImplementation((table: string) => {
    if (table === 'watchlist') {
      return {
        select: () => ({
          is: () => ({
            is: () =>
              Promise.resolve({ data: options.watchlistRows, error: null }),
          }),
        }),
      };
    }
    if (table === 'movie_streaming_status') {
      return {
        select: () => ({
          in: () =>
            Promise.resolve({ data: options.statusRows ?? [], error: null }),
        }),
        upsert: (rows: Array<Record<string, unknown>>) => {
          upsertedRows.push(...rows);
          return Promise.resolve({
            error: options.upsertError ?? null,
          });
        },
      };
    }
    throw new Error(`想定外のテーブル: ${table}`);
  });
};

/** upsert に渡された行を記録する */
const upsertedRows: Array<Record<string, unknown>> = [];

const availability = (
  flatrate: number[],
  rent: number[] = [],
  buy: number[] = [],
) => ({
  isCurrentlyStreaming: flatrate.length + rent.length + buy.length > 0,
  digitalReleaseDate: null,
  keywordIds: [],
  watchProviderIds: { flatrate, rent, buy },
});

// --- Tests ---

describe('syncWatchlistStreaming', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  });

  it('未視聴の作品を重複排除して問い合わせる', async () => {
    mockTables({
      watchlistRows: [
        { tmdb_movie_id: 100 },
        { tmdb_movie_id: 100 },
        { tmdb_movie_id: 200 },
      ],
    });
    mockGetJpStreamingAvailability.mockResolvedValue(availability([8]));

    const result = await syncWatchlistStreaming();

    expect(result.targets).toBe(2);
    expect(mockGetJpStreamingAvailability).toHaveBeenCalledTimes(2);
  });

  it('rent と buy をまとめて paid として保存する', async () => {
    mockTables({ watchlistRows: [{ tmdb_movie_id: 100 }] });
    mockGetJpStreamingAvailability.mockResolvedValue(
      availability([], [84], [10]),
    );

    await syncWatchlistStreaming();

    const row = upsertedRows[0];
    expect(row.flatrate_provider_ids).toEqual([]);
    expect(row.paid_provider_ids).toEqual([84, 10]);
  });

  it('rent と buy に同じプロバイダーがいても重複させない', async () => {
    mockTables({ watchlistRows: [{ tmdb_movie_id: 100 }] });
    mockGetJpStreamingAvailability.mockResolvedValue(
      availability([], [84], [84]),
    );

    await syncWatchlistStreaming();

    expect(upsertedRows[0].paid_provider_ids).toEqual([84]);
  });

  it('初めて配信を確認した作品を newlyAvailable に数える', async () => {
    mockTables({ watchlistRows: [{ tmdb_movie_id: 100 }] });
    mockGetJpStreamingAvailability.mockResolvedValue(availability([8]));

    const result = await syncWatchlistStreaming();

    expect(result.newlyAvailable).toBe(1);
    expect(upsertedRows[0].flatrate_since).toEqual(expect.any(String));
  });

  it('既に配信中の作品は since を引き継ぐ', async () => {
    const existingSince = '2026-01-01T00:00:00.000Z';
    mockTables({
      watchlistRows: [{ tmdb_movie_id: 100 }],
      statusRows: [
        {
          tmdb_movie_id: 100,
          flatrate_provider_ids: [8],
          paid_provider_ids: [],
          flatrate_since: existingSince,
          paid_since: null,
          flatrate_last_seen_at: '2026-10-31T00:00:00.000Z',
          paid_last_seen_at: null,
          flatrate_resumed: false,
          paid_resumed: false,
        },
      ],
    });
    mockGetJpStreamingAvailability.mockResolvedValue(availability([8]));

    const result = await syncWatchlistStreaming();

    expect(upsertedRows[0].flatrate_since).toBe(existingSince);
    expect(result.newlyAvailable).toBe(0);
  });

  it('TMDb の問い合わせに失敗した作品は更新しない（空に倒さない）', async () => {
    mockTables({
      watchlistRows: [{ tmdb_movie_id: 100 }, { tmdb_movie_id: 200 }],
    });
    mockGetJpStreamingAvailability
      .mockResolvedValueOnce(availability([8]))
      .mockRejectedValueOnce(new Error('TMDb error'));

    const result = await syncWatchlistStreaming();

    expect(result.failed).toBe(1);
    expect(result.updated).toBe(1);
    expect(upsertedRows).toHaveLength(1);
    expect(upsertedRows[0].tmdb_movie_id).toBe(100);
  });

  it('対象が0件なら TMDb を呼ばない', async () => {
    mockTables({ watchlistRows: [] });

    const result = await syncWatchlistStreaming();

    expect(result.targets).toBe(0);
    expect(mockGetJpStreamingAvailability).not.toHaveBeenCalled();
  });

  it('upsert が失敗したらエラーを記録する', async () => {
    mockTables({
      watchlistRows: [{ tmdb_movie_id: 100 }],
      upsertError: { message: 'boom' },
    });
    mockGetJpStreamingAvailability.mockResolvedValue(availability([8]));

    const result = await syncWatchlistStreaming();

    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('Supabase の環境変数が無ければ例外を投げる', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    await expect(syncWatchlistStreaming()).rejects.toThrow(
      'Supabase環境変数が設定されていません',
    );
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx jest src/lib/sync/syncWatchlistStreaming.test.ts`
Expected: FAIL（`./syncWatchlistStreaming` が存在しない）

- [ ] **Step 3: 実装する**

`src/lib/sync/syncWatchlistStreaming.ts` を作る。

```ts
/**
 * ウォッチリストの未視聴作品について、日本での配信状況を同期する
 *
 * movie_cache の配信情報は TMDb Discover 由来で、人気度と公開日ウィンドウで
 * 絞られている。実測ではウォッチリストの未視聴26件のうち movie_cache で
 * 配信状況が分かるのは1件だけだったため、ウォッチリストの作品は
 * 直接 TMDb に問い合わせる。
 *
 * 状態遷移（初配信 / 継続 / 一時的な欠落 / 再配信）の判定は
 * resolveStreamingOffer に切り出してある。
 */

import { createClient } from '@supabase/supabase-js';

import { TMDB_AVAILABILITY_CONCURRENCY } from '@/constants/tmdb';
import { getJpStreamingAvailability } from '@/lib/tmdb/tmdb';
import {
  resolveStreamingOffer,
  type StreamingOfferState,
} from '@/lib/sync/resolveStreamingStatus';

/**
 * 同期結果
 */
export interface WatchlistStreamingSyncResult {
  /** 問い合わせ対象のユニーク映画数 */
  targets: number;
  /** 更新に成功した映画数 */
  updated: number;
  /** 今回新たに配信を確認した映画数 */
  newlyAvailable: number;
  /** TMDb 問い合わせに失敗した映画数 */
  failed: number;
  /** 実行時間（ミリ秒） */
  durationMs: number;
  /** エラーメッセージ */
  errors: string[];
}

/** movie_streaming_status の1行 */
interface StatusRow {
  tmdb_movie_id: number;
  flatrate_provider_ids: number[];
  paid_provider_ids: number[];
  flatrate_since: string | null;
  paid_since: string | null;
  flatrate_last_seen_at: string | null;
  paid_last_seen_at: string | null;
  flatrate_resumed: boolean;
  paid_resumed: boolean;
}

/**
 * 配列を指定サイズのチャンクに分割する
 */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * 保存済み行を、形態ごとの状態に分解する
 */
function toOfferStates(row: StatusRow | undefined): {
  flatrate: StreamingOfferState | null;
  paid: StreamingOfferState | null;
} {
  if (!row) return { flatrate: null, paid: null };

  return {
    flatrate: {
      providerIds: row.flatrate_provider_ids ?? [],
      since: row.flatrate_since,
      lastSeenAt: row.flatrate_last_seen_at,
      resumed: row.flatrate_resumed,
    },
    paid: {
      providerIds: row.paid_provider_ids ?? [],
      since: row.paid_since,
      lastSeenAt: row.paid_last_seen_at,
      resumed: row.paid_resumed,
    },
  };
}

/**
 * ウォッチリストの未視聴作品の配信状況を同期する
 *
 * @returns 同期結果（メトリクス込み）
 */
export async function syncWatchlistStreaming(): Promise<WatchlistStreamingSyncResult> {
  const startedAt = Date.now();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase環境変数が設定されていません');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result: WatchlistStreamingSyncResult = {
    targets: 0,
    updated: 0,
    newlyAvailable: 0,
    failed: 0,
    durationMs: 0,
    errors: [],
  };

  // 全ユーザーの未視聴作品を集める。同じ映画は1回だけ問い合わせる
  const { data: watchlistRows, error: watchlistError } = await supabase
    .from('watchlist')
    .select('tmdb_movie_id')
    .is('deleted_at', null)
    .is('watched_at', null);

  if (watchlistError) {
    throw watchlistError;
  }

  const movieIds = [
    ...new Set((watchlistRows ?? []).map((row) => row.tmdb_movie_id)),
  ];
  result.targets = movieIds.length;

  if (movieIds.length === 0) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  // 保存済みの状態をまとめて引く
  const { data: statusRows, error: statusError } = await supabase
    .from('movie_streaming_status')
    .select('*')
    .in('tmdb_movie_id', movieIds);

  if (statusError) {
    throw statusError;
  }

  const statusById = new Map<number, StatusRow>(
    ((statusRows ?? []) as StatusRow[]).map((row) => [row.tmdb_movie_id, row]),
  );

  const now = new Date();
  const nowIso = now.toISOString();
  const rowsToUpsert: Record<string, unknown>[] = [];

  // TMDb のレート制限（50 req/s）に収めるため、同時実行数を絞って順に流す
  for (const batch of chunk(movieIds, TMDB_AVAILABILITY_CONCURRENCY)) {
    const settled = await Promise.all(
      batch.map(async (movieId) => {
        try {
          const availability = await getJpStreamingAvailability(movieId);
          return { movieId, availability, error: null as string | null };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          return { movieId, availability: null, error: message };
        }
      }),
    );

    for (const { movieId, availability, error } of settled) {
      // 問い合わせに失敗した作品は更新しない。
      // 空に倒すと TMDb の一時障害だけで全作品が「配信終了」扱いになる
      if (!availability) {
        result.failed++;
        result.errors.push(`availability ${movieId}: ${error}`);
        continue;
      }

      const previous = toOfferStates(statusById.get(movieId));

      // rent と buy は UI 上どちらも「レンタル」で足りるためまとめる
      const paidIds = [
        ...new Set([
          ...availability.watchProviderIds.rent,
          ...availability.watchProviderIds.buy,
        ]),
      ];

      const flatrate = resolveStreamingOffer(
        previous.flatrate,
        availability.watchProviderIds.flatrate,
        now,
      );
      const paid = resolveStreamingOffer(previous.paid, paidIds, now);

      const wasAvailable =
        (previous.flatrate?.providerIds.length ?? 0) > 0 ||
        (previous.paid?.providerIds.length ?? 0) > 0;
      const isAvailable =
        flatrate.providerIds.length > 0 || paid.providerIds.length > 0;

      if (!wasAvailable && isAvailable) {
        result.newlyAvailable++;
      }

      rowsToUpsert.push({
        tmdb_movie_id: movieId,
        flatrate_provider_ids: flatrate.providerIds,
        paid_provider_ids: paid.providerIds,
        flatrate_since: flatrate.since,
        paid_since: paid.since,
        flatrate_last_seen_at: flatrate.lastSeenAt,
        paid_last_seen_at: paid.lastSeenAt,
        flatrate_resumed: flatrate.resumed,
        paid_resumed: paid.resumed,
        checked_at: nowIso,
      });
    }
  }

  if (rowsToUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from('movie_streaming_status')
      .upsert(rowsToUpsert, { onConflict: 'tmdb_movie_id' });

    if (upsertError) {
      result.errors.push(`upsert: ${upsertError.message}`);
    } else {
      result.updated = rowsToUpsert.length;
    }
  }

  result.durationMs = Date.now() - startedAt;

  console.log(
    `[sync-watchlist-streaming] targets=${result.targets} ` +
      `updated=${result.updated} newlyAvailable=${result.newlyAvailable} ` +
      `failed=${result.failed} durationMs=${result.durationMs} ` +
      `errors=${result.errors.length}`,
  );

  return result;
}
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `npx jest src/lib/sync/syncWatchlistStreaming.test.ts`
Expected: PASS（9件）

モックの形が合わずに落ちる場合は、実装の呼び出し順
（`watchlist` を `select().is().is()` → `movie_streaming_status` を `select().in()` → `upsert()`）
にテスト側を合わせる。実装を変えてモックに寄せないこと。

- [ ] **Step 5: コミット**

```bash
git add src/lib/sync/syncWatchlistStreaming.ts src/lib/sync/syncWatchlistStreaming.test.ts
git commit -m "feat(watchlist): 未視聴作品の配信状況を同期する処理を追加"
```

---

### Task 4: cron ルートと実行設定

**Files:**

- Create: `src/app/api/cron/sync-watchlist-streaming/route.ts`
- Create: `src/app/api/cron/sync-watchlist-streaming/route.test.ts`
- Modify: `vercel.json`
- Modify: `src/constants/cron.ts`

**Interfaces:**

- Consumes: `syncWatchlistStreaming()`（Task 3）
- Produces: `GET /api/cron/sync-watchlist-streaming`

- [ ] **Step 1: エラーメッセージ定数を追加する**

`src/constants/cron.ts` の `CRON_ERROR_MESSAGES` に追記する。

```ts
  /** ウォッチリスト配信状況の同期エラー */
  SYNC_WATCHLIST_STREAMING:
    'ウォッチリストの配信状況同期中にエラーが発生しました。',
```

- [ ] **Step 2: 失敗するテストを書く**

`src/app/api/cron/sync-watchlist-streaming/route.test.ts` を作る。
既存の `src/app/api/cron/update-movies/route.test.ts` のモック構成に合わせること。

```ts
/**
 * @jest-environment node
 */

/**
 * ウォッチリスト配信状況 同期Cron API テスト (GET)
 */

import { NextRequest } from 'next/server';

import { GET } from './route';

// --- Mocks ---

const mockVerifyCronAuth = jest.fn();
jest.mock('@/helpers/cronAuth', () => ({
  verifyCronAuth: (...args: unknown[]) => mockVerifyCronAuth(...args),
}));

const mockSyncWatchlistStreaming = jest.fn();
jest.mock('@/lib/sync/syncWatchlistStreaming', () => ({
  syncWatchlistStreaming: (...args: unknown[]) =>
    mockSyncWatchlistStreaming(...args),
}));

// --- Helpers ---

const createRequest = () =>
  new NextRequest('http://localhost/api/cron/sync-watchlist-streaming');

const syncResult = {
  targets: 26,
  updated: 25,
  newlyAvailable: 3,
  failed: 1,
  durationMs: 1200,
  errors: [],
};

// --- Tests ---

describe('GET /api/cron/sync-watchlist-streaming', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(null);
    mockSyncWatchlistStreaming.mockResolvedValue(syncResult);
  });

  it('同期結果を返す', async () => {
    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.targets).toBe(26);
    expect(body.data.newlyAvailable).toBe(3);
  });

  it('認証に失敗したらそのレスポンスを返す', async () => {
    mockVerifyCronAuth.mockReturnValue(
      new Response(JSON.stringify({ success: false }), { status: 401 }),
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(mockSyncWatchlistStreaming).not.toHaveBeenCalled();
  });

  it('同期が失敗したら500を返す', async () => {
    mockSyncWatchlistStreaming.mockRejectedValue(new Error('boom'));

    const response = await GET(createRequest());

    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 3: テストを実行して落ちることを確認**

Run: `npx jest src/app/api/cron/sync-watchlist-streaming/`
Expected: FAIL（`./route` が存在しない）

- [ ] **Step 4: 実装する**

`src/app/api/cron/sync-watchlist-streaming/route.ts` を作る。

```ts
/**
 * ウォッチリスト配信状況 同期 Cron API
 * GET /api/cron/sync-watchlist-streaming
 *
 * Vercel Cron で毎日20:00（JST）に自動実行される。
 * sync-streaming（19:00）の後に回し、TMDb への問い合わせが重ならないようにする。
 * CRON_SECRET 環境変数による Bearer 認証が必要。
 */

import { NextRequest, NextResponse } from 'next/server';

import { HTTP_STATUS, CRON_ERROR_MESSAGES } from '@/constants';
import { verifyCronAuth } from '@/helpers/cronAuth';
import { handleRouteError } from '@/helpers/routeError';
import { syncWatchlistStreaming } from '@/lib/sync/syncWatchlistStreaming';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const result = await syncWatchlistStreaming();

    return NextResponse.json(
      {
        success: true,
        message: 'ウォッチリストの配信状況を同期しました。',
        data: result,
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    return handleRouteError(
      error,
      'Sync watchlist streaming error',
      CRON_ERROR_MESSAGES.SYNC_WATCHLIST_STREAMING,
    );
  }
}
```

- [ ] **Step 5: vercel.json に登録する**

`vercel.json` の `crons` 配列に追記する。`sync-streaming`（19:00）の後になるよう 20:00 にする。

```json
{
  "path": "/api/cron/sync-watchlist-streaming",
  "schedule": "0 20 * * *"
}
```

- [ ] **Step 6: テストを実行して通ることを確認**

Run: `npx jest src/app/api/cron/sync-watchlist-streaming/`
Expected: PASS（3件）

- [ ] **Step 7: 本番DBに対して1回実行して動作を確かめる**

cron を待たずに、dev サーバーを起動してルートを直接叩く。
同期処理は TypeScript なので node から直接 import できない。

worktree では先に `npm install` が要る。

```bash
npm install
npm run dev
```

別のコマンドで叩く。`docs/tmp/call-cron.mjs` を作る（`docs/tmp` は gitignore 対象）。

```js
// cron ルートを1回だけ叩いて同期結果を見る
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

const res = await fetch(
  'http://localhost:3000/api/cron/sync-watchlist-streaming',
  { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } },
);
console.log(res.status);
console.log(JSON.stringify(await res.json(), null, 2));
```

Run: `node docs/tmp/call-cron.mjs`

Expected: status 200。`targets` が実測の26前後、`newlyAvailable` が10〜15程度
（初回実行なので、配信中の作品がすべて「新たに配信を確認した」になる）。

`failed` が `targets` と同数なら TMDb の認証が通っていない。
`.env.local` の `TMDB_API_KEY` を確認する。

ここで入ったデータを Task 5 の並び順確認で使う。

- [ ] **Step 8: コミット**

```bash
git add src/app/api/cron/sync-watchlist-streaming/ vercel.json src/constants/cron.ts
git commit -m "feat(watchlist): 配信状況を同期するcronを追加"
```

---

### Task 5: 並び替え RPC の差し替え

**Files:**

- Create: `supabase/migrations/<timestamp>_prioritize_streaming_in_watchlist_sorted.sql`
- Modify: `src/types/database.types.ts`（自動生成）

**Interfaces:**

- Consumes: テーブル `movie_streaming_status`（Task 2）
- Produces: RPC `get_watchlist_sorted(p_user_id UUID, p_sort TEXT, p_limit INT, p_offset INT, p_exclude_watched BOOLEAN, p_prioritize_streaming BOOLEAN)`

戻り値に以下3列が増える。

| 列                       | 型        | 内容                                         |
| ------------------------ | --------- | -------------------------------------------- |
| `streaming_offer_type`   | `TEXT`    | `'flatrate'` / `'paid'` / `NULL`（配信なし） |
| `streaming_provider_ids` | `JSONB`   | 表示するプロバイダーID。配信なしなら `'[]'`  |
| `streaming_resumed`      | `BOOLEAN` | 再配信か                                     |

- [ ] **Step 1: マイグレーションを作る**

```bash
npx supabase migration new prioritize_streaming_in_watchlist_sorted
```

生成されたファイルに以下を書く。

```sql
-- ウォッチリストの並びで、配信中の未視聴作品を先頭に出せるようにする
--
-- 並び順:
--   ① 未視聴 × 配信中 × 初配信   ← since の新しい順
--   ② 未視聴 × 配信中 × 再配信   ← since の新しい順
--   ③ 未視聴 × 配信なし          ← 従来のソート
--   ④ 視聴済み                   ← 従来どおり最後
--
-- 再配信を②に下げる理由:
--   一度配信が終わった作品は「観る機会があったのに観なかった」ものであり、
--   初めて観られるようになった作品より優先度が低い。
--   副次的に、一時的な欠落を再配信と誤判定したときの害を吸収する
--   （誤判定しても最上位には来ず、先頭グループの末尾に回るだけで済む）。
--
-- p_prioritize_streaming を既定 FALSE にする理由:
--   この関数はサイドバーの「公開日が近い映画」でも使われている。
--   そこに配信中を先頭へ送る並びを持ち込むと見出しと中身が食い違うため、
--   ウォッチリストページの一覧取得だけが TRUE を渡す。
--
-- PR1 では「配信中」の判定を flatrate / paid のいずれかで固定する。
-- ユーザー設定による切り替えは PR2 で p_streaming_scope を足して行う。
--
-- 引数と戻り値が変わるため CREATE OR REPLACE では置き換えられない。
-- DROP してから作り直すので、権限は明示的に書き直す
-- （DROP → CREATE では既定付与が復活しうる）。

DROP FUNCTION IF EXISTS public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN);

CREATE FUNCTION public.get_watchlist_sorted(
  p_user_id UUID,
  p_sort TEXT,
  p_limit INT,
  p_offset INT DEFAULT 0,
  p_exclude_watched BOOLEAN DEFAULT FALSE,
  p_prioritize_streaming BOOLEAN DEFAULT FALSE
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
      -- 見放題とレンタルの両方で観られる場合は見放題を優先して見せる。
      -- 追加料金なしで観られる方が情報として強いため
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
      -- 並び順に使う「この配信期間がいつ始まったか」。
      -- 両方に値がある場合は新しい方を採る
      CASE
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          AND COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN GREATEST(s.flatrate_since, s.paid_since)
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          THEN s.flatrate_since
        WHEN COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN s.paid_since
        ELSE NULL
      END AS streaming_since
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
    -- 配信中を先頭へ。初配信（0）→ 再配信（1）→ 配信なし（2）
    CASE
      WHEN NOT p_prioritize_streaming THEN 0
      WHEN e.watched_at IS NOT NULL THEN 0
      WHEN e.streaming_offer_type IS NULL THEN 2
      WHEN e.streaming_resumed THEN 1
      ELSE 0
    END,
    -- 配信中グループ内は検知が新しい順
    CASE
      WHEN p_prioritize_streaming AND e.watched_at IS NULL
        AND e.streaming_offer_type IS NOT NULL
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

REVOKE EXECUTE ON FUNCTION public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN, BOOLEAN) IS
  'ウォッチリストを指定ソートで返す。視聴済みは常に最後。p_prioritize_streaming で配信中の未視聴を先頭に送る（サイドバーでは FALSE のまま使う）。EXECUTE は service_role のみ。';
```

- [ ] **Step 2: 適用対象を確認して適用する**

```bash
npx supabase db push --dry-run
npx supabase db push
```

Expected: 対象が今回作ったファイル1件だけで、成功すること。

- [ ] **Step 3: 型を再生成して整形する**

```bash
npx supabase gen types typescript --project-id <project-id> > src/types/database.types.ts
npx prettier --write src/types/database.types.ts
grep -n "p_prioritize_streaming" src/types/database.types.ts
```

- [ ] **Step 4: 既存テストが壊れていないことを確認する**

```bash
npx tsc --noEmit
npx jest src/app/api/watchlist/ src/features/watchlist/
```

Expected: どちらもエラーなし。

RPC の引数が増えたが、既存の呼び出しは `p_prioritize_streaming` を渡さず
既定の `FALSE` で動くため、サイドバーと一覧の並びは変わらない。

- [ ] **Step 5: 実データで並び順を確認する**

`docs/tmp/check-order.mjs` を作って実行する。

```js
import { createClient } from '@supabase/supabase-js';
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

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: users } = await supabase.from('users').select('id').limit(1);
const userId = users?.[0]?.id;

for (const prioritize of [false, true]) {
  const { data, error } = await supabase.rpc('get_watchlist_sorted', {
    p_user_id: userId,
    p_sort: 'added_at',
    p_limit: 10,
    p_offset: 0,
    p_exclude_watched: true,
    p_prioritize_streaming: prioritize,
  });

  console.log(`\n=== p_prioritize_streaming = ${prioritize} ===`);
  if (error) {
    console.log('ERROR', error.message);
    continue;
  }
  for (const row of data ?? []) {
    const badge = row.streaming_offer_type
      ? `[${row.streaming_offer_type}${row.streaming_resumed ? '/再' : ''}]`
      : '[--]';
    console.log(`  ${badge} ${row.title}`);
  }
}
```

Run: `node docs/tmp/check-order.mjs`
Expected:

- `false` のとき: 従来どおり追加日順（配信の有無で並びが変わらない）
- `true` のとき: `[flatrate]` と `[paid]` が先頭に集まり、`[--]` が後ろに来る

- [ ] **Step 6: コミット**

```bash
git add supabase/migrations/ src/types/database.types.ts
git commit -m "feat(watchlist): 配信中の未視聴を先頭に出せるよう並び替えRPCを差し替え"
```

---

### Task 6: API とクライアントへの配信情報の受け渡し

**Files:**

- Modify: `src/app/api/watchlist/route.ts:30-115`
- Modify: `src/app/api/watchlist/route.test.ts`
- Modify: `src/schema/watchlist.ts`
- Modify: `src/lib/api/watchlist/watchlist.ts`
- Modify: `src/features/watchlist/hooks/useWatchlist.ts`
- Modify: `src/features/watchlist/hooks/useWatchlistPage.ts`
- Modify: `src/constants/queryKeys.ts:23-27`

**Interfaces:**

- Consumes: RPC の新しい戻り列（Task 5）
- Produces:

```ts
/** ウォッチリストアイテムの配信情報 */
export interface WatchlistStreaming {
  offer_type: 'flatrate' | 'paid';
  provider_ids: number[];
  resumed: boolean;
}

// WatchlistItem に追加
interface WatchlistItem {
  // ...既存
  /** 配信情報。配信なしなら null */
  streaming: WatchlistStreaming | null;
}

// useWatchlist のオプションに追加
interface UseWatchlistOptions {
  // ...既存
  /** 配信中の未視聴を先頭に出すか（一覧ページのみ true） */
  prioritizeStreaming?: boolean;
}
```

- [ ] **Step 1: 失敗するテストを書く**

`src/app/api/watchlist/route.test.ts` に追記する。既存のモック構成に合わせること。
RPC の戻り行に新しい3列が含まれる形にする。

```ts
describe('配信情報', () => {
  it('配信中のアイテムに streaming を付けて返す', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'wl-1',
          tmdb_movie_id: 100,
          title: '映画A',
          poster_path: null,
          release_date: null,
          added_at: '2026-10-01T00:00:00Z',
          watched_at: null,
          streaming_offer_type: 'flatrate',
          streaming_provider_ids: [8, 84],
          streaming_resumed: false,
          total_count: 1,
        },
      ],
      error: null,
    });

    const response = await GET(createGetRequest());
    const body = await response.json();

    expect(body.data.watchlist[0].streaming).toEqual({
      offer_type: 'flatrate',
      provider_ids: [8, 84],
      resumed: false,
    });
  });

  it('配信なしのアイテムは streaming が null になる', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'wl-1',
          tmdb_movie_id: 100,
          title: '映画A',
          poster_path: null,
          release_date: null,
          added_at: '2026-10-01T00:00:00Z',
          watched_at: null,
          streaming_offer_type: null,
          streaming_provider_ids: [],
          streaming_resumed: false,
          total_count: 1,
        },
      ],
      error: null,
    });

    const response = await GET(createGetRequest());
    const body = await response.json();

    expect(body.data.watchlist[0].streaming).toBeNull();
  });

  it('prioritize_streaming=true を RPC に渡す', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(createGetRequest({ prioritize_streaming: 'true' }));

    expect(mockRpc).toHaveBeenCalledWith(
      'get_watchlist_sorted',
      expect.objectContaining({ p_prioritize_streaming: true }),
    );
  });

  it('prioritize_streaming 省略時は false を渡す', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(createGetRequest());

    expect(mockRpc).toHaveBeenCalledWith(
      'get_watchlist_sorted',
      expect.objectContaining({ p_prioritize_streaming: false }),
    );
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx jest src/app/api/watchlist/route.test.ts`
Expected: FAIL（4件）

- [ ] **Step 3: スキーマにクエリパラメータを足す**

`src/schema/watchlist.ts` の `watchlistQuerySchema` に追記する。

```ts
  /**
   * 配信中の未視聴を先頭に出すか。
   *
   * サイドバー（公開日が近い映画）でこの並びを使うと見出しと中身が
   * 食い違うため、一覧ページだけが true を渡す。
   */
  prioritize_streaming: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
```

- [ ] **Step 4: API Route を更新する**

`src/app/api/watchlist/route.ts` の GET を編集する。

クエリのパースに追加:

```ts
      prioritize_streaming: searchParams.get('prioritize_streaming') ?? undefined,
```

分割代入に追加:

```ts
const { cursor, limit, sort, exclude_watched, prioritize_streaming } =
  queryResult.data;
```

RPC 呼び出しに引数を追加:

```ts
const { data, error } = await supabase.rpc('get_watchlist_sorted', {
  p_user_id: session.user.id,
  p_sort: sort,
  p_limit: limit,
  p_offset: offset,
  p_exclude_watched: exclude_watched,
  p_prioritize_streaming: prioritize_streaming,
});
```

戻り値の整形を次の形にする（`total_count` の除外に加えて配信情報を組み立てる）。

```ts
const items = (data ?? []) as Array<
  WatchlistItem & {
    total_count: number;
    streaming_offer_type: 'flatrate' | 'paid' | null;
    streaming_provider_ids: number[];
    streaming_resumed: boolean;
  }
>;
const totalCount = items.length > 0 ? Number(items[0].total_count) : 0;
const hasMore = offset + limit < totalCount;
const nextCursor = hasMore ? String(offset + limit) : null;

// RPC は列をフラットに返すため、配信情報だけ入れ子に組み直す。
// total_count は内部用なのでレスポンスから除く
const watchlist = items.map(
  ({
    total_count,
    streaming_offer_type,
    streaming_provider_ids,
    streaming_resumed,
    ...item
  }) => ({
    ...item,
    streaming: streaming_offer_type
      ? {
          offer_type: streaming_offer_type,
          provider_ids: streaming_provider_ids ?? [],
          resumed: streaming_resumed,
        }
      : null,
  }),
);
```

`total_count` の未使用警告が出るため、既存と同じく分割代入の直前に
`// eslint-disable-next-line @typescript-eslint/no-unused-vars` を置く。

- [ ] **Step 5: API クライアントの型を更新する**

`src/lib/api/watchlist/watchlist.ts` を編集する。

```ts
/**
 * ウォッチリストアイテムの配信情報
 */
export interface WatchlistStreaming {
  /** 提供形態。見放題とレンタルの両方で観られる場合は flatrate を返す */
  offer_type: 'flatrate' | 'paid';
  /** 表示するプロバイダーID（代表IDへ正規化済み） */
  provider_ids: number[];
  /** 一度途切れたあとの再配信か */
  resumed: boolean;
}
```

`WatchlistItem` に追加:

```ts
/** 配信情報。配信されていなければ null */
streaming: WatchlistStreaming | null;
```

`GetWatchlistRequest` に追加:

```ts
  /** 配信中の未視聴を先頭に出すか（一覧ページのみ） */
  prioritize_streaming?: boolean;
```

- [ ] **Step 6: フックに prioritizeStreaming を通す**

`src/features/watchlist/hooks/useWatchlist.ts` を編集する。

`UseWatchlistOptions` に追加:

```ts
  /** 配信中の未視聴を先頭に出すか（一覧ページのみ true） */
  prioritizeStreaming?: boolean;
```

分割代入に追加:

```ts
    prioritizeStreaming = false,
```

クエリキーと取得に反映（`queryKey` の2箇所と `queryFn` の両方を直すこと。
片方だけだとサイドバーと一覧でキャッシュが混ざる）:

```ts
    queryKey: watchlistKeys.list({ sort, excludeWatched, prioritizeStreaming }),
    queryFn: ({ pageParam }) =>
      getWatchlist({
        cursor: pageParam,
        limit,
        sort,
        exclude_watched: excludeWatched,
        prioritize_streaming: prioritizeStreaming,
      }),
```

```ts
const queryKey = watchlistKeys.list({
  sort,
  excludeWatched,
  prioritizeStreaming,
});
```

楽観的更新で作る `optimisticItem` に `streaming: null` を足す（型を満たすため）。

`src/constants/queryKeys.ts` の `watchlistKeys.list` の引数型に追加:

```ts
  list: (params?: {
    sort?: string;
    excludeWatched?: boolean;
    prioritizeStreaming?: boolean;
  }) => ['watchlist', 'list', params] as const,
```

`src/features/watchlist/hooks/useWatchlistPage.ts` の `useWatchlist` 呼び出しを
`useWatchlist({ sort: sortBy, prioritizeStreaming: true })` にする。

- [ ] **Step 7: テストを実行して通ることを確認**

```bash
npx jest src/app/api/watchlist/ src/features/watchlist/ src/lib/api/watchlist/
npx tsc --noEmit
```

Expected: 全件 PASS、型エラーなし。

既存のテストで `WatchlistItem` を組み立てている箇所は `streaming` が必須になるため
コンパイルエラーになる。各テストのモックデータに `streaming: null` を足す。

- [ ] **Step 8: コミット**

```bash
git add src/app/api/watchlist/ src/schema/watchlist.ts src/lib/api/watchlist/ src/features/watchlist/hooks/ src/constants/queryKeys.ts
git commit -m "feat(watchlist): 一覧APIで配信情報を返し優先表示を切り替えられるようにする"
```

---

### Task 7: プロバイダーのロゴ定義

**Files:**

- Modify: `src/constants/movies.ts:350-360`（`WATCH_PROVIDERS`）
- Create: `src/utils/watchProvider.ts`
- Create: `src/utils/watchProvider.test.ts`

**Interfaces:**

- Consumes: なし
- Produces:

```ts
export interface WatchProviderDisplay {
  id: number;
  name: string;
  logoUrl: string;
}

/** 表示できるプロバイダーだけを、定義順で返す */
export function toDisplayProviders(
  providerIds: number[],
): WatchProviderDisplay[];
```

- [ ] **Step 1: WATCH_PROVIDERS に logoPath を足す**

`src/constants/movies.ts` の `WATCH_PROVIDERS` を次の形にする。
ロゴパスは TMDb の `/watch/providers/movie?watch_region=JP` から取得した実値。

```ts
export const WATCH_PROVIDERS = [
  { id: 8, name: 'Netflix', logoPath: '/rK1KljqmbvO9HQa1PBFLILWah72.png' },
  {
    id: 9,
    name: 'Amazon Prime Video',
    logoPath: '/gMZdpavHmxFNnLpMHwVxfqeux2g.png',
  },
  { id: 337, name: 'Disney+', logoPath: '/5eZ872CghnHFLB1j8grszbrx0dx.png' },
  { id: 15, name: 'Hulu', logoPath: '/44uAnmSqvA4yBOdbPWN8YgQHjWm.png' },
  { id: 84, name: 'U-NEXT', logoPath: '/3DGpCh83CR9lDzyKbNWlmUBexBF.png' },
  { id: 350, name: 'Apple TV+', logoPath: '/9icYBfYFcwgCbky5VdGUIKJ4C5i.png' },
  {
    id: 10,
    name: 'Amazon Video',
    logoPath: '/jn6TLbtaTZntTRX9UYucHJvpQx1.png',
  },
  {
    id: 2,
    name: 'Apple TV（購入・レンタル）',
    logoPath: '/qdEGArH3lKfFnAtYXMkSYk5wxuG.png',
  },
  { id: 2683, name: 'FOD', logoPath: '/m0tkTiV5TN7NWfazDEYc8NoVXSd.png' },
] as const;
```

既存の JSDoc の末尾に、ロゴを静的に持つ理由を追記する。

```
 * `logoPath` は TMDb の `/watch/providers/movie?watch_region=JP` から取得した値を
 * 静的に持つ。毎回APIから引くとウォッチリスト表示のたびに追加リクエストが要るため。
 * パスが変わることは稀で、変わってもロゴが出ないだけで機能は壊れない。
```

- [ ] **Step 2: 表示件数の定数を足す**

`src/constants/watchlist.ts` の末尾に追記する。

```ts
/**
 * ウォッチリストのカードに並べるプロバイダーロゴの上限
 *
 * 溢れた分は「+N」で畳む。小さなカードに4つ以上並べると判別できないため。
 */
export const WATCHLIST_PROVIDER_LOGO_MAX = 3;
```

- [ ] **Step 3: 失敗するテストを書く**

`src/utils/watchProvider.test.ts` を作る。

```ts
/**
 * 配信プロバイダーの表示ユーティリティ テスト
 */

import { toDisplayProviders } from './watchProvider';

describe('toDisplayProviders', () => {
  it('プロバイダーIDを表示用の情報に変換する', () => {
    const result = toDisplayProviders([8]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(8);
    expect(result[0].name).toBe('Netflix');
    expect(result[0].logoUrl).toBe(
      'https://image.tmdb.org/t/p/w92/rK1KljqmbvO9HQa1PBFLILWah72.png',
    );
  });

  it('WATCH_PROVIDERS に無いIDは除外する', () => {
    // 1796 は Netflix Standard with Ads。代表IDへ正規化済みの想定なので表示対象外
    const result = toDisplayProviders([8, 999999]);

    expect(result.map((p) => p.id)).toEqual([8]);
  });

  it('WATCH_PROVIDERS の定義順で返す（渡された順ではない）', () => {
    // 84(U-NEXT) は定義上 8(Netflix) より後ろ
    const result = toDisplayProviders([84, 8]);

    expect(result.map((p) => p.id)).toEqual([8, 84]);
  });

  it('空配列なら空配列を返す', () => {
    expect(toDisplayProviders([])).toEqual([]);
  });

  it('同じIDが重複していても1つにまとめる', () => {
    const result = toDisplayProviders([8, 8]);

    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 4: テストを実行して落ちることを確認**

Run: `npx jest src/utils/watchProvider.test.ts`
Expected: FAIL（`./watchProvider` が存在しない）

- [ ] **Step 5: 実装する**

`src/utils/watchProvider.ts` を作る。

```ts
/**
 * 配信プロバイダーの表示ユーティリティ
 */

import { WATCH_PROVIDERS } from '@/constants/movies';

/** カードに出すプロバイダーの表示情報 */
export interface WatchProviderDisplay {
  id: number;
  name: string;
  /** ロゴ画像の URL */
  logoUrl: string;
}

/** ロゴの表示サイズ。カードに並べる小さなアイコンなので w92 で足りる */
const LOGO_SIZE = 'w92';

/**
 * プロバイダーIDを表示用の情報に変換する
 *
 * `WATCH_PROVIDERS` に無いIDは落とす。TMDb は日本で71件のプロバイダーを返すが、
 * その34件は `KADOKAWA channel Amazon Channel` のような Amazon Channel 系で、
 * 小さなカードに並べても判別できないため。
 *
 * 並びは渡された順ではなく `WATCH_PROVIDERS` の定義順にする。
 * 作品ごとに同じサービスが違う位置に出ると視線が安定しないため。
 *
 * @param providerIds - 代表IDへ正規化済みのプロバイダーID
 * @returns 表示できるプロバイダーだけを定義順に並べたもの
 */
export function toDisplayProviders(
  providerIds: number[],
): WatchProviderDisplay[] {
  const target = new Set(providerIds);

  return WATCH_PROVIDERS.filter((provider) => target.has(provider.id)).map(
    (provider) => ({
      id: provider.id,
      name: provider.name,
      logoUrl: `https://image.tmdb.org/t/p/${LOGO_SIZE}${provider.logoPath}`,
    }),
  );
}
```

- [ ] **Step 6: テストを実行して通ることを確認**

```bash
npx jest src/utils/watchProvider.test.ts
npx tsc --noEmit
```

Expected: PASS（5件）、型エラーなし。

`WATCH_PROVIDERS` を参照している既存コード（フィルター等）が
`logoPath` の追加で壊れていないことを確認する。

```bash
npx jest src/features/search/ src/components/ui/movie/
```

- [ ] **Step 7: コミット**

```bash
git add src/constants/movies.ts src/constants/watchlist.ts src/utils/watchProvider.ts src/utils/watchProvider.test.ts
git commit -m "feat(watchlist): 配信プロバイダーのロゴ定義と表示ユーティリティを追加"
```

---

### Task 8: カードの配信バッジ

**Files:**

- Create: `src/features/watchlist/component/streamingBadge/streamingBadge.tsx`
- Create: `src/features/watchlist/component/streamingBadge/streamingBadge.module.scss`
- Create: `src/features/watchlist/component/streamingBadge/streamingBadge.test.tsx`
- Modify: `src/features/watchlist/component/watchlistList/watchlistList.tsx`
- Modify: `src/features/watchlist/component/watchlistList/watchlistList.module.scss`
- Modify: `src/features/watchlist/component/watchlistList/watchlistList.test.tsx`
- Modify: `src/constants/watchlist.ts`

**Interfaces:**

- Consumes: `toDisplayProviders`（Task 7）、`WatchlistStreaming`（Task 6）
- Produces:

```tsx
interface StreamingBadgeProps {
  streaming: WatchlistStreaming;
}
```

- [ ] **Step 1: ラベル定数を足す**

`src/constants/watchlist.ts` の末尾に追記する。

```ts
/**
 * 配信バッジの表示ラベル
 */
export const WATCHLIST_STREAMING_LABELS = {
  /** 見放題 */
  FLATRATE: '見放題',
  /** レンタル・購入 */
  PAID: 'レンタル',
  /** ロゴが溢れたときの表示: 「+2」 */
  overflow: (count: number) => `+${count}`,
  /** バッジ全体の読み上げ: 「U-NEXT、Netflix で見放題」 */
  ariaLabel: (offerLabel: string, providerNames: string[]) =>
    providerNames.length > 0
      ? `${providerNames.join('、')} で${offerLabel}`
      : `${offerLabel}で配信中`,
} as const;
```

- [ ] **Step 2: 失敗するテストを書く**

`streamingBadge.test.tsx` を作る。

```tsx
/**
 * StreamingBadgeコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';

import { StreamingBadge } from './streamingBadge';

// --- Mocks ---

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

// --- Tests ---

describe('StreamingBadge', () => {
  it('見放題のラベルを出す', () => {
    render(
      <StreamingBadge
        streaming={{
          offer_type: 'flatrate',
          provider_ids: [8],
          resumed: false,
        }}
      />,
    );

    expect(screen.getByText('見放題')).toBeInTheDocument();
  });

  it('レンタルのラベルを出す', () => {
    render(
      <StreamingBadge
        streaming={{ offer_type: 'paid', provider_ids: [10], resumed: false }}
      />,
    );

    expect(screen.getByText('レンタル')).toBeInTheDocument();
  });

  it('プロバイダーのロゴを出す', () => {
    render(
      <StreamingBadge
        streaming={{
          offer_type: 'flatrate',
          provider_ids: [8, 84],
          resumed: false,
        }}
      />,
    );

    expect(screen.getByAltText('Netflix')).toBeInTheDocument();
    expect(screen.getByAltText('U-NEXT')).toBeInTheDocument();
  });

  it('ロゴが上限を超えたら残数を出す', () => {
    render(
      <StreamingBadge
        streaming={{
          offer_type: 'flatrate',
          provider_ids: [8, 9, 337, 15, 84],
          resumed: false,
        }}
      />,
    );

    // 上限3つまで表示し、残り2つは +2 に畳む
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('上限ちょうどなら残数を出さない', () => {
    render(
      <StreamingBadge
        streaming={{
          offer_type: 'flatrate',
          provider_ids: [8, 9, 337],
          resumed: false,
        }}
      />,
    );

    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it('未知のプロバイダーだけならロゴを出さずラベルだけにする', () => {
    render(
      <StreamingBadge
        streaming={{
          offer_type: 'flatrate',
          provider_ids: [999999],
          resumed: false,
        }}
      />,
    );

    expect(screen.getByText('見放題')).toBeInTheDocument();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('サービス名を含む読み上げラベルを持つ', () => {
    render(
      <StreamingBadge
        streaming={{
          offer_type: 'flatrate',
          provider_ids: [84],
          resumed: false,
        }}
      />,
    );

    expect(screen.getByLabelText('U-NEXT で見放題')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: テストを実行して落ちることを確認**

Run: `npx jest src/features/watchlist/component/streamingBadge/`
Expected: FAIL（`./streamingBadge` が存在しない）

- [ ] **Step 4: 実装する**

`streamingBadge.tsx` を作る。

```tsx
/**
 * StreamingBadgeコンポーネント
 * ウォッチリストのカードに出す配信バッジ（提供形態 + サービスのロゴ）
 */

'use client';

import { memo, useMemo } from 'react';
import Image from 'next/image';

import {
  WATCHLIST_PROVIDER_LOGO_MAX,
  WATCHLIST_STREAMING_LABELS,
} from '@/constants';
import type { WatchlistStreaming } from '@/lib/api/watchlist/watchlist';
import { toDisplayProviders } from '@/utils/watchProvider';

import styles from './streamingBadge.module.scss';

/**
 * StreamingBadgeコンポーネントのプロパティ
 */
export interface StreamingBadgeProps {
  /** 配信情報 */
  streaming: WatchlistStreaming;
}

/** ロゴの表示サイズ（px） */
const LOGO_SIZE = 16;

/**
 * StreamingBadgeコンポーネント
 *
 * 詳細を開かなくても「どこで観られるか」が分かるようにする。
 * 見放題とレンタルの両方で観られる作品は、API 側で見放題に寄せて返ってくる。
 */
export const StreamingBadge = memo<StreamingBadgeProps>(
  function StreamingBadge({ streaming }) {
    const offerLabel =
      streaming.offer_type === 'flatrate'
        ? WATCHLIST_STREAMING_LABELS.FLATRATE
        : WATCHLIST_STREAMING_LABELS.PAID;

    const providers = useMemo(
      () => toDisplayProviders(streaming.provider_ids),
      [streaming.provider_ids],
    );

    const visible = providers.slice(0, WATCHLIST_PROVIDER_LOGO_MAX);
    const overflow = providers.length - visible.length;

    return (
      <span
        className={styles.c_streaming_badge}
        aria-label={WATCHLIST_STREAMING_LABELS.ariaLabel(
          offerLabel,
          providers.map((provider) => provider.name),
        )}
      >
        <span className={styles.c_streaming_badge__label}>{offerLabel}</span>
        {visible.map((provider) => (
          <Image
            key={provider.id}
            className={styles.c_streaming_badge__logo}
            src={provider.logoUrl}
            alt={provider.name}
            width={LOGO_SIZE}
            height={LOGO_SIZE}
          />
        ))}
        {overflow > 0 && (
          <span className={styles.c_streaming_badge__overflow}>
            {WATCHLIST_STREAMING_LABELS.overflow(overflow)}
          </span>
        )}
      </span>
    );
  },
);

StreamingBadge.displayName = 'StreamingBadge';
```

- [ ] **Step 5: SCSS を書く**

`streamingBadge.module.scss` を作る。

```scss
@use '@/styles/variables' as *;

.c_streaming_badge {
  display: inline-flex;
  align-items: center;
  gap: $spacing-1;
  padding: $spacing-1 $spacing-2;
  border-radius: $border-radius-sm;
  background-color: $background-secondary;

  &__label {
    color: $text-primary;
    font-size: $font-size-2xs;
    font-weight: $font-weight-bold;
    white-space: nowrap;
  }

  &__logo {
    width: 16px;
    height: 16px;
    border-radius: $border-radius-sm;
    object-fit: cover;
    flex-shrink: 0;
  }

  &__overflow {
    color: $text-secondary;
    font-size: $font-size-2xs;
  }
}
```

`$font-weight-bold` が `src/styles/_variables.scss` に無ければ、
同ファイルに定義されている近い変数に置き換える。値を直書きしないこと。

- [ ] **Step 6: カードに組み込む**

`watchlistList.tsx` の `WatchlistTile` を編集する。

import に追加:

```tsx
import { StreamingBadge } from '@/features/watchlist/component/streamingBadge/streamingBadge';
```

視聴済みバッジの下に追加する（`isWatched && ...` のブロックの直後）:

```tsx
{
  item.streaming && (
    <div className={styles.c_watchlist_tile__streaming}>
      <StreamingBadge streaming={item.streaming} />
    </div>
  );
}
```

`watchlistList.module.scss` に追記する。ポスターの左下に重ねる。

```scss
&__streaming {
  position: absolute;
  left: $spacing-2;
  bottom: $spacing-2;
  z-index: 1;
}
```

`.c_watchlist_tile__poster` に `position: relative` が無ければ足す
（視聴済みバッジが既に絶対配置されているので、ほぼ確実にある。確認すること）。

- [ ] **Step 7: 一覧のテストを足す**

`watchlistList.test.tsx` に追記する。既存の `createMockItems` は
`streaming` を持たないため、`streaming: null` を足して型を満たすこと。

```tsx
describe('配信バッジ', () => {
  it('配信中のアイテムにバッジを出す', () => {
    const items = createMockItems(1).map((item) => ({
      ...item,
      streaming: {
        offer_type: 'flatrate' as const,
        provider_ids: [84],
        resumed: false,
      },
    }));

    render(<WatchlistList watchlist={items} isLoading={false} />);

    expect(screen.getByText('見放題')).toBeInTheDocument();
  });

  it('配信なしのアイテムにはバッジを出さない', () => {
    const items = createMockItems(1);

    render(<WatchlistList watchlist={items} isLoading={false} />);

    expect(screen.queryByText('見放題')).toBeNull();
    expect(screen.queryByText('レンタル')).toBeNull();
  });
});
```

- [ ] **Step 8: テストを実行して通ることを確認**

```bash
npx jest src/features/watchlist/
npx tsc --noEmit
npm run lint
```

Expected: 全件 PASS、型エラーなし、Lint エラーなし。

- [ ] **Step 9: コミット**

```bash
git add src/features/watchlist/component/ src/constants/watchlist.ts
git commit -m "feat(watchlist): カードに配信バッジとサービスのロゴを表示する"
```

---

### Task 9: E2E と全体検証

**Files:**

- Create: `e2e/watchlist/watchlistStreaming.spec.ts`
- Modify: `.claude/documents/roadmap/improvements.md`

- [ ] **Step 1: 型・Lint・全テスト・整形を通す**

```bash
npx tsc --noEmit
npm run lint
npx jest --coverage
npm run prettier:check
```

Expected: すべてエラーなし。カバレッジは全指標 80% 以上。
`prettier:check` が落ちたら `npx prettier --write .` で整形してから進む。

- [ ] **Step 2: ローカルで動作確認する**

worktree では `npm install` が必要。

```bash
npm install
npm run dev
```

ブラウザで `/watchlist` を開き、次を確認する。

1. 配信中の作品が先頭に集まっている
2. カードの左下に「見放題」または「レンタル」とサービスのロゴが出る
3. **サイドバーの「公開日が近い映画」の並びが変わっていない**
4. 画面左下の Next.js Dev Tools バッジが赤くなっていないこと

- [ ] **Step 3: E2E を書く**

`e2e/watchlist/watchlistStreaming.spec.ts` を作る。
専用ユーザーを使い、`movie_streaming_status` に直接データを入れて検証する
（TMDb の実データに依存するとテストが不安定になるため）。

```ts
/**
 * 配信開始された未視聴作品の優先表示 E2Eテスト（認証済み）
 *
 * movie_streaming_status に直接データを入れて検証する。
 * TMDb の実データに依存させると、配信状況の変化でテストが壊れるため。
 *
 * ⚠️ 共有の TEST_USER は使わない（ウォッチリストを全件削除しながら進めるため）。
 */

import { test, expect, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import {
  cleanupWatchlistForUser,
  seedStreamingStatus,
  cleanupStreamingStatus,
} from '../helpers/api';
import { movieTiles } from '../helpers/locators';
import { runScopedEmail } from '../helpers/runScope';
import { waitForWriteResponse } from '../helpers/writeResponse';

test.describe.configure({ mode: 'serial', timeout: 120000 });

const USER = {
  email: runScopedEmail('e2e-watchlist-streaming'),
  password: 'WatchlistStreamingE2e1',
} as const;

/** 映画をウォッチリストに追加し、その tmdb_movie_id とタイトルを返す */
async function addMovieToWatchlist(
  page: Page,
): Promise<{ tmdbMovieId: number; title: string }> {
  await page.goto('/movies/now-showing');
  await movieTiles(page).first().waitFor({ timeout: 30000 });

  const firstTile = movieTiles(page).first();
  const addButton = firstTile.getByRole('button', {
    name: 'ウォッチリストに追加',
  });

  const responsePromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/watchlist') &&
      res.request().method() === 'POST' &&
      res.status() === 201,
    { timeout: 30000 },
  );
  await addButton.click();
  const response = await responsePromise;
  const body = await response.json();

  return {
    tmdbMovieId: body.data.tmdb_movie_id,
    title: body.data.title,
  };
}

test.describe('配信開始の優先表示', () => {
  let session: DedicatedSession;
  let page: Page;
  let seededMovieId: number | null = null;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(120000);
    session = await openDedicatedSession(browser, USER);
    page = session.page;
  });

  test.afterAll(async () => {
    if (seededMovieId !== null) {
      await cleanupStreamingStatus([seededMovieId]);
    }
    await session.close();
  });

  test('配信中の作品にバッジが出る', async () => {
    await cleanupWatchlistForUser(session.userId);
    const movie = await addMovieToWatchlist(page);
    seededMovieId = movie.tmdbMovieId;

    // U-NEXT(84) で見放題にする
    await seedStreamingStatus({
      tmdbMovieId: movie.tmdbMovieId,
      flatrateProviderIds: [84],
    });

    await page.goto('/watchlist');

    const main = page.getByRole('main');
    await expect(main.getByText('見放題')).toBeVisible({ timeout: 30000 });
    await expect(main.getByAltText('U-NEXT')).toBeVisible();

    await page.screenshot({
      path: 'docs/e2e-screenshots/watchlist-streaming-badge.png',
    });
  });

  test('サイドバーの並びは変わらない', async () => {
    await page.goto('/watchlist');

    // サイドバーは「公開日が近い映画」。配信バッジは出さない
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('見放題')).toHaveCount(0, {
      timeout: 15000,
    });
  });
});
```

`e2e/helpers/api.ts` に2つのヘルパーを追加する。

```ts
/**
 * movie_streaming_status に配信状況を直接入れる（E2E用）
 *
 * TMDb の実データに依存させるとテストが不安定になるため、
 * 画面の検証に必要な状態だけを直接作る。
 */
export async function seedStreamingStatus(params: {
  tmdbMovieId: number;
  flatrateProviderIds?: number[];
  paidProviderIds?: number[];
  resumed?: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/movie_streaming_status`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders,
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      tmdb_movie_id: params.tmdbMovieId,
      flatrate_provider_ids: params.flatrateProviderIds ?? [],
      paid_provider_ids: params.paidProviderIds ?? [],
      flatrate_since:
        (params.flatrateProviderIds ?? []).length > 0 ? now : null,
      paid_since: (params.paidProviderIds ?? []).length > 0 ? now : null,
      flatrate_last_seen_at:
        (params.flatrateProviderIds ?? []).length > 0 ? now : null,
      paid_last_seen_at: (params.paidProviderIds ?? []).length > 0 ? now : null,
      flatrate_resumed: params.resumed ?? false,
      paid_resumed: params.resumed ?? false,
      checked_at: now,
    }),
  });
}

/**
 * E2E で入れた配信状況を消す
 */
export async function cleanupStreamingStatus(
  tmdbMovieIds: number[],
): Promise<void> {
  if (tmdbMovieIds.length === 0) return;

  await fetch(
    `${SUPABASE_URL}/rest/v1/movie_streaming_status?tmdb_movie_id=in.(${tmdbMovieIds.join(',')})`,
    { method: 'DELETE', headers: supabaseHeaders },
  );
}
```

- [ ] **Step 4: E2E を実行する**

```bash
npx playwright test e2e/watchlist/ --project=chromium --reporter=line
```

Expected: 全件 PASS。

既存の watchlist E2E が壊れていないことも同時に確認する。
壊れていたら、優先表示の導入で並び順が変わった影響を疑う。

- [ ] **Step 5: ロードマップに記録する**

Issue を作ってから `.claude/documents/roadmap/improvements.md` の
「UI/UX」と「データベース」に追記する。

- [ ] **Step 6: Issue を作る**

CLAUDE.md の運用に従い起票する。本文は「概要 / 影響範囲 / 対応方針 / 完了条件」の型。
ラベルは `feature` / `P2: nice-to-have` / `database`。

`gh auth switch --user Fn-front` と同一コマンドで実行すること。

- [ ] **Step 7: ビジュアル証跡を用意して PR を作る**

E2E で撮ったスクリーンショットを `docs/e2e-screenshots/` にコミットし、
PR 本文に**コミットSHA固定の permalink** で埋め込む。

```bash
gh auth switch --user Fn-front && gh pr create \
  --repo Fn-front/movie-app \
  --assignee Fn-front \
  --title "feat(watchlist): 配信開始された未視聴作品を先頭に表示する" \
  --body "<本文>"
```

本文は CLAUDE.md の構成（概要 / ロードマップ / レビューポイント / テスト）に従い、
`Closes #<issue番号>` を含める。レビューポイントには最低限これを挙げる。

- `since` を消さない設計により、データが1日欠けても継続配信中の作品が最上位へ浮上しないこと
- 再配信を先頭グループの末尾へ送ることで、7日の閾値がズレても実害が小さいこと
- `p_prioritize_streaming` の既定が `FALSE` で、サイドバーの並びが変わらないこと
- 新規テーブルの GRANT は `authenticated` が SELECT のみ、`anon` には付与していないこと

- [ ] **Step 8: マージ承認を待つ**

**PR を作ったらここで停止する。** ユーザーの明示的な許可があるまで `gh pr merge` を実行しない。
