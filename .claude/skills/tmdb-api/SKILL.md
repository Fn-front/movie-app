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

- **Base URL**: `https://api.themoviedb.org/3`
- **認証**: API Key（環境変数から取得）
- **言語**: `ja-JP`（日本語）
- **レート制限**: 50リクエスト/秒、20コネクション/IP
- **HTTP Client**: axios（外部API用）

### アーキテクチャ原則

- **APIクライアント分離**: `lib/api/tmdb.ts`に実装
- **型定義**: TMDbレスポンスの型を定義
- **エラーハンドリング**: try-catchで適切に処理
- **レート制限対策**: 並列リクエストは10件程度に制限

## ファイル構成

```
src/lib/api/
├── tmdb.ts              # TMDb APIクライアント
└── types/
    └── tmdb.ts          # TMDb型定義

.env.local
└── TMDB_API_KEY         # TMDb APIキー
```

## axiosインスタンス設定

```typescript
// src/lib/api/tmdb.ts
import axios from 'axios';

const tmdbClient = axios.create({
  baseURL: 'https://api.themoviedb.org/3',
  params: {
    api_key: process.env.NEXT_PUBLIC_TMDB_API_KEY,
    language: 'ja-JP',
  },
  timeout: 10000, // 10秒タイムアウト
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
    `https://api.themoviedb.org/3/movie/popular?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&language=ja-JP&page=${page}`,
    {
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
NEXT_PUBLIC_TMDB_API_KEY=your_api_key_here
```

### APIキー取得方法

1. https://www.themoviedb.org/ でアカウント作成
2. Settings > API > Create > Developer を選択
3. API Keyをコピー
4. `.env.local`に追加

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
