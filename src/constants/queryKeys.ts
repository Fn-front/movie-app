/**
 * TanStack Query クエリキーファクトリー
 */

import type { GetMoviesRequest } from '@/lib/api/movies/movies';
import type { SearchMoviesRequest } from '@/lib/api/search/search';

export const movieKeys = {
  all: ['movies'] as const,
  list: (params: Omit<GetMoviesRequest, 'page'>) => ['movies', params] as const,
  detail: (movieId: number) => ['movies', 'detail', movieId] as const,
};

export const personKeys = {
  all: ['person'] as const,
  detail: (personId: number) => ['person', 'detail', personId] as const,
};

export const filterKeys = {
  saved: ['savedFilter'] as const,
};

export const watchlistKeys = {
  all: ['watchlist'] as const,
  list: (params?: {
    sort?: string;
    excludeWatched?: boolean;
    /** 配信中の未視聴を先頭に出すか。サイドバーと一覧でキャッシュを分ける */
    prioritizeStreaming?: boolean;
  }) => ['watchlist', 'list', params] as const,
  /** 視聴済みがある追加年の一覧 */
  watchedYears: () => ['watchlist', 'watchedYears'] as const,
  /**
   * 指定年の視聴済み一覧
   *
   * 年が未選択（null）の状態でもキーは組まれる（クエリ自体は enabled で止める）。
   * 架空の年 0 に丸めるとキャッシュの意味がずれるため、null のまま持つ。
   */
  watched: (year: number | null) => ['watchlist', 'watched', year] as const,
  /**
   * 登録済み判定用の照会（全件・ページングなし）
   *
   * ソートも `excludeWatched` も持たないので、どの画面から呼んでも同じキーになる。
   * `list` とキーが分かれているのは意図通りで、サイドバーが上位10件・未視聴のみ
   * しか読まないせいで登録済みを取りこぼしていた問題を切り離すためにある（#1145）。
   *
   * ⚠️ プレフィックスが `watchlist` なので、`watchlistKeys.all` を指定した
   * `invalidateQueries` / `cancelQueries` の対象に**自動的に含まれる**。
   * 追加・削除のあとに照会が更新されるのはこれに依っている
   */
  lookup: () => ['watchlist', 'lookup'] as const,
};

export const calendarKeys = {
  all: ['calendar'] as const,
  month: (month: string) => ['calendar', month] as const,
};

export const searchKeys = {
  all: ['search'] as const,
  results: (params: SearchMoviesRequest) => ['search', params] as const,
};

export const titleSuggestionKeys = {
  all: ['titleSuggestion'] as const,
  query: (query: string) => ['titleSuggestion', query] as const,
};

export const genreKeys = {
  all: ['genres'] as const,
};

export const favoriteKeys = {
  all: ['favorites'] as const,
  list: (params?: { sort_by?: string; sort_order?: string }) =>
    ['favorites', 'list', params] as const,
  /**
   * 登録済み判定用の照会（全件・ページングなし）
   *
   * ソート条件を持たないので、どの画面から呼んでも同じキーになる。
   * `list` とキーが分かれているのは意図通りで、お気に入りページでの
   * 並び替えが他画面の判定に影響しないようにしている
   */
  lookup: () => ['favorites', 'lookup'] as const,
};

export const recommendationKeys = {
  all: ['recommendations'] as const,
  /**
   * レコメンド一覧（#1115 でサーバー取得からクライアント取得へ移した）
   *
   * セクションと詳細モーダルが**同じキーを読む**ことで、モーダルの
   * アクセシブル名に出す作品名を共有する
   */
  list: ['recommendations', 'list'] as const,
  refreshCount: ['recommendations', 'refreshCount'] as const,
};

export const awardKeys = {
  all: ['awards'] as const,
  /**
   * @param cacheBuster 手動同期直後の取り直し用。キーに含めないと
   *   React Query が前回の結果を返して古いデータが残る
   */
  year: (year: number, cacheBuster?: string) =>
    cacheBuster
      ? (['awards', year, cacheBuster] as const)
      : (['awards', year] as const),
};

export const theaterKeys = {
  all: ['theaters'] as const,
  list: ['theaters', 'list'] as const,
  detail: (slug: string) => ['theaters', slug] as const,
};
