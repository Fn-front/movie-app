---
name: tmdb-api
description: Integrate TMDb API for movie data fetching
disable-model-invocation: true
argument-hint: <endpoint>
---

# TMDb API統合スキル

このスキルは、The Movie Database (TMDb) APIの統合方法を提供します。

## 必須要件

### API情報

- **Base URL**: `API.TMDB_BASE_URL`（`src/constants/api.ts`）
- **認証**: Read Access Token を `Authorization: Bearer` で送る
  （環境変数 `TMDB_API_KEY`。**`NEXT_PUBLIC_` は付けない**）
- **言語 / 地域**: `API.TMDB_LANGUAGE`（`ja-JP`）/ `API.TMDB_REGION`（`JP`）
- **レート制限**: 50リクエスト/秒、20コネクション/IP
- **HTTP Client**: axios（外部API用）

### アーキテクチャ原則

- **APIクライアント分離**: `src/lib/tmdb/tmdb.ts` に実装
- **型定義**: `src/lib/types/index.ts` の既存の型を使う（新しく作らない）
- **エラーハンドリング**: try-catchで適切に処理
- **レート制限対策**: 並列リクエストは10件程度に制限

## ファイル構成

```
src/lib/tmdb/
└── tmdb.ts              # TMDb APIクライアント（axios インスタンス＋取得関数）

src/lib/types/            # TMDb の型定義
src/constants/api.ts      # TMDB_BASE_URL / TMDB_LANGUAGE / TMDB_REGION
src/constants/tmdb.ts     # TMDB_REQUEST_TIMEOUT_MS / TMDB_RETRY_CONFIG

.env.local
└── TMDB_API_KEY          # Read Access Token（**サーバー専用**）
```

> ⛔ **`NEXT_PUBLIC_` を付けない。** `NEXT_PUBLIC_*` は**ビルド時に
> クライアントのバンドルへ焼き込まれる**ので、付けた瞬間にトークンが
> 公開される。TMDb の呼び出しはすべてサーバー側（Route Handler /
> Server Component / cron）から行う。

## axiosインスタンス設定

```typescript
// src/lib/tmdb/tmdb.ts
import axios from 'axios';

import { API } from '@/constants/api';
import { TMDB_REQUEST_TIMEOUT_MS } from '@/constants/tmdb';

// ⛔ **Read Access Token は `Authorization: Bearer` で送る。**
//    `api_key` のクエリは URL に乗るため、アクセスログ・Referer・
//    プロキシの記録に残る
const TMDB_ACCESS_TOKEN = process.env.TMDB_API_KEY;

if (!TMDB_ACCESS_TOKEN) {
  throw new Error('TMDB_API_KEY is not defined');
}

const tmdbClient = axios.create({
  baseURL: API.TMDB_BASE_URL,
  // ⚠️ 既定（0 = 無制限）だと、TMDb が応答を返さないとき呼び出し側が
  //    いつまでも待つ。対話的な書き込み経路からも呼ぶので上限を設ける
  timeout: TMDB_REQUEST_TIMEOUT_MS,
  headers: {
    Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`,
  },
  params: {
    language: API.TMDB_LANGUAGE,
    region: API.TMDB_REGION,
    // ⚠️ 全エンドポイント共通でアダルト作品を除外する
    //    （新しい関数を足すたびに付け忘れないよう既定値にしてある）
    include_adult: false,
  },
});

// レスポンスインターセプター（エラーハンドリング）
tmdbClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // TMDb APIエラー
      console.error('TMDb API Error:', {
        status: error.response.status,
        message: error.response.data.status_message,
      });
    } else if (error.request) {
      // ネットワークエラー
      console.error('Network Error:', error.message);
    }
    return Promise.reject(error);
  }
);

