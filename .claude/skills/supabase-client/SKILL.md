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

- **クライアント種別**: anon key（クライアント）、service role（サーバー）
- **Row Level Security**: RLSポリシーに準拠
- **型定義**: Supabaseの型生成を活用
- **エラーハンドリング**: try-catchで適切に処理

## ファイル構成

```
src/lib/
├── supabase/
│   ├── client.ts        # クライアントサイド用
│   ├── server.ts        # サーバーサイド用
│   └── types.ts         # Supabase型定義
```

## クライアント作成

### クライアントサイド（ブラウザ）

```typescript
// src/lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js';

// RLS有効（ユーザーの権限で実行）
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### サーバーサイド（API Routes, Server Actions）

```typescript
// src/lib/supabase/server.ts
import { createClient } from '@supabase/supabase-js';

// RLSバイパス（管理者権限で実行）
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
```

### Server Component用

```typescript
// src/lib/supabase/server.ts
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export function createServerClient() {
  return createServerComponentClient({ cookies });
}
```

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

```typescript
// クライアントサイド（RLS有効）
const { data } = await supabase
  .from('watchlist')
  .select('*')
  .eq('user_id', userId) // RLSで自動的にフィルタされるが明示的に指定
  .is('deleted_at', null);
```

### 管理者権限での操作（サーバーサイド）

```typescript
// サーバーサイド（RLSバイパス）
import { supabaseAdmin } from '@/lib/supabase/server';

const { data } = await supabaseAdmin
  .from('users')
  .select('*')
  .eq('email', email)
  .single();
```

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

## カスタムフック例

### useWatchlist

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

interface Movie {
  id: string;
  tmdb_movie_id: number;
  title: string;
  poster_path: string | null;
  added_at: string;
}

export function useWatchlist(userId: string | undefined) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) return;

    const fetchWatchlist = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('watchlist')
          .select('*')
          .eq('user_id', userId)
          .is('deleted_at', null)
          .order('added_at', { ascending: false });

        if (error) throw error;

        setMovies(data || []);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchWatchlist();
  }, [userId]);

  return { movies, isLoading, error };
}
```

## Realtime購読（将来的に使用）

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export function useRealtimeWatchlist(userId: string) {
  const [movies, setMovies] = useState<Movie[]>([]);

  useEffect(() => {
    // 初回取得
    const fetchMovies = async () => {
      const { data } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null);

      setMovies(data || []);
    };

    fetchMovies();

    // リアルタイム購読
    const subscription = supabase
      .channel('watchlist_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'watchlist',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMovies((prev) => [payload.new as Movie, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setMovies((prev) =>
              prev.map((m) =>
                m.id === payload.new.id ? (payload.new as Movie) : m
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setMovies((prev) => prev.filter((m) => m.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [userId]);

  return movies;
}
```

## 型定義

### Supabase CLI型生成

```bash
# Supabaseから型を生成
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/types.ts
```

### 型の使用

```typescript
import { Database } from '@/lib/supabase/types';

type Watchlist = Database['public']['Tables']['watchlist']['Row'];
type WatchlistInsert = Database['public']['Tables']['watchlist']['Insert'];
type WatchlistUpdate = Database['public']['Tables']['watchlist']['Update'];

// 型付きクライアント
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey
);
```

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
