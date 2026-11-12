import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AwardsPage } from './awardsPage';
import { ARIA_LABELS } from '@/constants';

// --- Mocks ---

/** URL の ?t= を差し替えるための可変値（各テストで入れ替える） */
let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@/components/ui/loading/loading', () => ({
  Loading: ({ label }: { label?: string }) => (
    <div data-testid='loading'>{label}</div>
  ),
}));

jest.mock('@/components/ui/movie/movieTile/movieTile', () => ({
  MovieTile: ({
    movie,
  }: {
    movie: {
      id: number;
      title: string;
      favorite?: { id: string; rating: number } | null;
    };
  }) => (
    <div
      data-testid={`movie-tile-${movie.id}`}
      // 実際の FavoriteButton は movie.favorite を見て表示を切り替える。
      // 結合できているかをここで観測する
      data-favorite-rating={movie.favorite ? String(movie.favorite.rating) : ''}
    >
      {/* 詳細への遷移はタイル側のリンクが担う（#1033） */}
      <a href={`/movies/detail/${movie.id}`}>{movie.title}</a>
    </div>
  ),
}));

jest.mock(
  '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal',
  () => ({
    FavoriteRatingModal: () => <div data-testid='favorite-rating-modal' />,
  }),
);

/** 映画IDごとのお気に入り情報。各テストで入れ替える */
let mockFavorites = new Map<number, { id: string; rating: number }>();
const mockGetFavoriteInfo = (tmdbMovieId: number) =>
  mockFavorites.get(tmdbMovieId) ?? null;

jest.mock('@/features/favorites/hooks/useFavoriteToggle', () => ({
  useFavoriteToggle: () => ({
    modalState: { isOpen: false, movie: null, currentFavorite: null },
    handleFavoriteToggle: jest.fn(),
    closeModal: jest.fn(),
    handleModalSubmit: jest.fn(),
    handleDelete: jest.fn(),
    isFavoriteProcessing: jest.fn().mockReturnValue(false),
    getFavoriteInfo: mockGetFavoriteInfo,
  }),
}));

jest.mock('@/features/watchlist/hooks/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({
    isInWatchlist: jest.fn().mockReturnValue(false),
    toggleWatchlist: jest.fn(),
    isToggling: false,
    isMovieToggling: jest.fn().mockReturnValue(false),
  }),
}));

const mockUseAwardsReturn = {
  data: undefined as
    | {
        year: number;
        availableYears: number[];
        awards: {
          awardName: string;
          label: string;
          categories: {
            category: string;
            label: string;
            nominees: {
              tmdbMovieId: number;
              title: string;
              posterPath: string | null;
              releaseDate: string | null;
              voteAverage: number | null;
              genreIds: number[] | null;
              isWinner: boolean;
            }[];
          }[];
        }[];
      }
    | undefined,
  isLoading: false,
  isError: false,
  selectedYear: 2026,
  handleYearChange: jest.fn(),
  awardOptions: [] as { label: string; value: string }[],
  selectedAward: null as
    | ReturnType<typeof createMockAwardsData>['awards'][0]
    | null,
  handleAwardChange: jest.fn(),
};

/** useAwards に渡された cacheBuster を検証するために控える */
const useAwardsCalls: (string | undefined)[] = [];
jest.mock('@/features/awards/hooks/useAwards', () => ({
  useAwards: (cacheBuster?: string) => {
    useAwardsCalls.push(cacheBuster);
    return mockUseAwardsReturn;
  },
}));

