---
name: supabase-client
description: Create Supabase clients and implement server-side database operations
disable-model-invocation: true
argument-hint: <operation>
---

# Supabaseクライアント操作スキル

このスキルは、Supabase クライアントの作成とサーバー側のデータベース操作を実装します（認可は RLS ではなくクエリ側で書く）。

## 必須要件

### アーキテクチャ原則

- **API Route からは `src/helpers/supabase.ts` のヘルパーを使う**
  （`createClient()` を直接呼ばない）
- **ブラウザからは Supabase を叩かない**。データ取得はすべて API Route 経由
- **service role は RLS をバイパスする**。認可は自分で書く
- **型定義**: `src/types/database.types.ts`（自動生成。手で編集しない）
- **エラーハンドリング**: `error` を握り潰さない

## ファイル構成

```
src/helpers/supabase.ts     # クライアント生成ヘルパー（これだけ）
src/types/database.types.ts # 自動生成の型定義
```

> ⛔ **`src/lib/supabase/` は存在しない。** `client.ts` / `server.ts` /
> `types.ts` も無い。import すると解決できない。

> ⚠️ **リクエスト外では `createClient()` を直接呼んでいる**（cron / sync /
> `src/lib/auth/auth.ts` / `nowShowing.server.ts` の9ファイル）。
>
> うち8ファイルは**環境変数が無ければ即 throw** する。ヘルパーは `null` を
> 返す設計で、**「設定漏れに気づけないまま空のホームを配信する」ほうが困る**
> 場所では落としたいため（`nowShowing.server.ts` の冒頭コメント／#1115）。
>
> 残る `src/lib/auth/auth.ts` だけはヘルパーと同じく `console.warn` + `null`
> で、throw は `authorize()` に入ってから。NextAuth の設定オブジェクトは
> モジュール読み込み時に評価されるので、ここで throw するとアプリ全体が
> 起動しない。
>
> **API Route では必ずヘルパー**、という切り分け。

## クライアント作成

API Route から使うクライアントは **2種類**。どちらもサーバー側。

```typescript
import {
  createAnonClient,
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
```

| ヘルパー | 鍵 | RLS | 用途 |
|---|---|---|---|
| `createServiceRoleClient()` | service role | **バイパス** | ほぼすべて。公開ルートもこちら |
| `createAnonClient()` | anon | 有効 | **anon に `SELECT` を付けたテーブルだけ** |

⛔ **「公開API だから anon」ではない。** `20261018053616_declare_table_grants.sql`
が `ALTER DEFAULT PRIVILEGES ... REVOKE ALL FROM anon, authenticated` を打って
いるので、**anon が読めるのは `award_movies` と `now_showing_movies` の2つだけ**。
ほかのテーブルを anon で読むと PostgREST が **42501** を返して全件失敗する。

実際 `createAnonClient()` を使っているのは `src/app/api/awards/route.ts` の
1本だけで、未認証で叩ける `/api/movies` も `createServiceRoleClient()` を使う。

```typescript
const supabase = createServiceRoleClient();

// ⚠️ 環境変数が無いと **null** が返る。必ず見ること。
//    見ないと `supabase.from(...)` が TypeError になり、
//    「設定漏れ」が「サーバーエラー」に化ける
if (!supabase) return dbConnectionErrorResponse();
```

### ブラウザからは叩かない

`@supabase/supabase-js` を import しているファイルは**すべてサーバー側**
（API Route / `src/lib/**` / `src/helpers/**`）で、`'use client'` のファイルからの import は
**1つも無い**。画面はすべて `/api/*` を経由する。

理由は2つ。

- **そもそも読めない。** `ALTER DEFAULT PRIVILEGES ... REVOKE ALL FROM anon,
  authenticated` を打ってあるので、anon で読めるのは `award_movies` と
  `now_showing_movies` の2つだけ。ほかは **42501** になる
- このリポジトリの認証は **NextAuth（自前の `public.users`）** で、
  Supabase Auth ではない。ブラウザの Supabase クライアントに
  「ログイン中の利用者」は存在せず、RLS の `auth.uid()` も効かない

### Server Component から使うとき

