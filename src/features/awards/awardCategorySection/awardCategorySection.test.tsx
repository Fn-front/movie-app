import { render, screen, within } from '@testing-library/react';

import { AwardCategorySection } from './awardCategorySection';
import { STORAGE_KEYS } from '@/constants';
import type { AwardCategoryData, AwardMovie } from '@/features/awards/types';

// --- Mocks ---

jest.mock('@/components/ui/movie/movieTile/movieTile', () => ({
  MovieTile: ({
    movie,
    onClick,
    viewMode,
  }: {
    movie: {
      id: number;
      title: string;
      favorite?: { id: string; rating: number } | null;
    };
    onClick?: (movieId: number) => void;
    viewMode?: string;
  }) => (
    <div
      data-testid={`movie-tile-${movie.id}`}
      data-view-mode={viewMode}
      data-favorite-rating={movie.favorite ? String(movie.favorite.rating) : ''}
      role='button'
      tabIndex={0}
      onClick={() => onClick?.(movie.id)}
      onKeyDown={() => {}}
    >
      {movie.title}
    </div>
  ),
}));

// --- Helpers ---

const createAwardMovie = (overrides: Partial<AwardMovie> = {}): AwardMovie => ({
  tmdbMovieId: 100,
  title: 'テスト映画',
  posterPath: '/poster.jpg',
  releaseDate: '2025-12-01',
  voteAverage: 8.5,
  genreIds: [18],
  personName: null,
  isWinner: false,
  ...overrides,
});

const createMockCategory = (
  overrides: Partial<AwardCategoryData> = {},
): AwardCategoryData => ({
  category: 'best_picture',
  label: '作品賞',
  nominees: [
    createAwardMovie({ tmdbMovieId: 100, title: '受賞映画', isWinner: true }),
    createAwardMovie({ tmdbMovieId: 200, title: 'ノミネート映画A' }),
    createAwardMovie({ tmdbMovieId: 300, title: 'ノミネート映画B' }),
  ],
  ...overrides,
});

const defaultProps = {
  awardName: 'academy_awards',
  onMovieClick: jest.fn(),
  isInWatchlist: jest.fn().mockReturnValue(false),
  onWatchlistToggle: jest.fn(),
  isMovieToggling: jest.fn().mockReturnValue(false),
  onFavoriteToggle: jest.fn(),
  isFavoriteProcessing: jest.fn().mockReturnValue(false),
  getFavoriteInfo: jest.fn().mockReturnValue(null),
};

// --- Tests ---

