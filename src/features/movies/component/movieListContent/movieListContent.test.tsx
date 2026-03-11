import { render, screen, fireEvent } from '@testing-library/react';

import { MovieListContent } from './movieListContent';
import type { UseMovieListReturn } from '@/features/movies/hooks/useMovieList';
import type { MovieCacheItem } from '@/lib/api/movies/movies';

// --- Mocks ---

jest.mock('@/hooks/useIntersectionObserver', () => ({
  useIntersectionObserver: () => ({ current: null }),
}));

jest.mock('@/features/watchlist/hooks/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({
    isInWatchlist: jest.fn().mockReturnValue(false),
    toggleWatchlist: jest.fn(),
    isToggling: false,
    togglingMovieId: null,
  }),
}));

jest.mock('@/features/favorites/hooks/useFavoriteToggle', () => ({
  useFavoriteToggle: () => ({
    modalState: { isOpen: false, movie: null, currentFavorite: null },
    handleFavoriteToggle: jest.fn(),
    closeModal: jest.fn(),
    handleModalSubmit: jest.fn(),
    handleDelete: jest.fn(),
    isProcessing: false,
  }),
}));

jest.mock(
  '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal',
  () => ({
    FavoriteRatingModal: () => null,
  }),
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let capturedMovieDetailProps: {
  movieId: number | null;
  showFinancialInfo: boolean;
  onClose: () => void;
} | null = null;

jest.mock('@/components/ui/movie/detailModal/movieDetailModal', () => ({
  MovieDetailModal: (props: {
    movieId: number | null;
    showFinancialInfo: boolean;
    onClose: () => void;
  }) => {
    capturedMovieDetailProps = props;
    return props.movieId !== null ? (
      <div data-testid='movie-detail-modal'>
        <span data-testid='detail-movie-id'>{props.movieId}</span>
        <span data-testid='detail-financial'>
          {String(props.showFinancialInfo)}
        </span>
        <button data-testid='close-detail' onClick={props.onClose}>
          閉じる
        </button>
      </div>
    ) : null;
  },
}));

// --- Helpers ---

const createMockMovie = (
  overrides?: Partial<MovieCacheItem>,
): MovieCacheItem => ({
  id: 1,
  title: 'テスト映画',
  poster_path: '/test.jpg',
  backdrop_path: null,
  release_date: '2026-03-01',
  overview: 'テスト概要',
  vote_average: 7.5,
  popularity: 100,
  genre_ids: [28],
  release_type: 'theatrical',
  is_revival: false,
  ...overrides,
});

const createMockMovieList = (
  overrides?: Partial<UseMovieListReturn>,
): UseMovieListReturn => ({
  movies: [],
  isLoading: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: jest.fn(),
  sortBy: 'release_date',
  releaseType: 'theatrical',
  genres: { 28: 'アクション' },
  selectedGenreIds: [],
  dateRange: {},
  isRevivalFilter: undefined,
  isFilterModalOpen: false,
  handleSortChange: jest.fn(),
  handleReleaseTypeChange: jest.fn(),
  handleFilterApply: jest.fn(),
  handleFilterModalOpen: jest.fn(),
  handleFilterModalClose: jest.fn(),
  ...overrides,
});

// --- Tests ---

describe('MovieListContent', () => {
  describe('表示', () => {
    it('タイトルが表示される', () => {
      render(
        <MovieListContent title='公開予定' movieList={createMockMovieList()} />,
      );
      expect(screen.getByText('公開予定')).toBeInTheDocument();
    });

    it('リリースタイプのタブが表示される', () => {
      render(
        <MovieListContent title='公開予定' movieList={createMockMovieList()} />,
      );
      expect(screen.getByRole('tab', { name: '劇場公開' })).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: 'ストリーミング' }),
      ).toBeInTheDocument();
    });

    it('フィルターボタンが表示される', () => {
      render(
        <MovieListContent title='公開予定' movieList={createMockMovieList()} />,
      );
      expect(
        screen.getByRole('button', { name: 'フィルター' }),
      ).toBeInTheDocument();
    });

    it('ソート選択が表示される', () => {
      render(
        <MovieListContent title='公開予定' movieList={createMockMovieList()} />,
      );
      expect(
        screen.getByRole('combobox', { name: 'ソート順を選択' }),
      ).toBeInTheDocument();
    });
  });

  describe('ローディング状態', () => {
    it('isLoading=trueの場合スケルトンが表示される', () => {
      const { container } = render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ isLoading: true })}
        />,
      );
      const skeletons = container.querySelectorAll('.c_movie_tile_skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('isLoading=trueの場合映画タイルが表示されない', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            isLoading: true,
            movies: [createMockMovie()],
          })}
        />,
      );
      expect(screen.queryByText('テスト映画')).not.toBeInTheDocument();
    });

    it('isFetchingNextPage=trueの場合ローディングが表示される', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            isFetchingNextPage: true,
            movies: [createMockMovie()],
          })}
        />,
      );
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });
  });

  describe('映画一覧', () => {
    it('映画が表示される', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            movies: [
              createMockMovie({ id: 1, title: '映画A' }),
              createMockMovie({ id: 2, title: '映画B' }),
            ],
          })}
        />,
      );
      expect(screen.getByText('映画A')).toBeInTheDocument();
      expect(screen.getByText('映画B')).toBeInTheDocument();
    });

    it('映画が空でローディングでない場合空メッセージが表示される', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ movies: [], isLoading: false })}
        />,
      );
      expect(
        screen.getByText('表示する映画がありません。'),
      ).toBeInTheDocument();
    });

    it('映画がある場合空メッセージが表示されない', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            movies: [createMockMovie()],
          })}
        />,
      );
      expect(
        screen.queryByText('表示する映画がありません。'),
      ).not.toBeInTheDocument();
    });
  });

  describe('フィルターバッジ', () => {
    it('ジャンルが選択されている場合バッジが表示される', () => {
      const { container } = render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ selectedGenreIds: [28] })}
        />,
      );
      expect(
        container.querySelector('.c_movie_list__filter_count'),
      ).toBeInTheDocument();
    });

    it('日付範囲gteがある場合バッジが表示される', () => {
      const { container } = render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            dateRange: { gte: '2026-03-01' },
          })}
        />,
      );
      expect(
        container.querySelector('.c_movie_list__filter_count'),
      ).toBeInTheDocument();
    });

    it('isRevivalFilterが設定されている場合バッジが表示される', () => {
      const { container } = render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ isRevivalFilter: false })}
        />,
      );
      expect(
        container.querySelector('.c_movie_list__filter_count'),
      ).toBeInTheDocument();
    });

    it('フィルターが無効な場合バッジが表示されない', () => {
      const { container } = render(
        <MovieListContent title='公開予定' movieList={createMockMovieList()} />,
      );
      expect(
        container.querySelector('.c_movie_list__filter_count'),
      ).not.toBeInTheDocument();
    });
  });

  describe('インタラクション', () => {
    it('タブクリックでhandleReleaseTypeChangeが呼ばれる', () => {
      const handleReleaseTypeChange = jest.fn();
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ handleReleaseTypeChange })}
        />,
      );

      // Radix TabsはmouseDownで値を変更する
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'ストリーミング' }));
      expect(handleReleaseTypeChange).toHaveBeenCalledWith('streaming');
    });

    it('フィルターボタンクリックでhandleFilterModalOpenが呼ばれる', () => {
      const handleFilterModalOpen = jest.fn();
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ handleFilterModalOpen })}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'フィルター' }));
      expect(handleFilterModalOpen).toHaveBeenCalled();
    });

    it('映画タイルクリックで詳細モーダルにmovieIdが渡される', () => {
      const pastDate = '2020-01-01';
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            movies: [
              createMockMovie({
                id: 42,
                title: 'クリック映画',
                release_date: pastDate,
              }),
            ],
          })}
        />,
      );

      // MovieTileをクリック
      fireEvent.click(screen.getByText('クリック映画'));
      expect(screen.getByTestId('detail-movie-id')).toHaveTextContent('42');
    });

    it('公開済み映画クリックでshowFinancialInfo=trueが渡される', () => {
      const pastDate = '2020-01-01';
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            movies: [
              createMockMovie({
                id: 10,
                title: '公開済み映画',
                release_date: pastDate,
              }),
            ],
          })}
        />,
      );

      fireEvent.click(screen.getByText('公開済み映画'));
      expect(screen.getByTestId('detail-financial')).toHaveTextContent('true');
    });

    it('未公開映画クリックでshowFinancialInfo=falseが渡される', () => {
      const futureDate = '2099-12-31';
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            movies: [
              createMockMovie({
                id: 20,
                title: '未公開映画',
                release_date: futureDate,
                is_revival: false,
              }),
            ],
          })}
        />,
      );

      fireEvent.click(screen.getByText('未公開映画'));
      expect(screen.getByTestId('detail-financial')).toHaveTextContent('false');
    });

    it('リバイバル映画クリックでshowFinancialInfo=trueが渡される', () => {
      const futureDate = '2099-12-31';
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            movies: [
              createMockMovie({
                id: 30,
                title: 'リバイバル映画',
                release_date: futureDate,
                is_revival: true,
              }),
            ],
          })}
        />,
      );

      fireEvent.click(screen.getByText('リバイバル映画'));
      expect(screen.getByTestId('detail-financial')).toHaveTextContent('true');
    });

    it('release_dateがnullの映画クリックでshowFinancialInfo=falseが渡される', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            movies: [
              createMockMovie({
                id: 40,
                title: '日付なし映画',
                release_date: null as unknown as string,
                is_revival: false,
              }),
            ],
          })}
        />,
      );

      fireEvent.click(screen.getByText('日付なし映画'));
      expect(screen.getByTestId('detail-financial')).toHaveTextContent('false');
    });

    it('詳細モーダルを閉じるとmovieIdがnullに戻る', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            movies: [createMockMovie({ id: 50, title: '閉じるテスト映画' })],
          })}
        />,
      );

      // 映画をクリックしてモーダルを開く
      fireEvent.click(screen.getByText('閉じるテスト映画'));
      expect(screen.getByTestId('movie-detail-modal')).toBeInTheDocument();

      // モーダルを閉じる
      fireEvent.click(screen.getByTestId('close-detail'));
      expect(
        screen.queryByTestId('movie-detail-modal'),
      ).not.toBeInTheDocument();
    });
  });

  describe('フィルターバッジ（追加分岐）', () => {
    it('日付範囲lteのみがある場合もバッジが表示される', () => {
      const { container } = render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            dateRange: { lte: '2026-12-31' },
          })}
        />,
      );
      expect(
        container.querySelector('.c_movie_list__filter_count'),
      ).toBeInTheDocument();
    });

    it('isRevivalFilter=trueの場合もバッジが表示される', () => {
      const { container } = render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ isRevivalFilter: true })}
        />,
      );
      expect(
        container.querySelector('.c_movie_list__filter_count'),
      ).toBeInTheDocument();
    });
  });

  describe('空メッセージの追加分岐', () => {
    it('isLoading=trueかつmoviesが空の場合、空メッセージは表示されない', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ isLoading: true, movies: [] })}
        />,
      );
      expect(
        screen.queryByText('表示する映画がありません。'),
      ).not.toBeInTheDocument();
    });

    it('isFetchingNextPage=falseの場合ローディングが表示されない', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            isFetchingNextPage: false,
            movies: [createMockMovie()],
          })}
        />,
      );
      expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
    });
  });

  describe('FilterModal連携', () => {
    it('handleFilterModalCloseが呼ばれる', () => {
      const handleFilterModalClose = jest.fn();
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            isFilterModalOpen: true,
            handleFilterModalClose,
          })}
        />,
      );
      // FilterModalが開いている状態で表示される
      expect(screen.getByText('フィルター')).toBeInTheDocument();
    });
  });
});