`createServerComponentClient`（`@supabase/auth-helpers-nextjs`）は
**使わない**。あのパッケージは依存に入っていないし、Supabase Auth 前提の
Cookie を読む作りで、NextAuth のセッションとは噛み合わない。

サーバーコンポーネントでも同じヘルパーを使い、利用者の特定は
`getAuthSession()`（`src/helpers/auth.ts`）で行う。

## 基本CRUD操作

### SELECT - 取得

```typescript
// 全件取得
const { data, error } = await supabase
  .from('watchlist')
  .select('*');

// 特定条件で取得
const { data, error } = await supabase
  .from('watchlist')
  .select('*')
  .eq('user_id', userId)
  .is('deleted_at', null);

// 特定カラムのみ取得
const { data, error } = await supabase
  .from('watchlist')
  .select('id, title, poster_path')
  .eq('user_id', userId);

// JOIN（外部キー）
const { data, error } = await supabase
  .from('watchlist')
  .select(`
    *,
    users (
      name,
      email
    )
  `)
  .eq('user_id', userId);

// 単一レコード取得
const { data, error } = await supabase
  .from('watchlist')
  .select('*')
  .eq('id', movieId)
  .single();
```

### INSERT - 作成

```typescript
// 単一レコード挿入
const { data, error } = await supabase
  .from('watchlist')
  .insert({
    user_id: userId,
    tmdb_movie_id: 27205,
    title: 'インセプション',
    poster_path: '/poster.jpg',
  })
  .select()
  .single();

// 複数レコード挿入
const { data, error } = await supabase
  .from('watchlist')
  .insert([
    { user_id: userId, tmdb_movie_id: 1, title: 'Movie 1' },
    { user_id: userId, tmdb_movie_id: 2, title: 'Movie 2' },
  ])
  .select();

// upsert（存在すれば更新、なければ挿入）
const { data, error } = await supabase
  .from('watchlist')
  .upsert({
    user_id: userId,
    tmdb_movie_id: 27205,
    title: 'インセプション（更新）',
  })
  .select()
  .single();
```

### UPDATE - 更新

```typescript
// 更新
const { data, error } = await supabase
  .from('watchlist')
  .update({ notes: '後で見る' })
  .eq('id', movieId)
  .eq('user_id', userId)
  .select();

// 論理削除
const { data, error } = await supabase
  .from('watchlist')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', movieId)
  .eq('user_id', userId);

// 複数レコード更新
const { data, error } = await supabase
  .from('watchlist')
  .update({ notes: '一括更新' })
  .in('id', [movieId1, movieId2, movieId3]);
```

### DELETE - 削除

```typescript
// 物理削除
const { data, error } = await supabase
  .from('otp_tokens')
  .delete()
  .eq('id', tokenId)
  .eq('user_id', userId);

// 条件付き削除
const { data, error } = await supabase
  .from('otp_tokens')
  .delete()
  .eq('user_id', userId)
  .lt('expires_at', new Date().toISOString());
```

## フィルタリング

### 基本フィルタ

```typescript
// 等しい
.eq('user_id', userId)

// 等しくない
.neq('status', 'deleted')

// より大きい
.gt('vote_average', 7.0)

// 以上
.gte('release_date', '2024-01-01')

// より小さい
.lt('vote_average', 5.0)

// 以下
.lte('release_date', '2024-12-31')

// LIKE検索
.like('title', '%インセプション%')

// ILIKE検索（大文字小文字区別なし）
.ilike('title', '%inception%')

// IN
.in('genre_id', [1, 2, 3])

// IS NULL
.is('deleted_at', null)

// IS NOT NULL
.not('poster_path', 'is', null)
```

### 複合フィルタ

```typescript
// AND（デフォルト）
const { data } = await supabase
  .from('watchlist')
  .select('*')
  .eq('user_id', userId)
  .is('deleted_at', null)
  .gte('added_at', startDate);

// OR
const { data } = await supabase
  .from('movies')
  .select('*')
  .or('vote_average.gte.8,popularity.gte.100');
```

## ソート・ページネーション

### ソート

