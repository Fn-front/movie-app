import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RecommendationSection } from './recommendationSection';

// --- Mocks ---

// --- 映画詳細モーダル（URLクエリで開閉する・#1033）---

let mockSelectedMovieId: number | null = null;
const mockOpenMovieDetail = jest.fn();
const mockCloseMovieDetail = jest.fn();

jest.mock('@/features/movies/hooks/useMovieDetailQuery', () => ({
  useMovieDetailQuery: () => ({
    selectedMovieId: mockSelectedMovieId,
    openMovieDetail: mockOpenMovieDetail,
    closeMovieDetail: mockCloseMovieDetail,
  }),
  /**
   * 一覧タイルは URL を読まない軽い方を使う（#1115）。
   * ここを足し忘れると `undefined` を呼ぶことになり、描画ごと落ちる
   */
  useOpenMovieDetail: () => mockOpenMovieDetail,
}));

jest.mock('@/components/ui/movie/detailModal/movieDetailModal', () => ({
  MovieDetailModal: ({
    movieId,
    title,
    showFinancialInfo,
    onClose,
  }: {
    movieId: number | null;
    title?: string;
    showFinancialInfo?: boolean;
    onClose: () => void;
  }) =>
    movieId === null ? null : (
      <div
        data-testid='movie-detail-modal'
        data-financial={String(Boolean(showFinancialInfo))}
      >
        <span>{`Movie ID: ${movieId}`}</span>
        <span>{title}</span>
        <button onClick={onClose}>閉じる</button>
      </div>
    ),
}));

