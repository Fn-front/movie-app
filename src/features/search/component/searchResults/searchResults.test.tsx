/**
 * SearchResultsコンポーネントのテスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SearchResults } from './searchResults';
import type { SearchResultsProps } from './searchResults';
import type { Movie } from '@/lib/types';

// --- Mocks ---
jest.mock('@/components/ui/movie/movieTile/movieTile', () => ({
  MovieTile: jest.fn(({ movie, onClick }) => (
    <div
      data-testid={`movie-tile-${movie.id}`}
      onClick={() => onClick?.(movie.id)}
    >
      {movie.title}
    </div>
  )),
}));

jest.mock('@/components/ui/movie/movieTileSkeleton/movieTileSkeleton', () => ({
  MovieTileSkeleton: jest.fn(() => (
    <div data-testid='movie-tile-skeleton'>Loading...</div>
  )),
}));

jest.mock('@/components/ui/pagination/pagination', () => ({
  Pagination: jest.fn(({ currentPage, totalPages, onPageChange }) => (
    <nav data-testid='pagination'>
      <span>
        ページ {currentPage} / {totalPages}
      </span>
      <button onClick={() => onPageChange(currentPage + 1)}>次のページ</button>
    </nav>
  )),
}));

jest.mock('@/components/ui/emptyState/emptyState', () => ({
  EmptyState: jest.fn(({ title, description }) => (
    <div data-testid='empty-state'>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )),
}));

jest.mock('@/components/ui/movie/detailModal/movieDetailModal', () => ({
  MovieDetailModal: jest.fn(() => null),
}));

jest.mock('@/features/watchlist/hooks/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({
    isInWatchlist: jest.fn(() => false),
    toggleWatchlist: jest.fn(),
    isMovieToggling: jest.fn(() => false),
  }),
}));

jest.mock('@/features/favorites/hooks/useFavoriteToggle', () => ({
  useFavoriteToggle: () => ({
    modalState: { isOpen: false, movie: null, currentFavorite: null },
    handleFavoriteToggle: jest.fn(),
    closeModal: jest.fn(),
    handleModalSubmit: jest.fn(),
    handleDelete: jest.fn(),
    isFavoriteProcessing: jest.fn(() => false),
    getFavoriteInfo: jest.fn(() => null),
  }),
}));

jest.mock(
  '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal',
  () => ({
    FavoriteRatingModal: jest.fn(() => null),
  }),
);

jest.mock(
  '@/features/search/component/titleSuggestion/titleSuggestion',
  () => ({
    TitleSuggestion: jest.fn(({ suggestion, isLoading }) => {
      if (isLoading || !suggestion) return null;
      return <div data-testid='title-suggestion'>{suggestion}ですか？</div>;
    }),
  }),
);

// --- Helpers ---
const createMockMovie = (overrides?: Partial<Movie>): Movie => ({
  id: 1,
  title: 'テスト映画',
  original_title: 'Test Movie',
  overview: 'テスト概要',
  poster_path: '/test.jpg',
  backdrop_path: '/backdrop.jpg',
  release_date: '2024-01-01',
  vote_average: 7.5,
  vote_count: 100,
  popularity: 50,
  genre_ids: [28, 12],
  adult: false,
  original_language: 'ja',
  ...overrides,
});

const defaultProps: SearchResultsProps = {
  movies: [
    createMockMovie({ id: 1, title: '映画1' }),
    createMockMovie({ id: 2, title: '映画2' }),
    createMockMovie({ id: 3, title: '映画3' }),
  ],
  totalResults: 100,
  currentPage: 1,
  totalPages: 5,
  onPageChange: jest.fn(),
  isLoading: false,
};

const renderSearchResults = (overrides?: Partial<SearchResultsProps>) => {
  const props = { ...defaultProps, ...overrides };
  return render(<SearchResults {...props} />);
};

// --- Tests ---
describe('SearchResults', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('検索結果の表示', () => {
    it('結果件数を表示する', () => {
      renderSearchResults();

      expect(screen.getByText('100件の検索結果')).toBeInTheDocument();
    });

    it('映画一覧を表示する', () => {
      renderSearchResults();

      expect(screen.getByTestId('movie-tile-1')).toBeInTheDocument();
      expect(screen.getByTestId('movie-tile-2')).toBeInTheDocument();
      expect(screen.getByTestId('movie-tile-3')).toBeInTheDocument();
    });

    it('ページネーションを表示する', () => {
      renderSearchResults();

      expect(screen.getByTestId('pagination')).toBeInTheDocument();
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中はスケルトンを表示する', () => {
      renderSearchResults({ isLoading: true });

      expect(screen.getByTestId('movie-tile-skeleton')).toBeInTheDocument();
    });

    it('ローディング中は検索結果件数を表示しない', () => {
      renderSearchResults({ isLoading: true });

      expect(screen.queryByText('100件の検索結果')).not.toBeInTheDocument();
    });
  });

  describe('結果なし', () => {
    it('結果が空の場合はEmptyStateを表示する', () => {
      renderSearchResults({ movies: [] });

      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(
        screen.getByText('検索結果が見つかりませんでした'),
      ).toBeInTheDocument();
    });

    it('結果が空の場合はページネーションを表示しない', () => {
      renderSearchResults({ movies: [] });

      expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
    });

    it('結果が空で提案ありの場合にTitleSuggestionを表示する', () => {
      renderSearchResults({
        movies: [],
        suggestion: 'The Shawshank Redemption',
        isSuggestionLoading: false,
      });

      expect(screen.getByTestId('title-suggestion')).toBeInTheDocument();
    });

    it('結果が空で提案なしの場合はTitleSuggestionを表示しない', () => {
      renderSearchResults({
        movies: [],
        suggestion: null,
        isSuggestionLoading: false,
      });

      expect(
        screen.queryByTestId('title-suggestion'),
      ).not.toBeInTheDocument();
    });
  });

  describe('ページネーション操作', () => {
    it('ページ変更ハンドラーが呼ばれる', async () => {
      const onPageChange = jest.fn();
      renderSearchResults({ onPageChange });

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: '次のページ' }));

      expect(onPageChange).toHaveBeenCalledWith(2);
    });
  });

  describe('映画クリック', () => {
    it('映画タイルをクリックすると詳細モーダルが表示される', async () => {
      const { MovieDetailModal } = jest.requireMock(
        '@/components/ui/movie/detailModal/movieDetailModal',
      );

      renderSearchResults();

      const user = userEvent.setup();
      await user.click(screen.getByTestId('movie-tile-1'));

      expect(MovieDetailModal).toHaveBeenLastCalledWith(
        expect.objectContaining({ movieId: 1 }),
        expect.anything(),
      );
    });
  });
});