```typescript
// 昇順
.order('added_at', { ascending: true })

// 降順
.order('added_at', { ascending: false })

// 複数カラムでソート
.order('vote_average', { ascending: false })
.order('popularity', { ascending: false })
```

### ページネーション

```typescript
// LIMIT/OFFSET
const page = 1;
const limit = 20;
const offset = (page - 1) * limit;

const { data, error, count } = await supabase
  .from('watchlist')
  .select('*', { count: 'exact' })
  .eq('user_id', userId)
  .order('added_at', { ascending: false })
  .range(offset, offset + limit - 1);

// 総ページ数計算
const totalPages = Math.ceil((count || 0) / limit);
```

## RLS対応クエリパターン

### 自分のデータのみ取得

⛔ **service role では RLS が効かない。** `eq('user_id', ...)` を落とすと
**全利用者の行が返る**。「RLS があるから大丈夫」は成り立たない。

```typescript
const session = await getAuthSession();
if (!session) return unauthorizedResponse();

const supabase = createServiceRoleClient();
if (!supabase) return dbConnectionErrorResponse();

const { data, error } = await supabase
  .from('watchlist')
  .select('*')
  // ⛔ これが**唯一の**絞り込み。消すと全件返る
  .eq('user_id', session.user.id)
  .is('deleted_at', null);

if (error) throw error;
```

⚠️ 利用者IDは**必ずセッションから取る**。クエリやボディの `userId` を
信用すると、値を差し替えるだけで他人のデータを読める。

### 公開データ（未認証で叩ける）

⛔ **anon を選ぶ理由にならない。** `/api/movies` も `/api/movies/[id]` も
未認証で叩けるが `createServiceRoleClient()` を使っている。基準は
「未認証で叩けるか」ではなく **「そのテーブルに anon の `SELECT` があるか」**。

```typescript
// 既定。公開ルートでもこちら
const supabase = createServiceRoleClient();
if (!supabase) return dbConnectionErrorResponse();
```

`createAnonClient()` を使ってよいのは `award_movies` / `now_showing_movies`
の2テーブルだけで、実際の使用箇所も `src/app/api/awards/route.ts` の1本。
他のテーブルを anon で読むと PostgREST が `42501` を返して全件失敗する。

⚠️ anon では RLS が効くが、**`GRANT` が前提**。`ENABLE ROW LEVEL SECURITY` と
`CREATE POLICY` だけでは Data API に公開されず、やはり `42501` になる
（`.claude/rules/supabase-db.md`）。

⚠️ anon GRANT のあるもう1つ（`now_showing_movies`）は `createAnonClient()`
ではなく `src/lib/api/nowShowing/nowShowing.server.ts` が `createClient()` を
直接呼んで読む。

⛔ **この2つが anon なのは歴史的経緯で、再現すべき判断基準は無い。**
公開読み取りを最小権限へ寄せた名残。どちらもサーバーから読んでいるので
service_role でも動く。**新しいテーブルは service_role にすること** ——
anon を足すたびに、鍵が公開されている以上「誰でも読める面」が増える。

## エラーハンドリング

```typescript
const { data, error } = await supabase
  .from('watchlist')
  .select('*')
  .eq('id', movieId)
  .single();

if (error) {
  console.error('Supabase error:', error);

  // エラーコード判定
  if (error.code === 'PGRST116') {
    // レコードが見つからない
    return null;
  }

  throw new Error('データの取得に失敗しました');
}

return data;
```

### try-catchパターン

```typescript
async function getWatchlist(userId: string) {
  try {
    const { data, error } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Failed to get watchlist:', error);
    throw new Error('ウォッチリストの取得に失敗しました');
  }
}
```

## トランザクション・集計（RPC）

supabase-js からは複数文をまとめられないので、**PostgreSQL 関数**にして `rpc()`
で呼ぶ。集計（`GROUP BY`）も PostgREST では表現できないので同じ扱い。

⛔ **SQLエディタで作らない。** `supabase migration new <name>` でファイルを作り、
`npx supabase db push --linked` で反映する（`.claude/rules/supabase-db.md`）。

