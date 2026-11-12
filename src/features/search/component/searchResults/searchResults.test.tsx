/**
 * SearchResultsコンポーネントのテスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SearchResults } from './searchResults';
import { STORAGE_KEYS } from '@/constants';
import type { SearchResultsProps } from './searchResults';
import type { Movie } from '@/lib/types';

// --- Mocks ---
jest.mock('@/components/ui/movie/movieTile/movieTile', () => ({
  MovieTile: jest.fn(({ movie, onClick, viewMode }) => (
    <div
      data-testid={`movie-tile-${movie.id}`}
      data-view-mode={viewMode}
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
    TitleSuggestion: jest.fn(({ suggestions, isLoading }) => {
      if (isLoading || !suggestions || suggestions.length === 0) return null;
      return (
        <div data-testid='title-suggestion'>
          {suggestions.map((s: string) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      );
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
    // 表示モードは localStorage に残るので、テスト間で引きずらせない
    localStorage.clear();
  });

  // 表示切替は共通設定（#1014）
  describe('表示モード', () => {
    it('既定ではグリッドの並びで出す', () => {
      const { container } = renderSearchResults();

      expect(
        container.querySelector('.c_movie_grid_container__grid'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('movie-tile-1')).toHaveAttribute(
        'data-view-mode',
        'grid',
      );
    });

    it('リスト設定なら一覧もタイルもリストになる', () => {
      localStorage.setItem(STORAGE_KEYS.MOVIE_VIEW_MODE, 'list');

      const { container } = renderSearchResults();

      expect(
        container.querySelector('.c_movie_grid_container__list'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('movie-tile-1')).toHaveAttribute(
        'data-view-mode',
        'list',
      );
    });

    it('読み込み中のスケルトンもリストの並びにする', () => {
      localStorage.setItem(STORAGE_KEYS.MOVIE_VIEW_MODE, 'list');

      const { container } = renderSearchResults({ isLoading: true });

      expect(
        container.querySelector('.c_movie_grid_container__list'),
      ).toBeInTheDocument();
    });
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
        suggestions: ['The Shawshank Redemption', 'Shawshank'],
        isSuggestionLoading: false,
      });

      expect(screen.getByTestId('title-suggestion')).toBeInTheDocument();
    });

    it('結果が空で提案なしの場合はTitleSuggestionを表示しない', () => {
      renderSearchResults({
        movies: [],
        suggestions: [],
        isSuggestionLoading: false,
      });

      expect(screen.queryByTestId('title-suggestion')).not.toBeInTheDocument();
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

  // 映画詳細は /movies/[id] というURLを持つルートになった（#1033）。
  // 遷移はタイル側のリンクが担うので、一覧は関与しない
  describe('詳細への導線', () => {
    it('MovieTileにクリックハンドラを渡さない', () => {
      const { MovieTile } = jest.requireMock(
        '@/components/ui/movie/movieTile/movieTile',
      );

      renderSearchResults();

      expect(MovieTile).toHaveBeenCalled();
      for (const [props] of MovieTile.mock.calls) {
        expect(props.onClick).toBeUndefined();
      }
    });
  });
});
