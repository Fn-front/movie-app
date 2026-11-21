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
- **型定義**: TMDbレスポンスの型を定義
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

```typescript
// src/lib/api/types/tmdb.ts

export interface TMDbMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  adult: boolean;
  video: boolean;
  original_language: string;
}

export interface TMDbMovieDetail extends TMDbMovie {
  genres: TMDbGenre[];
  runtime: number;
  budget: number;
  revenue: number;
  homepage: string;
  imdb_id: string;
  production_companies: TMDbProductionCompany[];
  production_countries: TMDbProductionCountry[];
  spoken_languages: TMDbSpokenLanguage[];
  status: string;
  tagline: string;
}

export interface TMDbGenre {
  id: number;
  name: string;
}

export interface TMDbProductionCompany {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

export interface TMDbProductionCountry {
  iso_3166_1: string;
  name: string;
}

export interface TMDbSpokenLanguage {
  iso_639_1: string;
  name: string;
  english_name: string;
}

export interface TMDbMovieListResponse {
  page: number;
  results: TMDbMovie[];
  total_pages: number;
  total_results: number;
}

export interface TMDbSearchResponse {
  page: number;
  results: TMDbMovie[];
  total_pages: number;
  total_results: number;
}
```

## よく使うエンドポイント

### 1. 映画検索

```typescript
export async function searchMovies(
  query: string,
  page: number = 1
): Promise<TMDbSearchResponse> {
  try {
    const response = await tmdbClient.get<TMDbSearchResponse>('/search/movie', {
      params: {
        query,
        page,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Failed to search movies:', error);
    throw new Error('映画の検索に失敗しました');
  }
}

// 使用例
const results = await searchMovies('インセプション', 1);
```

### 2. 映画詳細取得

```typescript
export async function getMovieDetail(movieId: number): Promise<TMDbMovieDetail> {
  try {
    const response = await tmdbClient.get<TMDbMovieDetail>(`/movie/${movieId}`);

    return response.data;
  } catch (error) {
    console.error('Failed to get movie detail:', error);
    throw new Error('映画詳細の取得に失敗しました');
  }
}

// 使用例
const movie = await getMovieDetail(27205);
```

### 3. 人気映画取得

```typescript
export async function getPopularMovies(
  page: number = 1
): Promise<TMDbMovieListResponse> {
  try {
    const response = await tmdbClient.get<TMDbMovieListResponse>('/movie/popular', {
      params: { page },
    });

    return response.data;
  } catch (error) {
    console.error('Failed to get popular movies:', error);
    throw new Error('人気映画の取得に失敗しました');
  }
}

// 使用例
const popularMovies = await getPopularMovies(1);
```

### 4. 公開予定映画取得

```typescript
export async function getUpcomingMovies(
  page: number = 1
): Promise<TMDbMovieListResponse> {
  try {
    const response = await tmdbClient.get<TMDbMovieListResponse>('/movie/upcoming', {
      params: { page },
    });

    return response.data;
  } catch (error) {
    console.error('Failed to get upcoming movies:', error);
    throw new Error('公開予定映画の取得に失敗しました');
  }
}

// 使用例
const upcomingMovies = await getUpcomingMovies(1);
```

### 5. 現在上映中の映画取得

```typescript
export async function getNowPlayingMovies(
  page: number = 1
): Promise<TMDbMovieListResponse> {
  try {
    const response = await tmdbClient.get<TMDbMovieListResponse>('/movie/now_playing', {
      params: { page },
    });

    return response.data;
  } catch (error) {
    console.error('Failed to get now playing movies:', error);
    throw new Error('現在上映中の映画の取得に失敗しました');
  }
}

// 使用例
const nowPlayingMovies = await getNowPlayingMovies(1);
```

### 6. 日付範囲で映画取得（カスタム）

```typescript
export async function getMoviesByDateRange(
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD
  page: number = 1
): Promise<TMDbMovieListResponse> {
  try {
    const response = await tmdbClient.get<TMDbMovieListResponse>('/discover/movie', {
      params: {
        'primary_release_date.gte': startDate,
        'primary_release_date.lte': endDate,
        sort_by: 'primary_release_date.asc',
        page,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Failed to get movies by date range:', error);
    throw new Error('期間指定での映画取得に失敗しました');
  }
}

// 使用例
const today = new Date().toISOString().split('T')[0];
const threeMonthsLater = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split('T')[0];
const moviesInRange = await getMoviesByDateRange(today, threeMonthsLater, 1);
```

## 画像URL生成

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
): Promise<TMDbMovieDetail[]> {
  const results: TMDbMovieDetail[] = [];

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
): Promise<TMDbMovieDetail | null> {
  try {
    const response = await tmdbClient.get<TMDbMovieDetail>(`/movie/${movieId}`);
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
): Promise<TMDbMovieListResponse> {
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
): Promise<TMDbMovieDetail> {
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
export const mockTMDbMovie: TMDbMovie = {
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

export const mockGetMovieDetail = jest.fn().mockResolvedValue(mockTMDbMovie);
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