jest.mock('@/components/ui/movie/movieTile/movieTile', () => ({
  MovieTile: ({
    movie,
    onClick,
    onSelect,
    onFavoriteToggle,
    onWatchlistToggle,
    onDismiss,
    dismissDisabled,
  }: {
    movie: { id: number; title: string };
    onClick?: (movieId: number) => void;
    onSelect?: (movieId: number) => void;
    onFavoriteToggle?: () => void;
    onWatchlistToggle?: (movie: { id: number; title: string }) => void;
    onDismiss?: (movie: { id: number; title: string }) => void;
    dismissDisabled?: boolean;
  }) => (
    <div data-testid={`movie-tile-${movie.id}`}>
      {/*
        本物の MovieTile と同じ配線にする。`onClick` は計測用で遷移の仕方に
        よらず走り、`onSelect` は左クリックだけ横取りしてモーダルで開く（#1033）。
        `onSelect` を無視するモックにすると、セクションが `openMovieDetail` を
        渡さなくなっても気づけない
      */}
      <a
        href={`/movies/${movie.id}`}
        onClick={(e) => {
          onClick?.(movie.id);
          if (!onSelect) return;
          e.preventDefault();
          onSelect(movie.id);
        }}
      >
        {movie.title}
      </a>
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
            onWatchlistToggle(movie);
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
  isCoolingDown: false,
  isRefreshDisabled: false,
  remainingCount: 7,
  maxCount: 10,
  usedCount: 3,
  isLimitReached: false,
  isCountLoading: false,
};

/** 更新成功時に渡されるコールバック（キャッシュへの書き戻しを検証する） */
let capturedRefreshSuccess: ((recs: unknown[]) => void) | undefined;

/**
 * 残回数取得フックが動いた回数
 *
 * 本物は `/api/recommendations/refresh-count` を叩く。未認証で動くと
 * 401 を踏んで強制サインアウトへ倒れる（#1115 で実際に起きた）
 */
const mockUseRecommendationRefresh = jest.fn();

jest.mock('@/features/recommendations/hooks/useRecommendationRefresh', () => ({
  useRecommendationRefresh: (onSuccess?: (recs: unknown[]) => void) => {
    mockUseRecommendationRefresh();
    capturedRefreshSuccess = onSuccess;
    return { refresh: mockRefresh, ...mockRefreshState };
  },
}));

const mockObserveTile = jest.fn(() => () => {});
const mockTrackEvent = jest.fn();

jest.mock('@/features/recommendations/hooks/useRecommendationEvents', () => ({
  useRecommendationEvents: (...args: unknown[]) => {
    mockUseRecommendationEvents(...args);
    return { observeTile: mockObserveTile, trackEvent: mockTrackEvent };
  },
}));

const mockUseRecommendationEvents = jest.fn();

/**
 * レコメンドの取得（#1115 でサーバー取得からクライアント取得へ移した）
 *
 * ⚠️ セクションは props を受け取らなくなった。状態はここを書き換えて渡す
 */
const mockSetRecommendations = jest.fn();
let mockRecommendationsState: {
  recommendations: ReturnType<typeof createMockRecommendations>;
  hasFavorites: boolean;
  isAuthenticated: boolean;
  isPending: boolean;
  isError: boolean;
} = {
  recommendations: [],
  hasFavorites: false,
  isAuthenticated: true,
  isPending: false,
  isError: false,
};

jest.mock('@/features/recommendations/hooks/useRecommendations', () => ({
  useRecommendations: () => ({
    ...mockRecommendationsState,
    setRecommendations: mockSetRecommendations,
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
    vote_count: 1200,
    genre_ids: [878],
    reason: `理由 ${i + 1}`,
    display_order: i + 1,
  }));

/**
 * セクションを描画する
 *
 * props が無くなったので、フックのモックへ状態を流し込んでから描く
 */
const renderSection = (
  overrides: Partial<typeof mockRecommendationsState> = {},
) => {
  mockRecommendationsState = { ...mockRecommendationsState, ...overrides };
  return render(<RecommendationSection />);
};

// --- Tests ---

describe('RecommendationSection', () => {
  beforeEach(() => {
    mockSelectedMovieId = null;
    jest.clearAllMocks();
    mockDismissedIds.clear();
    mockGetFavoriteInfo.mockReturnValue(null);
    mockIsFavoriteProcessing.mockReturnValue(false);
    mockIsInWatchlist.mockReturnValue(false);
    mockIsMovieToggling.mockReturnValue(false);
    mockIsDismissingMovie.mockReturnValue(false);
    mockRecommendationsState = {
      recommendations: [],
      hasFavorites: false,
      isAuthenticated: true,
      isPending: false,
      isError: false,
    };
    mockRefreshState = {
      isRefreshing: false,
      isCoolingDown: false,
      isRefreshDisabled: false,
      remainingCount: 7,
      maxCount: 10,
      usedCount: 3,
      isLimitReached: false,
      isCountLoading: false,
    };
  });

  describe('お気に入り0件', () => {
    it('登録促進テキストが表示される', () => {
      renderSection({ recommendations: [], hasFavorites: false });

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
      renderSection({ recommendations: [], hasFavorites: true });

      expect(screen.getByText('あなたへのおすすめ')).toBeInTheDocument();
      expect(screen.getByText('おすすめ映画を準備中です')).toBeInTheDocument();
    });

    it('境界値: recommendations=[] かつ isRefreshing=true では準備中テキストが出ずグリッドが表示される', () => {
      mockRefreshState = {
        ...mockRefreshState,
        isRefreshing: true,
      };

      renderSection({ recommendations: [], hasFavorites: true });

      // 準備中は表示されず、代わりに更新中オーバーレイのグリッドが出る
      expect(
        screen.queryByText('おすすめ映画を準備中です'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('おすすめを更新中...')).toBeInTheDocument();
    });
  });

  describe('レコメンドあり', () => {
    it('MovieTileが表示される', () => {
      renderSection({
        recommendations: createMockRecommendations(3),
        hasFavorites: true,
      });

      expect(screen.getByText('あなたへのおすすめ')).toBeInTheDocument();
      expect(screen.getByText('おすすめ映画 1')).toBeInTheDocument();
      expect(screen.getByText('おすすめ映画 2')).toBeInTheDocument();
      expect(screen.getByText('おすすめ映画 3')).toBeInTheDocument();
    });

    it('推薦理由が表示される', () => {
      renderSection({
        recommendations: createMockRecommendations(2),
        hasFavorites: true,
      });

      expect(screen.getByText('理由 1')).toBeInTheDocument();
      expect(screen.getByText('理由 2')).toBeInTheDocument();
    });

    it('グリッドにrole=listが設定される', () => {
      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      expect(screen.getByRole('list')).toBeInTheDocument();
    });

    it('各アイテムにrole=listitemが設定される', () => {
      renderSection({
        recommendations: createMockRecommendations(3),
        hasFavorites: true,
      });

      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });
  });

  // 映画詳細は /movies/[id] というURLを持つルートになった（#1033）。
  // タイルは遷移せず「押された」ことだけを計測に渡す
  describe('詳細への導線', () => {
    it('タイルのタイトルが映画詳細へのリンクになる', () => {
      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      expect(
        screen.getByRole('link', { name: 'おすすめ映画 1' }),
      ).toHaveAttribute('href', '/movies/100');
    });

    it('タイルを押すとURLのクエリで詳細を開く', async () => {
      const user = userEvent.setup();
      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      await user.click(screen.getByRole('link', { name: 'おすすめ映画 1' }));

      expect(mockOpenMovieDetail).toHaveBeenCalledWith(100);
    });

    /**
     * モーダルはここではなくホームに1つだけ置く（`HomeMovieDetailModal`）
     *
     * 以前はこのコンポーネントと `NowShowingMovieList` の**両方**が
     * URL の `movie_id` を読むモーダルを描いていたため、ホームで
     * **2枚同時に開いていた**（E2E が
     * `getByRole('dialog') resolved to 2 elements` で落ちた / #1033）。
     * ここにモーダルを戻すとこのテストが落ちる。
     */
    it('モーダル自体は描かない（ホームに1つだけ置くため）', () => {
      mockSelectedMovieId = 100;
      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      expect(
        screen.queryByTestId('movie-detail-modal'),
      ).not.toBeInTheDocument();
    });
  });

  describe('ウォッチリストボタン', () => {
    it('各MovieTileにウォッチリストボタンが表示される', () => {
      renderSection({
        recommendations: createMockRecommendations(2),
        hasFavorites: true,
      });

      expect(screen.getByTestId('watchlist-btn-100')).toBeInTheDocument();
      expect(screen.getByTestId('watchlist-btn-101')).toBeInTheDocument();
    });
  });

  describe('お気に入りボタン', () => {
    it('各MovieTileにお気に入りボタンが表示される', () => {
      renderSection({
        recommendations: createMockRecommendations(2),
        hasFavorites: true,
      });

      expect(screen.getByTestId('favorite-btn-100')).toBeInTheDocument();
      expect(screen.getByTestId('favorite-btn-101')).toBeInTheDocument();
    });

    it('FavoriteRatingModalがレンダリングされる', () => {
      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      expect(screen.getByTestId('favorite-rating-modal')).toBeInTheDocument();
    });
  });

  describe('興味なしボタン', () => {
    it('各MovieTileに興味なしボタンが表示される', () => {
      renderSection({
        recommendations: createMockRecommendations(2),
        hasFavorites: true,
      });

      expect(screen.getByTestId('dismiss-btn-100')).toBeInTheDocument();
      expect(screen.getByTestId('dismiss-btn-101')).toBeInTheDocument();
    });

    it('お気に入り済みの映画は興味なしボタンが無効になる', () => {
      mockGetFavoriteInfo.mockImplementation((id: number) =>
        id === 100 ? { id: 'fav-1', rating: 8 } : null,
      );

      renderSection({
        recommendations: createMockRecommendations(2),
        hasFavorites: true,
      });

      expect(screen.getByTestId('dismiss-btn-100')).toBeDisabled();
      expect(screen.getByTestId('dismiss-btn-101')).not.toBeDisabled();
    });

    it('興味なしボタンクリックでdismissMovieが呼ばれる', () => {
      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

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

      renderSection({
        recommendations: createMockRecommendations(3),
        hasFavorites: true,
      });

      expect(screen.queryByTestId('movie-tile-100')).not.toBeInTheDocument();
      expect(screen.getByTestId('movie-tile-101')).toBeInTheDocument();
      expect(screen.getByTestId('movie-tile-102')).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('sectionにaria-labelが設定される', () => {
      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      expect(
        screen.getByRole('region', { name: 'あなたへのおすすめ' }),
      ).toBeInTheDocument();
    });
  });

  describe('更新ボタン', () => {
    it('更新ボタンが表示される', () => {
      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      expect(
        screen.getByRole('button', { name: 'おすすめを更新' }),
      ).toBeInTheDocument();
    });

    it('残り回数が表示される', () => {
      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      expect(screen.getByText('残り7回 / 月10回')).toBeInTheDocument();
    });

    it('更新ボタンクリックでrefreshが呼ばれる', () => {
      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      fireEvent.click(screen.getByRole('button', { name: 'おすすめを更新' }));

      expect(mockRefresh).toHaveBeenCalled();
    });

    it('上限到達時にボタンが無効化される', () => {
      mockRefreshState = {
        ...mockRefreshState,
        remainingCount: 0,
        isLimitReached: true,
        isRefreshDisabled: true,
      };

      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

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

      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      expect(screen.getByText('来月リセットされます')).toBeInTheDocument();
    });

    it('更新中はボタンが無効化される', () => {
      mockRefreshState = {
        ...mockRefreshState,
        isRefreshing: true,
        isRefreshDisabled: true,
      };

      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      expect(
        screen.getByRole('button', { name: 'おすすめを更新' }),
      ).toBeDisabled();
    });

    it('クールダウン中はボタンが無効化される', () => {
      mockRefreshState = {
        ...mockRefreshState,
        isCoolingDown: true,
        isRefreshDisabled: true,
      };

      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      expect(
        screen.getByRole('button', { name: 'おすすめを更新' }),
      ).toBeDisabled();
    });

    it('更新中はグリッドエリアにローディングオーバーレイが表示される', () => {
      mockRefreshState = {
        ...mockRefreshState,
        isRefreshing: true,
      };

      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      expect(screen.getByText('おすすめを更新中...')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('更新中でないときはローディングオーバーレイが非表示', () => {
      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      expect(screen.queryByText('おすすめを更新中...')).not.toBeInTheDocument();
    });

    it('カウントローディング中は残り回数が非表示', () => {
      mockRefreshState = {
        ...mockRefreshState,
        isCountLoading: true,
      };

      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      expect(screen.queryByText(/残り/)).not.toBeInTheDocument();
    });

    it('お気に入り0件の場合は更新ボタンが表示されない', () => {
      renderSection({ recommendations: [], hasFavorites: false });

      expect(
        screen.queryByRole('button', { name: 'おすすめを更新' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('利用イベントの計測', () => {
    it('各タイルを表示計測の対象として登録する', () => {
      renderSection({
        recommendations: createMockRecommendations(3),
        hasFavorites: true,
      });

      expect(mockObserveTile).toHaveBeenCalledWith(100);
      expect(mockObserveTile).toHaveBeenCalledWith(101);
      expect(mockObserveTile).toHaveBeenCalledWith(102);
    });

    it('タイルのクリックでclickを記録する', () => {
      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      fireEvent.click(screen.getByRole('link', { name: 'おすすめ映画 1' }));

      expect(mockTrackEvent).toHaveBeenCalledWith(100, 'click');
    });

    it('ウォッチリスト追加でadd_to_watchlistを記録する', () => {
      mockIsInWatchlist.mockReturnValue(false);

      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      fireEvent.click(screen.getByTestId('watchlist-btn-100'));

      expect(mockTrackEvent).toHaveBeenCalledWith(100, 'add_to_watchlist');
      expect(mockToggleWatchlist).toHaveBeenCalled();
    });

    it('ウォッチリスト解除では記録しない（興味のシグナルではないため）', () => {
      mockIsInWatchlist.mockReturnValue(true);

      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      fireEvent.click(screen.getByTestId('watchlist-btn-100'));

      expect(mockTrackEvent).not.toHaveBeenCalledWith(100, 'add_to_watchlist');
      expect(mockToggleWatchlist).toHaveBeenCalled();
      mockIsInWatchlist.mockReturnValue(false);
    });

    it('興味なしでdismissを記録する', () => {
      renderSection({
        recommendations: createMockRecommendations(1),
        hasFavorites: true,
      });

      fireEvent.click(screen.getByTestId('dismiss-btn-100'));

      expect(mockTrackEvent).toHaveBeenCalledWith(100, 'dismiss');
      expect(mockDismissMovie).toHaveBeenCalled();
    });

    it('お気に入り0件のときは計測を有効にしない', () => {
      renderSection({ recommendations: [], hasFavorites: false });

      expect(mockUseRecommendationEvents).toHaveBeenCalledWith([], false);
    });
  });

  /**
   * サーバー取得からクライアント取得へ移した（#1115）。
   * ホーム全体が動的ルートになるのを避けるため、cookie を読む処理を
   * このセクションの中に閉じ込めている
   */
  describe('表示の前提', () => {
    it('未認証なら何も描かない', () => {
      const { container } = renderSection({
        isAuthenticated: false,
        hasFavorites: true,
        recommendations: createMockRecommendations(2),
      });

      expect(container).toBeEmptyDOMElement();
    });

    /**
     * ⚠️ **中身のフックを動かさないこと。** early return はフックより後ろに
     * しか置けないので、1コンポーネントにまとめると未認証でも
     * `useRecommendationRefresh` が走り、`/api/recommendations/refresh-count`
     * が 401 を返して axios のインターセプタが強制サインアウトへ倒す
     * （`e2e/mobile/mobileLoginEntry.spec.ts` が落ちた / #1115）
     */
    it('未認証なら中身のフックを動かさない', () => {
      renderSection({
        isAuthenticated: false,
        hasFavorites: true,
        recommendations: createMockRecommendations(2),
      });

      expect(mockUseRecommendationRefresh).not.toHaveBeenCalled();
      expect(mockUseRecommendationEvents).not.toHaveBeenCalled();
    });

    /**
     * 取得に失敗したとき、`hasFavorites` は false に落ちる。
     * そのまま下の分岐へ行くと、お気に入りを登録済みの利用者にまで
     * 「お気に入りを登録すると…」が出る（#1115）
     */
    it('取得に失敗したら登録促進ではなく失敗を知らせる', () => {
      renderSection({ isError: true, hasFavorites: false });

      expect(screen.getByText('おすすめの取得に失敗しました')).toBeVisible();
      expect(
        screen.queryByText(
          'お気に入りを登録すると、AIがおすすめ映画を提案します',
        ),
      ).not.toBeInTheDocument();
    });

    it('取得に失敗したら中身のフックを動かさない', () => {
      renderSection({ isError: true });

      expect(mockUseRecommendationRefresh).not.toHaveBeenCalled();
    });

    it('セッション未確定の間も中身のフックを動かさない', () => {
      renderSection({
        isPending: true,
        hasFavorites: true,
        recommendations: createMockRecommendations(2),
      });

      expect(mockUseRecommendationRefresh).not.toHaveBeenCalled();
    });

    // 未認証の利用者には出ないセクションなので、未確定の間に出して消すと跳ねる
    it('セッション・取得が未確定の間は何も描かない', () => {
      const { container } = renderSection({
        isPending: true,
        hasFavorites: true,
        recommendations: createMockRecommendations(2),
      });

      expect(container).toBeEmptyDOMElement();
    });

    /**
     * 更新結果をローカル state ではなくキャッシュへ書く。
     * 詳細モーダルが同じキーを読むので、更新後の作品でもアクセシブル名が
     * 「映画詳細」に落ちない
     */
    it('更新が成功したらキャッシュへ書き戻す', () => {
      renderSection({
        hasFavorites: true,
        recommendations: createMockRecommendations(2),
      });

      const refreshed = createMockRecommendations(3);
      capturedRefreshSuccess?.(refreshed);

      expect(mockSetRecommendations).toHaveBeenCalledWith(refreshed);
    });
  });
});
