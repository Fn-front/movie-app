import { render, screen, fireEvent } from '@testing-library/react';

import { RecommendationSection } from './recommendationSection';

// --- Mocks ---

jest.mock('@/components/ui/movie/movieTile/movieTile', () => ({
  MovieTile: ({
    movie,
    onClick,
    onFavoriteToggle,
    onWatchlistToggle,
    onDismiss,
    dismissDisabled,
  }: {
    movie: { id: number; title: string };
    onClick?: (movieId: number) => void;
    onFavoriteToggle?: () => void;
    onWatchlistToggle?: () => void;
    onDismiss?: (movie: { id: number; title: string }) => void;
    dismissDisabled?: boolean;
  }) => (
    <div
      data-testid={`movie-tile-${movie.id}`}
      role='button'
      tabIndex={0}
      aria-label={`${movie.title}`}
      onClick={() => onClick?.(movie.id)}
      onKeyDown={() => {}}
    >
      {movie.title}
      {onFavoriteToggle && (
        <button
          data-testid={`favorite-btn-${movie.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onFavoriteToggle();
          }}
        >
          お気に入り
        </button>
      )}
      {onWatchlistToggle && (
        <button
          data-testid={`watchlist-btn-${movie.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onWatchlistToggle();
          }}
        >
          ウォッチリスト
        </button>
      )}
      {onDismiss && (
        <button
          data-testid={`dismiss-btn-${movie.id}`}
          disabled={dismissDisabled}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(movie);
          }}
        >
          興味なし
        </button>
      )}
    </div>
  ),
}));

jest.mock('@/components/ui/movie/detailModal/movieDetailModal', () => ({
  MovieDetailModal: ({
    movieId,
    onClose,
  }: {
    movieId: number | null;
    onClose: () => void;
  }) =>
    movieId ? (
      <div data-testid='movie-detail-modal'>
        <span>Movie ID: {movieId}</span>
        <button onClick={onClose}>閉じる</button>
      </div>
    ) : null,
}));

const mockHandleFavoriteToggle = jest.fn();
const mockCloseFavoriteModal = jest.fn();
const mockHandleFavoriteModalSubmit = jest.fn();
const mockHandleFavoriteDelete = jest.fn();
const mockIsFavoriteProcessing = jest.fn().mockReturnValue(false);

const mockGetFavoriteInfo = jest.fn().mockReturnValue(null);

jest.mock('@/features/favorites/hooks/useFavoriteToggle', () => ({
  useFavoriteToggle: () => ({
    modalState: { isOpen: false, movie: null, currentFavorite: null },
    handleFavoriteToggle: mockHandleFavoriteToggle,
    closeModal: mockCloseFavoriteModal,
    handleModalSubmit: mockHandleFavoriteModalSubmit,
    handleDelete: mockHandleFavoriteDelete,
    isFavoriteProcessing: mockIsFavoriteProcessing,
    getFavoriteInfo: mockGetFavoriteInfo,
  }),
}));

jest.mock(
  '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal',
  () => ({
    FavoriteRatingModal: () => <div data-testid='favorite-rating-modal' />,
  }),
);

const mockIsInWatchlist = jest.fn().mockReturnValue(false);
const mockToggleWatchlist = jest.fn();
const mockIsMovieToggling = jest.fn().mockReturnValue(false);

jest.mock('@/features/watchlist/hooks/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({
    isInWatchlist: mockIsInWatchlist,
    toggleWatchlist: mockToggleWatchlist,
    isToggling: false,
    isMovieToggling: mockIsMovieToggling,
  }),
}));

const mockDismissMovie = jest.fn();
const mockIsDismissingMovie = jest.fn().mockReturnValue(false);
const mockDismissedIds = new Set<number>();

jest.mock('@/features/dismissedMovies/hooks/useDismissMovie', () => ({
  useDismissMovie: () => ({
    dismissMovie: mockDismissMovie,
    isDismissing: false,
    isDismissingMovie: mockIsDismissingMovie,
    dismissedIds: mockDismissedIds,
  }),
}));

const mockRefresh = jest.fn();
let mockRefreshState = {
  isRefreshing: false,
  remainingCount: 7,
  maxCount: 10,
  usedCount: 3,
  isLimitReached: false,
  isCountLoading: false,
};