⛔ **`REVOKE` + `GRANT` を同じマイグレーションに書く。** `CREATE FUNCTION` は
EXECUTE を **PUBLIC へ自動付与**するので、書かないと公開されている anon キーから
`POST /rest/v1/rpc/<関数名>` で到達できる。`SET search_path` も必須
（Supabase lint の `function_search_path_mutable`）。

```sql
-- supabase/migrations/<timestamp>_add_watchlist_watched_years_rpc.sql
CREATE OR REPLACE FUNCTION public.get_watchlist_watched_years(
  p_user_id UUID
)
RETURNS TABLE (
  added_year INT,
  watched_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER              -- ⚠️ DEFINER は RLS をバイパスする。使うなら理由をコメントに
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

-- ⚠️ FROM PUBLIC だけでは足りない。anon / authenticated への既定付与が残る
REVOKE EXECUTE ON FUNCTION public.get_watchlist_watched_years(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_watchlist_watched_years(UUID)
  TO service_role;
```

```typescript
// 呼び出しは API Route から。service_role のクライアントで叩く
const { data, error } = await supabase.rpc('get_watchlist_watched_years', {
  p_user_id: session.user.id,
});
```

⚠️ 上の SQL は**初版**（`20261101095647`）。現行は `unrated_count` を足した
3列になっている（`20261101113410`）。権限と修飾子の書き方の見本として読むこと。

⚠️ **引数に `user_id` を渡す形は、関数側では検証できない。** 呼び出し側が
必ずセッションの値を渡すこと（ボディの値を素通しにしない）。

## 画面からのデータ取得

⛔ **ブラウザから Supabase を叩くフックを書かない。** 画面は `/api/*` を
呼び、サーバー側のハンドラが Supabase を触る。

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';

import { API_ENDPOINTS } from '@/constants';
import { watchlistKeys } from '@/constants/queryKeys';

export function useWatchlist() {
  return useQuery({
    // ⚠️ 生の配列にしない。`invalidateQueries` の対象が噛み合わなくなる
    queryKey: watchlistKeys.all,
    queryFn: async () => {
      const response = await fetch(API_ENDPOINTS.WATCHLIST);
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? '取得に失敗しました');
      }

      return json.data;
    },
  });
}
```

⚠️ 更新後の反映は **`queryClient.invalidateQueries()`**。`revalidatePath()`
ではない（ウォッチリストの画面はクライアント専用なので効かない）。

### Realtime は使っていない

`supabase.channel(...)` の購読はこのリポジトリに1つも無い。使うなら
ブラウザから Supabase へ直接つなぐことになるため、上の「ブラウザからは
叩かない」方針と衝突する。導入するなら方針ごと決め直すこと。


## 型定義

### Supabase CLI型生成

```bash
npx supabase gen types typescript --project-id <project-id> > src/types/database.types.ts
```

⚠️ **出力先は `src/types/database.types.ts`**。スキーマを変えたら必ず
再生成する（`.claude/rules/supabase-db.md`）。**手で編集しない** ——
次の生成で上書きされる。

### 型の使用

```typescript
import type { Database } from '@/types/database.types';

type Watchlist = Database['public']['Tables']['watchlist']['Row'];
type WatchlistInsert = Database['public']['Tables']['watchlist']['Insert'];
type WatchlistUpdate = Database['public']['Tables']['watchlist']['Update'];
```

⚠️ `createClient<Database>()` の型付きクライアントは現状使っていない。
`src/helpers/supabase.ts` のヘルパーは素の `SupabaseClient` を返すため、
行の型は呼び出し側で付ける。

## バッチ操作

```typescript
// 大量データの取得（1000件以上）
async function getAllMovies() {
  let allMovies: Movie[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('movie_cache')
      .select('*')
      .range(from, from + batchSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allMovies = allMovies.concat(data);
    from += batchSize;

    if (data.length < batchSize) break;
  }

  return allMovies;
}
```

## 参考ドキュメント

- `.claude/documents/database-schema.md` - テーブル定義
- [Supabase JavaScript Client Documentation](https://supabase.com/docs/reference/javascript/introduction)

## 使用例

```bash
# Supabaseクライアント操作コード生成
/supabase-client select

# CRUD操作
/supabase-client insert
/supabase-client update
/supabase-client delete
```