export default tmdbClient;
```

## 型定義

⛔ **新しく作らない。** 型は **`src/lib/types/index.ts`** に既にある。
`src/lib/api/types/tmdb.ts` は**存在しない**。

| 型 | 用途 |
|---|---|
| `Movie` | 一覧・検索の1件 |
| `MovieDetail` | 詳細（`Omit<Movie, 'genre_ids'>` + `genres` ほか） |
| `Genre` / `ProductionCompany` / `ProductionCountry` / `SpokenLanguage` | 詳細の内訳 |
| `TMDbResponse<T>` | ページング付きレスポンス（`page` / `results` / `total_pages` / `total_results`） |
| `FilteredTMDbResponse<T>` | 上記 + フィルタ前の件数（#1166） |

```typescript
import type { Movie, MovieDetail, TMDbResponse } from '@/lib/types';
```

⚠️ **映画そのものの型に `TMDb` は付かない。** `TMDbMovie` /
`TMDbMovieDetail` / `TMDbGenre` はどれも存在せず、`Movie` / `MovieDetail` /
`Genre` が正しい。

`TMDb` が付くのはレスポンスの外枠（`TMDbResponse` / `FilteredTMDbResponse`）と、
**TMDb の生の形をそのまま写した補助の型**（`TMDbNowShowingMovie` /
`TMDbReleaseDate` / `TMDbReleaseDateCountry`）。

### ⚠️ `FilteredTMDbResponse` を素の `TMDbResponse` に替えない

`results.length === 0` が「TMDb が空を返した」とは限らず、**ローカルの
除外フィルタで全件落ちた**でも成立する。ページを跨ぐ処理が前者と誤認して
打ち切ると、以降のページの作品が丸ごと出なくなる（#1166）。

## よく使うエンドポイント

⛔ **新しく書く前に `src/lib/tmdb/tmdb.ts` を見る。** 必要なものはたいてい
もうある。以下は**実在する関数の署名**で、テンプレートではない。

| 関数 | 戻り値 |
|---|---|
| `searchMovies(params: MovieSearchParams, options?)` | `Promise<TMDbResponse<Movie>>` |
| `getMovieDetail(id)` | `Promise<MovieDetail>` |
| `getNowPlayingMovies(page = 1)` | `Promise<FilteredTMDbResponse<Movie>>` |
| `discoverMovies(params: DiscoverMoviesParams = {})` | `Promise<FilteredTMDbResponse<Movie>>` |
| `getGenres()` | `Promise<Genre[]>` |
| `getPersonDetail(id)` | `Promise<PersonDetail>` |
| `getJpTheatricalReleaseDates(id)` | `Promise<string[]>` |
| `getJpStreamingAvailability(id)` | `Promise<JpStreamingAvailability>` |

⚠️ **`searchMovies` の第1引数はオブジェクト。** 位置引数ではない。

```typescript
const results = await searchMovies({ query, page, year });
```

⚠️ **`getPopularMovies` / `getUpcomingMovies` / `getMoviesByDateRange` は
存在しない。** 「人気」「公開予定」は `discoverMovies` に
`DiscoverMoviesParams`（`tmdb.ts`）を渡して作る。

```typescript
// 公開予定。⚠️ キーは release_date.*（primary_release_date.* ではない）
const upcoming = await discoverMovies({
  'release_date.gte': from,
  'release_date.lte': to,
  sort_by: 'popularity.desc',
  page,
});
```

### 新しい関数を足すとき

既存に倣う。パスは直書きせず `TMDB_ENDPOINTS`（`@/constants/api`）を使う。

```typescript
export async function searchMovies(
  params: MovieSearchParams,
  options?: { signal?: AbortSignal },
): Promise<TMDbResponse<Movie>> {
  const { query, page = 1, year, genre } = params;

  const response = await tmdbClient.get<TMDbResponse<Movie>>(
    // ⚠️ キーは SEARCH。SEARCH_MOVIE は存在しない
    TMDB_ENDPOINTS.SEARCH,
    { params: { query, page, year, with_genres: genre }, signal: options?.signal },
  );

  // ⛔ 除外フィルタを必ず通す。落とすと不適切コンテンツがそのまま出る
  //    （tmdb.ts のモジュール内関数。export されていないので同じファイルに書く）
  return {
    ...response.data,
    results: excludeInappropriateMovies(response.data.results),
  };
}
```

⚠️ **戻り値の型は「フィルタを通すか」とは一致していない。**
`FilteredTMDbResponse<Movie>` はフィルタ前の件数を持たせたいときに使うもので
（#1166）、`searchMovies` はフィルタを通すが `TMDbResponse<Movie>` を返す
（ページを跨いで巡回しないため）。既存の関数に合わせること。

## 画像URL生成

⛔ **自前で書かない。** `src/utils/image.ts` にある（`@/utils/image`）。
以下は中身の説明で、コピーして新しく定義するためのものではない。

```typescript
// TMDb画像のベースURL
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export function getTMDbImageUrl(
  path: string | null,
  size: 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w500'
): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