jest.mock('@/components/ui/select/select', () => ({
  Select: ({
    value,
    onValueChange,
    options,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    options: { label: string; value: string }[];
  }) => (
    <select
      data-testid='year-select'
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {options.map((opt: { label: string; value: string }) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

// --- Helpers ---

const createMockAwardsData = () => ({
  year: 2026,
  availableYears: [2026, 2025],
  awards: [
    {
      awardName: 'academy_awards',
      label: 'アカデミー賞',
      categories: [
        {
          category: 'best_picture',
          label: '作品賞',
          nominees: [
            {
              tmdbMovieId: 100,
              title: '受賞映画',
              posterPath: '/winner.jpg',
              releaseDate: '2025-12-01',
              voteAverage: 8.5,
              genreIds: [18],
              isWinner: true,
            },
            {
              tmdbMovieId: 200,
              title: 'ノミネート映画',
              posterPath: '/nominee.jpg',
              releaseDate: '2025-11-01',
              voteAverage: 7.5,
              genreIds: [18],
              isWinner: false,
            },
          ],
        },
      ],
    },
  ],
});

/**
 * data と selectedAward をまとめて設定する。
 * 画面は data.awards ではなく selectedAward を描画するため、両方要る
 */
function setAwardsData(awards = createMockAwardsData()) {
  mockUseAwardsReturn.data = awards;
  mockUseAwardsReturn.selectedAward = awards.awards[0] ?? null;
  return awards;
}

// --- Tests ---

describe('AwardsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAwardsReturn.data = undefined;
    mockUseAwardsReturn.isLoading = false;
    mockUseAwardsReturn.isError = false;
    mockUseAwardsReturn.selectedYear = 2026;
    mockUseAwardsReturn.awardOptions = [];
    mockUseAwardsReturn.selectedAward = null;
    mockSearchParams = new URLSearchParams();
    useAwardsCalls.length = 0;
    mockFavorites = new Map();
  });

  // 表示切替は共通設定（#1014）。この画面にも導線が要る
  it('年度の選択肢があれば表示切替のトグルを出す', () => {
    setAwardsData();

    render(<AwardsPage />);

    expect(
      screen.getByRole('button', { name: ARIA_LABELS.LIST_VIEW }),
    ).toBeInTheDocument();
  });

  /**
   * 受賞作品APIは公開API＋共有キャッシュのためお気に入りを返せない。
   * クライアント側で結合しないと、登録済みでもカードが未登録表示のままになり、
   * そこから押すと重複エラー（409）になる（#830）
   */
  describe('お気に入りの結合', () => {
    it('登録済みの作品は受賞・ノミネートの両方のカードに評価が渡る', () => {
      setAwardsData();
      mockFavorites.set(100, { id: 'fav-100', rating: 9 });
      mockFavorites.set(200, { id: 'fav-200', rating: 4 });

      render(<AwardsPage />);

      expect(screen.getByTestId('movie-tile-100')).toHaveAttribute(
        'data-favorite-rating',
        '9',
      );
      expect(screen.getByTestId('movie-tile-200')).toHaveAttribute(
        'data-favorite-rating',
        '4',
      );
    });

    it('お気に入り0件なら全カードが未登録のまま', () => {
      setAwardsData();

      render(<AwardsPage />);

      expect(screen.getByTestId('movie-tile-100')).toHaveAttribute(
        'data-favorite-rating',
        '',
      );
      expect(screen.getByTestId('movie-tile-200')).toHaveAttribute(
        'data-favorite-rating',
        '',
      );
    });

    // 年度切り替えでデータが差し替わったときの追従は
    // awardCategorySection.test.tsx（useMemo の依存）で担保している
    it('年度を切り替えた後のデータでも結合される', () => {
      const nextYear = createMockAwardsData();
      nextYear.year = 2025;
      nextYear.awards[0].categories[0].nominees[1].tmdbMovieId = 300;
      setAwardsData(nextYear);
      mockFavorites.set(300, { id: 'fav-300', rating: 7 });

      render(<AwardsPage />);

      expect(screen.getByTestId('movie-tile-300')).toHaveAttribute(
        'data-favorite-rating',
        '7',
      );
      expect(screen.getByTestId('movie-tile-100')).toHaveAttribute(
        'data-favorite-rating',
        '',
      );
    });
  });

  /**
   * /api/awards は public キャッシュを返すため、同じURLだとブラウザが
   * キャッシュから返す（実測で transferSize=0 を確認）。管理画面の手動同期から
   * 遷移したときだけ ?t= を中継して取り直させる。
   */
  describe('キャッシュバスターの中継', () => {
    it('?t= があれば useAwards へ渡す', () => {
      mockSearchParams = new URLSearchParams({
        t: '2026-11-01T00:05:00.000Z',
      });

      render(<AwardsPage />);

      expect(useAwardsCalls[0]).toBe('2026-11-01T00:05:00.000Z');
    });

    it('?t= が無ければ undefined を渡す（通常の閲覧ではキャッシュを活かす）', () => {
      render(<AwardsPage />);

      expect(useAwardsCalls[0]).toBeUndefined();
    });
  });

  /**
   * 賞を縦に連結すると約28画面ぶんになるため、タブで1つずつ出す。
   */
  describe('賞タブ', () => {
    it('賞が複数あればタブを出し、選択中の賞だけを描画する', () => {
      const data = createMockAwardsData();
      data.awards.push({
        awardName: 'cannes',
        label: 'カンヌ映画祭',
        categories: [],
      });
      setAwardsData(data);
      mockUseAwardsReturn.awardOptions = [
        { label: 'アカデミー賞', value: 'academy_awards' },
        { label: 'カンヌ映画祭', value: 'cannes' },
      ];

      render(<AwardsPage />);

      expect(
        screen.getByRole('tab', { name: 'アカデミー賞' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: 'カンヌ映画祭' }),
      ).toBeInTheDocument();
      // 選択中（アカデミー賞）の部門だけが出る
      expect(screen.getAllByText('作品賞').length).toBeGreaterThanOrEqual(1);
    });

    // Radix Tabs は fireEvent.click では反応しないため user-event を使う
    it('タブを選ぶと handleAwardChange が呼ばれる', async () => {
      const user = userEvent.setup();
      const data = createMockAwardsData();
      data.awards.push({
        awardName: 'cannes',
        label: 'カンヌ映画祭',
        categories: [],
      });
      setAwardsData(data);
      mockUseAwardsReturn.awardOptions = [
        { label: 'アカデミー賞', value: 'academy_awards' },
        { label: 'カンヌ映画祭', value: 'cannes' },
      ];

      render(<AwardsPage />);
      await user.click(screen.getByRole('tab', { name: 'カンヌ映画祭' }));

      expect(mockUseAwardsReturn.handleAwardChange).toHaveBeenCalledWith(
        'cannes',
      );
    });

    // 選択肢が1つだけのタブは意味がない
    it('賞が1つならタブを出さずに中身だけ描画する', () => {
      setAwardsData();
      mockUseAwardsReturn.awardOptions = [];

      render(<AwardsPage />);

      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
      expect(screen.getByText('アカデミー賞')).toBeInTheDocument();
      expect(screen.getByText('受賞映画')).toBeInTheDocument();
    });
  });

  it('ローディング中にLoadingが表示される', () => {
    mockUseAwardsReturn.isLoading = true;

    render(<AwardsPage />);

    expect(screen.getByText('受賞作品')).toBeInTheDocument();
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('エラー時にエラーメッセージが表示される', () => {
    mockUseAwardsReturn.isError = true;

    render(<AwardsPage />);

    expect(
      screen.getByText('受賞作品データの取得に失敗しました。'),
    ).toBeInTheDocument();
  });

  it('データがない場合にデータなしメッセージが表示される', () => {
    mockUseAwardsReturn.data = {
      year: 2026,
      availableYears: [2026],
      awards: [],
    };

    render(<AwardsPage />);

    expect(
      screen.getByText('選択した年度の受賞作品データはまだありません。'),
    ).toBeInTheDocument();
  });

  it('受賞作品データが正しく表示される', () => {
    setAwardsData();

    render(<AwardsPage />);

    expect(screen.getByText('アカデミー賞')).toBeInTheDocument();
    expect(screen.getAllByText('作品賞').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('受賞映画')).toBeInTheDocument();
    expect(screen.getByText('ノミネート映画')).toBeInTheDocument();
  });

  it('年度セレクトが表示される', () => {
    setAwardsData();

    render(<AwardsPage />);

    const select = screen.getByTestId('year-select');
    expect(select).toBeInTheDocument();
  });

  it('年度変更でhandleYearChangeが呼ばれる', () => {
    setAwardsData();

    render(<AwardsPage />);

    const select = screen.getByTestId('year-select');
    fireEvent.change(select, { target: { value: '2025' } });

    expect(mockUseAwardsReturn.handleYearChange).toHaveBeenCalledWith('2025');
  });

  // 映画詳細は /movies/[id] というURLを持つルートになった（#1033）
  it('受賞作のタイルが映画詳細へのリンクを持つ', () => {
    setAwardsData();

    render(<AwardsPage />);

    expect(
      within(screen.getByTestId('movie-tile-200')).getByRole('link'),
    ).toHaveAttribute('href', '/movies/detail/200');
  });

  it('受賞ラベルが表示される', () => {
    setAwardsData();

    render(<AwardsPage />);

    expect(screen.getByText('受賞')).toBeInTheDocument();
  });

  it('ノミネートラベルが表示される', () => {
    setAwardsData();

    render(<AwardsPage />);

    expect(screen.getByText('ノミネート')).toBeInTheDocument();
  });
});