describe('AwardCategorySection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 表示モードは localStorage に残るので、テスト間で引きずらせない
    localStorage.clear();
  });

  // 表示切替は共通設定（#1014）。受賞・ノミネートとも追随する必要がある
  describe('表示モード', () => {
    it('既定ではグリッドの並びで出す', () => {
      const { container } = render(
        <AwardCategorySection
          category={createMockCategory()}
          {...defaultProps}
        />,
      );

      expect(
        container.querySelector('.c_award_category__tiles--list'),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('movie-tile-100')).toHaveAttribute(
        'data-view-mode',
        'grid',
      );
    });

    it('リスト設定なら受賞もノミネートもリストの並びになる', () => {
      localStorage.setItem(STORAGE_KEYS.MOVIE_VIEW_MODE, 'list');

      const { container } = render(
        <AwardCategorySection
          category={createMockCategory()}
          {...defaultProps}
        />,
      );

      // 受賞側とノミネート側で2つ
      expect(
        container.querySelectorAll('.c_award_category__tiles--list'),
      ).toHaveLength(2);
      // コンテナだけ切り替えてタイルがグリッドのままだと縦長カードが1列に並ぶ
      expect(screen.getByTestId('movie-tile-100')).toHaveAttribute(
        'data-view-mode',
        'list',
      );
      expect(screen.getByTestId('movie-tile-200')).toHaveAttribute(
        'data-view-mode',
        'list',
      );
    });

    it('リストでは人名の場所を潰さないよう高さの指定を外す', () => {
      localStorage.setItem(STORAGE_KEYS.MOVIE_VIEW_MODE, 'list');

      const { container } = render(
        <AwardCategorySection
          category={createMockCategory()}
          {...defaultProps}
        />,
      );

      expect(
        container.querySelectorAll('.c_award_category__item--list').length,
      ).toBeGreaterThan(0);
    });
  });

  it('カテゴリラベルがh3で表示される', () => {
    const category = createMockCategory();

    render(<AwardCategorySection category={category} {...defaultProps} />);

    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toHaveTextContent('作品賞');
  });

  it('受賞ラベルが表示される', () => {
    const category = createMockCategory();

    render(<AwardCategorySection category={category} {...defaultProps} />);

    expect(screen.getByText('受賞')).toBeInTheDocument();
  });

  it('受賞映画のMovieTileが表示される', () => {
    const category = createMockCategory();

    render(<AwardCategorySection category={category} {...defaultProps} />);

    expect(screen.getByTestId('movie-tile-100')).toBeInTheDocument();
    expect(screen.getByText('受賞映画')).toBeInTheDocument();
  });

  it('ノミネートラベルが表示される', () => {
    const category = createMockCategory();

    render(<AwardCategorySection category={category} {...defaultProps} />);

    expect(screen.getByText('ノミネート')).toBeInTheDocument();
  });

  it('ノミネート映画から受賞映画が除外される', () => {
    const category = createMockCategory();

    render(<AwardCategorySection category={category} {...defaultProps} />);

    const nomineeList = screen.getByRole('list', { name: 'ノミネート' });
    // 受賞者(id=100)はノミネートリストから除外される
    expect(within(nomineeList).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('ノミネート映画A')).toBeInTheDocument();
    expect(screen.getByText('ノミネート映画B')).toBeInTheDocument();
  });

  it('受賞者なしの場合は受賞セクションが表示されない', () => {
    const category = createMockCategory({
      nominees: [
        createAwardMovie({ tmdbMovieId: 200, title: 'ノミネート映画A' }),
        createAwardMovie({ tmdbMovieId: 300, title: 'ノミネート映画B' }),
      ],
    });

    render(<AwardCategorySection category={category} {...defaultProps} />);

    expect(screen.queryByText('受賞')).not.toBeInTheDocument();
  });

  it('ノミネートが受賞者のみの場合はノミネートセクションが表示されない', () => {
    const category = createMockCategory({
      nominees: [
        createAwardMovie({
          tmdbMovieId: 100,
          title: '受賞映画',
          isWinner: true,
        }),
      ],
    });

    render(<AwardCategorySection category={category} {...defaultProps} />);

    expect(screen.queryByText('ノミネート')).not.toBeInTheDocument();
  });

  it('同点受賞は全件が受賞として表示され、受賞ラベルは1つだけ出る', () => {
    // 第78回カンヌ 審査員賞は『シラート』と『落下音』の同点受賞。
    // カンヌの記事はノミネートを載せないため、この部門にノミネートは存在しない
    const category = createMockCategory({
      category: 'jury_prize',
      label: '審査員賞',
      nominees: [
        createAwardMovie({
          tmdbMovieId: 1151272,
          title: 'シラート',
          personName: 'オリヴァー・ラクセ',
          isWinner: true,
        }),
        createAwardMovie({
          tmdbMovieId: 1221061,
          title: '落下音',
          personName: 'マーシャ・シリンスキー',
          isWinner: true,
        }),
      ],
    });

    render(<AwardCategorySection category={category} {...defaultProps} />);

    expect(screen.getByTestId('movie-tile-1151272')).toBeInTheDocument();
    expect(screen.getByTestId('movie-tile-1221061')).toBeInTheDocument();
    expect(screen.getAllByText('受賞')).toHaveLength(1);
    // 受賞作がノミネート側へ流れていない
    expect(screen.queryByText('ノミネート')).not.toBeInTheDocument();

    // 複数並ぶので一覧として読み上げられる必要がある
    const winnerList = screen.getByRole('list', { name: '受賞' });
    expect(within(winnerList).getAllByRole('listitem')).toHaveLength(2);
  });

  it('同じ作品の非受賞2件が同じノミネート一覧に並んでも key が衝突しない', () => {
    // 第98回アカデミー賞 助演女優賞の『センチメンタル・バリュー』は
    // エル・ファニングとインガ・イブスドッテル・リッレオースの2人。
    // どちらも非受賞なので、同じリストの兄弟として並ぶ
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const category = createMockCategory({
      category: 'best_supporting_actress',
      label: '助演女優賞',
      nominees: [
        createAwardMovie({
          tmdbMovieId: 1078605,
          title: 'WEAPONS／ウェポンズ',
          personName: 'エイミー・マディガン',
          isWinner: true,
        }),
        createAwardMovie({
          tmdbMovieId: 1124566,
          title: 'センチメンタル・バリュー',
          personName: 'エル・ファニング',
        }),
        createAwardMovie({
          tmdbMovieId: 1124566,
          title: 'センチメンタル・バリュー',
          personName: 'インガ・イブスドッテル・リッレオース',
        }),
      ],
    });

    render(<AwardCategorySection category={category} {...defaultProps} />);

    const nomineeList = screen.getByRole('list', { name: 'ノミネート' });
    expect(within(nomineeList).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('エル・ファニング')).toBeInTheDocument();
    expect(
      screen.getByText('インガ・イブスドッテル・リッレオース'),
    ).toBeInTheDocument();

    // 映画IDだけを key にすると React が重複を警告する
    const keyWarning = errorSpy.mock.calls.some((args) =>
      args.some((a) => typeof a === 'string' && a.includes('same key')),
    );
    expect(keyWarning).toBe(false);

    errorSpy.mockRestore();
  });

  it('同じ作品が同じ部門で複数ノミネートされても全員分が人名付きで表示される', () => {
    // 第82回ゴールデングローブ賞 助演女優賞の『エミリア・ペレス』は2人
    const category = createMockCategory({
      category: 'best_supporting_actress',
      label: '助演女優賞',
      nominees: [
        createAwardMovie({
          tmdbMovieId: 974950,
          title: 'エミリア・ペレス',
          personName: 'セレーナ・ゴメス',
        }),
        createAwardMovie({
          tmdbMovieId: 974950,
          title: 'エミリア・ペレス',
          personName: 'ゾーイ・サルダナ',
          isWinner: true,
        }),
      ],
    });

    render(<AwardCategorySection category={category} {...defaultProps} />);

    // 同じ映画IDが受賞側とノミネート側に1件ずつ出る
    expect(screen.getAllByTestId('movie-tile-974950')).toHaveLength(2);
    // 人名は行ごとに出し分ける（映画IDで引くと後勝ちで取り違える）
    expect(screen.getByText('ゾーイ・サルダナ')).toBeInTheDocument();
    expect(screen.getByText('セレーナ・ゴメス')).toBeInTheDocument();
  });

  it('ノミネートが空の場合はノミネートセクションが表示されない', () => {
    const category = createMockCategory({ nominees: [] });

    render(<AwardCategorySection category={category} {...defaultProps} />);

    expect(screen.queryByText('ノミネート')).not.toBeInTheDocument();
  });

  it('personNameがある場合はMovieTileの下に人名が表示される', () => {
    const category = createMockCategory({
      nominees: [
        createAwardMovie({
          tmdbMovieId: 100,
          title: '受賞映画',
          personName: '山田太郎',
          isWinner: true,
        }),
        createAwardMovie({
          tmdbMovieId: 200,
          title: 'ノミネート映画A',
          personName: '鈴木花子',
        }),
        createAwardMovie({
          tmdbMovieId: 300,
          title: 'ノミネート映画B',
          personName: null,
        }),
      ],
    });

    render(<AwardCategorySection category={category} {...defaultProps} />);

    expect(screen.getByText('山田太郎')).toBeInTheDocument();
    expect(screen.getByText('鈴木花子')).toBeInTheDocument();
  });

  it('personNameがnullの場合は人名が表示されない', () => {
    const category = createMockCategory();

    render(<AwardCategorySection category={category} {...defaultProps} />);

    // personName が null のデフォルトデータでは人名要素が存在しない
    const personNames = document.querySelectorAll('[class*="person_name"]');
    expect(personNames).toHaveLength(0);
  });

  /**
   * 受賞作品APIはお気に入りを返さないため、ここで結合しないと
   * 登録済みでも未登録表示のままになる（#830）
   */
  describe('お気に入りの結合', () => {
    it('getFavoriteInfo の結果が受賞・ノミネート両方のタイルへ渡る', () => {
      const category = createMockCategory();
      const getFavoriteInfo = jest.fn((tmdbMovieId: number) =>
        tmdbMovieId === 100 ? { id: 'fav-100', rating: 9 } : null,
      );

      render(
        <AwardCategorySection
          category={category}
          {...defaultProps}
          getFavoriteInfo={getFavoriteInfo}
        />,
      );

      expect(screen.getByTestId('movie-tile-100')).toHaveAttribute(
        'data-favorite-rating',
        '9',
      );
      expect(screen.getByTestId('movie-tile-200')).toHaveAttribute(
        'data-favorite-rating',
        '',
      );
    });

    // 依存配列に getFavoriteInfo が無いと、お気に入りを操作しても
    // useMemo が再計算されず表示が追従しない
    it('getFavoriteInfo が変わるとタイルの評価が追従する', () => {
      const category = createMockCategory();

      const { rerender } = render(
        <AwardCategorySection
          category={category}
          {...defaultProps}
          getFavoriteInfo={() => null}
        />,
      );

      expect(screen.getByTestId('movie-tile-100')).toHaveAttribute(
        'data-favorite-rating',
        '',
      );

      rerender(
        <AwardCategorySection
          category={category}
          {...defaultProps}
          getFavoriteInfo={() => ({ id: 'fav-100', rating: 6 })}
        />,
      );

      expect(screen.getByTestId('movie-tile-100')).toHaveAttribute(
        'data-favorite-rating',
        '6',
      );
    });

    // 年度を切り替えると category が丸ごと差し替わる
    it('カテゴリのデータが差し替わっても結合が維持される', () => {
      const getFavoriteInfo = jest.fn((tmdbMovieId: number) =>
        tmdbMovieId === 400 ? { id: 'fav-400', rating: 3 } : null,
      );

      const { rerender } = render(
        <AwardCategorySection
          category={createMockCategory()}
          {...defaultProps}
          getFavoriteInfo={getFavoriteInfo}
        />,
      );

      rerender(
        <AwardCategorySection
          category={createMockCategory({
            nominees: [
              createAwardMovie({
                tmdbMovieId: 400,
                title: '別年度の受賞映画',
                isWinner: true,
              }),
            ],
          })}
          {...defaultProps}
          getFavoriteInfo={getFavoriteInfo}
        />,
      );

      expect(screen.getByTestId('movie-tile-400')).toHaveAttribute(
        'data-favorite-rating',
        '3',
      );
    });
  });
});