// 使用例
const posterUrl = getTMDbImageUrl(movie.poster_path, 'w500');
const backdropUrl = getTMDbImageUrl(movie.backdrop_path, 'original');
```

## レート制限対策

### まず自動リトライが入っている

`tmdbClient` のレスポンスインターセプタが **429 / 503 / 504 を自動で
リトライ**する（`TMDB_RETRY_CONFIG`。最大3回、既定1秒待ち）。
`Retry-After` が返ればそれに従うが、**`MAX_RETRY_DELAY_MS`（5秒）で
頭を打つ** —— そのまま従うと `Retry-After: 30` で3回＝90秒待つことになり、
対話的な経路から呼ぶには長すぎるため。

新しい取得関数を足すときは `tmdbClient` を使うこと。素の `fetch` や
別の axios インスタンスを作ると、このリトライが効かない。

### 並列リクエスト制限

```typescript
// Promise.allの代わりにチャンク処理
async function fetchMoviesInBatches(
  movieIds: number[],
  batchSize: number = 10
): Promise<MovieDetail[]> {
  const results: MovieDetail[] = [];

  for (let i = 0; i < movieIds.length; i += batchSize) {
    const batch = movieIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((id) => getMovieDetail(id))
    );
    results.push(...batchResults);

    // バッチ間に少し待機（オプション）
    if (i + batchSize < movieIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}

// 使用例
const movieIds = [27205, 550, 155, 13, 680];
const movies = await fetchMoviesInBatches(movieIds, 10);
```

## エラーハンドリング

```typescript
import { AxiosError } from 'axios';

export class TMDbAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public tmdbStatusMessage?: string
  ) {
    super(message);
    this.name = 'TMDbAPIError';
  }
}

export async function safeGetMovieDetail(
  movieId: number
): Promise<MovieDetail | null> {
  try {
    const response = await tmdbClient.get<MovieDetail>(`/movie/${movieId}`);
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      if (error.response?.status === 404) {
        console.warn(`Movie not found: ${movieId}`);
        return null;
      }

      throw new TMDbAPIError(
        '映画詳細の取得に失敗しました',
        error.response?.status,
        error.response?.data?.status_message
      );
    }

    throw error;
  }
}
```

## キャッシュ戦略

### Server Componentでのキャッシュ

```typescript
// Next.js App Router Server Component
export async function getPopularMoviesWithCache(
  page: number = 1
): Promise<TMDbResponse<Movie>> {
  const response = await fetch(
    `${API.TMDB_BASE_URL}/movie/popular?language=${API.TMDB_LANGUAGE}&page=${page}`,
    {
      // ⛔ キーはヘッダで送る。クエリに乗せると URL に残る
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      next: { revalidate: 3600 }, // 1時間キャッシュ
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch popular movies');
  }

  return response.json();
}
```

### データベースキャッシュ（プロジェクト要件）

```typescript
// ホーム画面用: DBキャッシュから取得
export async function getMoviesFromCache(
  page: number = 1,
  limit: number = 20
): Promise<{ movies: Movie[]; total: number }> {
  const offset = (page - 1) * limit;

  const { data: movies, count } = await supabase
    .from('movie_cache')
    .select('*', { count: 'exact' })
    .order('popularity', { ascending: false })
    .range(offset, offset + limit - 1);

  return {
    movies: movies || [],
    total: count || 0,
  };
}

// 詳細画面用: TMDb APIから直接取得（キャッシュなし）
export async function getMovieDetailForDisplay(
  movieId: number
): Promise<MovieDetail> {
  return getMovieDetail(movieId);
}
```

## 環境変数設定

```bash
# .env.local
# ⛔ `NEXT_PUBLIC_` を付けない（付けるとバンドルに焼き込まれて公開される）
TMDB_API_KEY=your_read_access_token_here
```

### 取得方法

1. https://www.themoviedb.org/ でアカウント作成
2. Settings > API を開く
3. **API Read Access Token**（`eyJ...` で始まる長い JWT）をコピー
   - ⚠️ 同じ画面にある短い `API Key` ではない。こちらは
     `Authorization: Bearer` で使うトークン
4. `.env.local` に `TMDB_API_KEY` として追加

## テスト用モック

```typescript
// __mocks__/tmdb.ts
export const mockMovie: Movie = {
  id: 27205,
  title: 'インセプション',
  original_title: 'Inception',
  overview: '夢の中に侵入し、アイデアを盗む...',
  poster_path: '/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
  backdrop_path: '/s3TBrRGB1iav7gFOCNx3H31MoES.jpg',
  release_date: '2010-07-16',
  genre_ids: [28, 878, 53],
  vote_average: 8.4,
  vote_count: 30000,
  popularity: 100.5,
  adult: false,
  video: false,
  original_language: 'en',
};

export const mockGetMovieDetail = jest.fn().mockResolvedValue(mockMovie);
```

## 参考ドキュメント

- `.claude/documents/architecture.md` - TMDb API統合仕様
- [TMDb API Documentation](https://developers.themoviedb.org/3)

## 使用例

```bash
# TMDb API統合コード生成
/tmdb-api search

# 特定エンドポイント実装
/tmdb-api movie-detail
```