jest.mock('@/features/recommendations/hooks/useRecommendationRefresh', () => ({
  useRecommendationRefresh: () => ({
    refresh: mockRefresh,
    ...mockRefreshState,
  }),
}));

// --- Helpers ---

const createMockRecommendations = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `rec-${i + 1}`,
    tmdb_movie_id: 100 + i,
    title: `おすすめ映画 ${i + 1}`,
    poster_path: `/poster${i + 1}.jpg`,
    release_date: '2026-01-01',
    vote_average: 7.5,
    genre_ids: [878],
    reason: `理由 ${i + 1}`,
    display_order: i + 1,
  }));

// --- Tests ---

describe('RecommendationSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDismissedIds.clear();
    mockGetFavoriteInfo.mockReturnValue(null);
    mockIsFavoriteProcessing.mockReturnValue(false);
    mockIsInWatchlist.mockReturnValue(false);
    mockIsMovieToggling.mockReturnValue(false);
    mockIsDismissingMovie.mockReturnValue(false);
    mockRefreshState = {
      isRefreshing: false,
      remainingCount: 7,
      maxCount: 10,
      usedCount: 3,
      isLimitReached: false,
      isCountLoading: false,
    };
  });

  describe('お気に入り0件', () => {
    it('登録促進テキストが表示される', () => {
      render(
        <RecommendationSection recommendations={[]} hasFavorites={false} />,
      );

      expect(screen.getByText('あなたへのおすすめ')).toBeInTheDocument();
      expect(
        screen.getByText(
          'お気に入りを登録すると、AIがおすすめ映画を提案します',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('レコメンド未生成', () => {
    it('準備中テキストが表示される', () => {
      render(
        <RecommendationSection recommendations={[]} hasFavorites={true} />,
      );

      expect(screen.getByText('あなたへのおすすめ')).toBeInTheDocument();
      expect(screen.getByText('おすすめ映画を準備中です')).toBeInTheDocument();
    });
  });

  describe('レコメンドあり', () => {
    it('MovieTileが表示される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(3)}
          hasFavorites={true}
        />,
      );

      expect(screen.getByText('あなたへのおすすめ')).toBeInTheDocument();
      expect(screen.getByText('おすすめ映画 1')).toBeInTheDocument();
      expect(screen.getByText('おすすめ映画 2')).toBeInTheDocument();
      expect(screen.getByText('おすすめ映画 3')).toBeInTheDocument();
    });

    it('推薦理由が表示される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(2)}
          hasFavorites={true}
        />,
      );

      expect(screen.getByText('理由 1')).toBeInTheDocument();
      expect(screen.getByText('理由 2')).toBeInTheDocument();
    });

    it('グリッドにrole=listが設定される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      expect(screen.getByRole('list')).toBeInTheDocument();
    });

    it('各アイテムにrole=listitemが設定される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(3)}
          hasFavorites={true}
        />,
      );

      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });
  });

  describe('モーダル連携', () => {
    it('タイルクリックでMovieDetailModalが表示される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      fireEvent.click(
        screen.getByRole('button', {
          name: 'おすすめ映画 1',
        }),
      );
      expect(screen.getByTestId('movie-detail-modal')).toBeInTheDocument();
      expect(screen.getByText('Movie ID: 100')).toBeInTheDocument();
    });

    it('モーダルの閉じるボタンでモーダルが非表示になる', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      fireEvent.click(
        screen.getByRole('button', {
          name: 'おすすめ映画 1',
        }),
      );
      expect(screen.getByTestId('movie-detail-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByText('閉じる'));
      expect(
        screen.queryByTestId('movie-detail-modal'),
      ).not.toBeInTheDocument();
    });
  });

  describe('ウォッチリストボタン', () => {
    it('各MovieTileにウォッチリストボタンが表示される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(2)}
          hasFavorites={true}
        />,
      );

      expect(screen.getByTestId('watchlist-btn-100')).toBeInTheDocument();
      expect(screen.getByTestId('watchlist-btn-101')).toBeInTheDocument();
    });
  });

  describe('お気に入りボタン', () => {
    it('各MovieTileにお気に入りボタンが表示される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(2)}
          hasFavorites={true}
        />,
      );

      expect(screen.getByTestId('favorite-btn-100')).toBeInTheDocument();
      expect(screen.getByTestId('favorite-btn-101')).toBeInTheDocument();
    });

    it('FavoriteRatingModalがレンダリングされる', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      expect(screen.getByTestId('favorite-rating-modal')).toBeInTheDocument();
    });
  });

  describe('興味なしボタン', () => {
    it('各MovieTileに興味なしボタンが表示される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(2)}
          hasFavorites={true}
        />,
      );

      expect(screen.getByTestId('dismiss-btn-100')).toBeInTheDocument();
      expect(screen.getByTestId('dismiss-btn-101')).toBeInTheDocument();
    });

    it('お気に入り済みの映画は興味なしボタンが無効になる', () => {
      mockGetFavoriteInfo.mockImplementation((id: number) =>
        id === 100 ? { id: 'fav-1', rating: 8 } : null,
      );

      render(
        <RecommendationSection
          recommendations={createMockRecommendations(2)}
          hasFavorites={true}
        />,
      );

      expect(screen.getByTestId('dismiss-btn-100')).toBeDisabled();
      expect(screen.getByTestId('dismiss-btn-101')).not.toBeDisabled();
    });

    it('興味なしボタンクリックでdismissMovieが呼ばれる', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      fireEvent.click(screen.getByTestId('dismiss-btn-100'));

      expect(mockDismissMovie).toHaveBeenCalledWith(
        expect.objectContaining({
          tmdb_movie_id: 100,
          title: 'おすすめ映画 1',
        }),
      );
    });

    it('dismissされた映画がリストから除外される', () => {
      mockDismissedIds.add(100);

      render(
        <RecommendationSection
          recommendations={createMockRecommendations(3)}
          hasFavorites={true}
        />,
      );

      expect(screen.queryByTestId('movie-tile-100')).not.toBeInTheDocument();
      expect(screen.getByTestId('movie-tile-101')).toBeInTheDocument();
      expect(screen.getByTestId('movie-tile-102')).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('sectionにaria-labelが設定される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      expect(
        screen.getByRole('region', { name: 'あなたへのおすすめ' }),
      ).toBeInTheDocument();
    });
  });

  describe('更新ボタン', () => {
    it('更新ボタンが表示される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      expect(
        screen.getByRole('button', { name: 'おすすめを更新' }),
      ).toBeInTheDocument();
    });

    it('残り回数が表示される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      expect(screen.getByText('残り7回 / 月10回')).toBeInTheDocument();
    });

    it('更新ボタンクリックでrefreshが呼ばれる', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'おすすめを更新' }));

      expect(mockRefresh).toHaveBeenCalled();
    });

    it('上限到達時にボタンが無効化される', () => {
      mockRefreshState = {
        ...mockRefreshState,
        remainingCount: 0,
        isLimitReached: true,
      };

      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      expect(
        screen.getByRole('button', { name: 'おすすめを更新' }),
      ).toBeDisabled();
    });

    it('上限到達時にリセット通知が表示される', () => {
      mockRefreshState = {
        ...mockRefreshState,
        remainingCount: 0,
        isLimitReached: true,
      };

      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      expect(screen.getByText('来月リセットされます')).toBeInTheDocument();
    });

    it('更新中はボタンが無効化される', () => {
      mockRefreshState = {
        ...mockRefreshState,
        isRefreshing: true,
      };

      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      expect(
        screen.getByRole('button', { name: 'おすすめを更新' }),
      ).toBeDisabled();
    });

    it('更新中はグリッドエリアにローディングオーバーレイが表示される', () => {
      mockRefreshState = {
        ...mockRefreshState,
        isRefreshing: true,
      };

      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      expect(screen.getByText('おすすめを更新中...')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('更新中でないときはローディングオーバーレイが非表示', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      expect(
        screen.queryByText('おすすめを更新中...'),
      ).not.toBeInTheDocument();
    });

    it('カウントローディング中は残り回数が非表示', () => {
      mockRefreshState = {
        ...mockRefreshState,
        isCountLoading: true,
      };

      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      expect(screen.queryByText(/残り/)).not.toBeInTheDocument();
    });

    it('お気に入り0件の場合は更新ボタンが表示されない', () => {
      render(
        <RecommendationSection recommendations={[]} hasFavorites={false} />,
      );

      expect(
        screen.queryByRole('button', { name: 'おすすめを更新' }),
      ).not.toBeInTheDocument();
    });
  });
});
