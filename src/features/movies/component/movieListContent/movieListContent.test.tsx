import { render, screen, fireEvent } from '@testing-library/react';

import { MovieListContent } from './movieListContent';
import { ARIA_LABELS, FILTER_LABELS } from '@/constants';
import type { UseMovieListReturn } from '@/features/movies/hooks/useMovieList';
import type { MovieCacheItem } from '@/lib/api/movies/movies';

// --- Mocks ---

// 予算・興行収入の判定は詳細APIを引くため、ここでは差し替える
// （判定そのものは useShowFinancialInfo.test.ts が担保する）
let mockShowFinancialInfo = false;
jest.mock('@/features/movies/hooks/useShowFinancialInfo', () => ({
  useShowFinancialInfo: () => mockShowFinancialInfo,
}));

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

jest.mock('@/hooks/useIntersectionObserver', () => ({
  useIntersectionObserver: () => ({ current: null }),
}));

jest.mock('@/features/watchlist/hooks/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({
    isInWatchlist: jest.fn().mockReturnValue(false),
    toggleWatchlist: jest.fn(),
    isMovieToggling: jest.fn().mockReturnValue(false),
  }),
}));

jest.mock('@/features/favorites/hooks/useFavoriteToggle', () => ({
  useFavoriteToggle: () => ({
    modalState: { isOpen: false, movie: null, currentFavorite: null },
    handleFavoriteToggle: jest.fn(),
    closeModal: jest.fn(),
    handleModalSubmit: jest.fn(),
    handleDelete: jest.fn(),
    isFavoriteProcessing: jest.fn().mockReturnValue(false),
  }),
}));

jest.mock(
  '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal',
  () => ({
    FavoriteRatingModal: () => null,
  }),
);

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
  vote_count: 1200,
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
  timeFrame: 'upcoming',
  genres: { 28: 'アクション' },
  selectedGenreIds: [],
  dateRange: {},
  isRevivalFilter: undefined,
  selectedWatchProviderIds: [],
  selectedOfferTypes: [],
  selectedRegions: [],
  hasActiveFilters: false,
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
  beforeEach(() => {
    mockSelectedMovieId = null;
    mockShowFinancialInfo = false;
  });

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

    // 表示切替は共通設定（#1014）。この画面にも導線が要る
    it('表示切替のトグルが表示される', () => {
      render(
        <MovieListContent title='公開予定' movieList={createMockMovieList()} />,
      );
      expect(
        screen.getByRole('button', { name: ARIA_LABELS.LIST_VIEW }),
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

  describe('配信予定タブの日付表示', () => {
    /** 劇場公開日と配信開始日が異なる作品 */
    const movieWithDigitalDate = createMockMovie({
      release_type: 'streaming',
      release_date: '2026-03-01',
      digital_release_date: '2026-05-20',
    });

    it('配信予定タブではデジタル公開日を表示する', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            releaseType: 'streaming',
            timeFrame: 'upcoming',
            movies: [movieWithDigitalDate],
          })}
        />,
      );
      expect(screen.getByText('2026年05月20日')).toBeInTheDocument();
      expect(screen.queryByText('2026年03月01日')).not.toBeInTheDocument();
    });

    it('配信中タブではrelease_dateを表示する', () => {
      render(
        <MovieListContent
          title='公開中'
          movieList={createMockMovieList({
            releaseType: 'streaming',
            timeFrame: 'now_showing',
            movies: [movieWithDigitalDate],
          })}
        />,
      );
      expect(screen.getByText('2026年03月01日')).toBeInTheDocument();
      expect(screen.queryByText('2026年05月20日')).not.toBeInTheDocument();
    });

    it('劇場公開タブではrelease_dateを表示する', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            releaseType: 'theatrical',
            timeFrame: 'upcoming',
            movies: [movieWithDigitalDate],
          })}
        />,
      );
      expect(screen.getByText('2026年03月01日')).toBeInTheDocument();
      expect(screen.queryByText('2026年05月20日')).not.toBeInTheDocument();
    });
  });

  describe('フィルターバッジ', () => {
    /*
      ⚠️ **どの条件で絞り込み中になるかは、ここでは見ない**（#1063）。
      判定は useMovieList が buildFilterConditions から導出する
      （useMovieList.test.ts の「絞り込み中の判定」を参照）。
      表示側で条件を並べ直していたせいで、配信プロバイダー・提供形態・地域の
      3つが漏れていた。ここは「印と説明が出るか」だけを見る。
    */
    it('絞り込み中なら印が出て、ボタンに説明が付く', () => {
      const { container } = render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ hasActiveFilters: true })}
        />,
      );

      expect(
        container.querySelector('.c_movie_list__filter_count'),
      ).toBeInTheDocument();

      // 名前は状態で変えない（#1046）。状態は説明で伝える
      const button = screen.getByRole('button', { name: 'フィルター' });
      expect(button).toHaveAccessibleName('フィルター');
      expect(button).toHaveAccessibleDescription(FILTER_LABELS.FILTER_ACTIVE);
    });

    it('絞り込みが無ければ印も説明も出ない', () => {
      const { container } = render(
        <MovieListContent title='公開予定' movieList={createMockMovieList()} />,
      );

      expect(
        container.querySelector('.c_movie_list__filter_count'),
      ).not.toBeInTheDocument();

      const button = screen.getByRole('button', { name: 'フィルター' });
      expect(button).toHaveAccessibleName('フィルター');
      expect(button).toHaveAccessibleDescription('');
    });

    // 青いドットは装飾。意味は説明側が持つので、二重に読まれてはいけない
    it('印そのものは読み上げから外れている', () => {
      const { container } = render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ hasActiveFilters: true })}
        />,
      );

      expect(
        container.querySelector('.c_movie_list__filter_count'),
      ).toHaveAttribute('aria-hidden', 'true');
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

    // 映画詳細は /movies/[id] というURLを持つルートになった（#1033）。
    // 予算・興行収入の出し分けは詳細側（useShowFinancialInfo）へ移っている
    it('映画タイルのタイトルが映画詳細へのリンクになる', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            movies: [createMockMovie({ id: 42, title: 'リンク映画' })],
          })}
        />,
      );

      expect(screen.getByRole('link', { name: 'リンク映画' })).toHaveAttribute(
        'href',
        '/movies/42',
      );
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

  // 先頭タイルは LCP 要素になりうるため即時読み込みにする。
  // 全件を即時にすると遅延読み込みが効かなくなるので、境界も確認する
  describe('ポスターの読み込み優先度', () => {
    const movies = Array.from({ length: 14 }, (_, index) =>
      createMockMovie({ id: index + 1, title: `映画${index + 1}` }),
    );

    const renderList = () =>
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ movies })}
        />,
      );

    it('先頭タイルのポスターは即時読み込みになる', () => {
      renderList();

      expect(screen.getByAltText('映画1のポスター')).toHaveAttribute(
        'loading',
        'eager',
      );
    });

    it('上限（12件目）までは即時読み込みになる', () => {
      renderList();

      expect(screen.getByAltText('映画12のポスター')).toHaveAttribute(
        'loading',
        'eager',
      );
    });

    it('上限を超えたタイルは遅延読み込みのまま', () => {
      renderList();

      expect(screen.getByAltText('映画13のポスター')).toHaveAttribute(
        'loading',
        'lazy',
      );
    });
  });
});
