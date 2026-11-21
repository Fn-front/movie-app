---
name: supabase-client
description: Create Supabase client and implement database operations with RLS
disable-model-invocation: true
argument-hint: <operation>
---

# Supabaseクライアント操作スキル

このスキルは、Supabaseクライアントの作成とRLS対応のデータベース操作を実装します。

## 必須要件

### アーキテクチャ原則

- **クライアントは `src/helpers/supabase.ts` のヘルパー経由で作る**
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

## クライアント作成

このリポジトリのクライアントは **2種類だけ**。どちらもサーバーで使う。

```typescript
import {
  createAnonClient,
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
```

| ヘルパー | 鍵 | RLS | 用途 |
|---|---|---|---|
| `createServiceRoleClient()` | service role | **バイパス** | 認証済みの操作全般。認可は自分で書く |
| `createAnonClient()` | anon | 有効 | 公開API（未認証で叩ける読み取り） |

```typescript
const supabase = createServiceRoleClient();

// ⚠️ 環境変数が無いと **null** が返る。必ず見ること。
//    見ないと `supabase.from(...)` が TypeError になり、
//    「設定漏れ」が「サーバーエラー」に化ける
if (!supabase) return dbConnectionErrorResponse();
```

### ブラウザからは叩かない

`@supabase/supabase-js` を import しているファイルは**すべてサーバー側**
（API Route / `src/lib/**`）で、`'use client'` のファイルからの import は
**1つも無い**。画面はすべて `/api/*` を経由する。

理由は2つ。

- **anon キーでも RLS の設計を全部ブラウザに晒す**ことになる。どのテーブルに
  何があるかが読める
- このリポジトリの認証は **NextAuth（自前の `public.users`）** で、
  Supabase Auth ではない。ブラウザの Supabase クライアントに
  「ログイン中の利用者」は存在せず、RLS の `auth.uid()` も効かない

### Server Component から使うとき

`createServerComponentClient`（`@supabase/auth-helpers-nextjs`）は
**使わない**。あのパッケージは依存に入っていないし、Supabase Auth 前提の
Cookie を読む作りで、NextAuth のセッションとは噛み合わない。

サーバーコンポーネントでも同じヘルパーを使い、利用者の特定は
`getAuthSession()`（`src/helpers/auth.ts`）で行う。

## 基本CRUD操作## 基本CRUD操作

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

```typescript
const supabase = createAnonClient();
if (!supabase) return dbConnectionErrorResponse();
```

⚠️ anon は RLS が効くが、**`GRANT` が前提**。`ENABLE ROW LEVEL SECURITY` と
`CREATE POLICY` だけでは Data API に公開されず、PostgREST は `42501` を返す
（`.claude/rules/supabase-db.md`）。

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

## トランザクション

```typescript
// Supabaseはトランザクションを直接サポートしていないため、
// PostgreSQL関数を使用

// 1. Supabase SQLエディタで関数を作成
/*
CREATE OR REPLACE FUNCTION add_movie_with_log(
  p_user_id UUID,
  p_tmdb_id INTEGER,
  p_title VARCHAR
)
RETURNS void AS $$
BEGIN
  -- ウォッチリストに追加
  INSERT INTO watchlist (user_id, tmdb_movie_id, title)
  VALUES (p_user_id, p_tmdb_id, p_title);

  -- ログ記録
  INSERT INTO activity_logs (user_id, action, details)
  VALUES (p_user_id, 'ADD_MOVIE', jsonb_build_object('tmdb_id', p_tmdb_id));
END;
$$ LANGUAGE plpgsql;
*/

// 2. クライアントから呼び出し
const { data, error } = await supabase.rpc('add_movie_with_log', {
  p_user_id: userId,
  p_tmdb_id: 27205,
  p_title: 'インセプション',
});
```

## 画面からのデータ取得

⛔ **ブラウザから Supabase を叩くフックを書かない。** 画面は `/api/*` を
呼び、サーバー側のハンドラが Supabase を触る。

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';

import { API_ENDPOINTS } from '@/constants';

export function useWatchlist() {
  return useQuery({
    queryKey: ['watchlist'],
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
