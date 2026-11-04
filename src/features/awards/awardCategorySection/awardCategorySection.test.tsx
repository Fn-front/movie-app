import { render, screen } from '@testing-library/react';

import { AwardCategorySection } from './awardCategorySection';
import type { AwardCategoryData, AwardMovie } from '@/features/awards/types';

// --- Mocks ---

jest.mock('@/components/ui/movie/movieTile/movieTile', () => ({
  MovieTile: ({
    movie,
    onClick,
  }: {
    movie: { id: number; title: string };
    onClick?: (movieId: number) => void;
  }) => (
    <div
      data-testid={`movie-tile-${movie.id}`}
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
  winner: createAwardMovie({
    tmdbMovieId: 100,
    title: '受賞映画',
    isWinner: true,
  }),
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
};

// --- Tests ---

describe('AwardCategorySection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    const nomineeList = screen.getByRole('list');
    const nomineeItems = screen.getAllByRole('listitem');
    expect(nomineeList).toBeInTheDocument();
    // 受賞者(id=100)はノミネートリストから除外される
    expect(nomineeItems).toHaveLength(2);
    expect(screen.getByText('ノミネート映画A')).toBeInTheDocument();
    expect(screen.getByText('ノミネート映画B')).toBeInTheDocument();
  });

  it('受賞者なしの場合は受賞セクションが表示されない', () => {
    const category = createMockCategory({
      winner: null,
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
      winner: createAwardMovie({
        tmdbMovieId: 1151272,
        title: 'シラート',
        personName: 'オリヴァー・ラクセ',
        isWinner: true,
      }),
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
  });

  it('同じ作品が同じ部門で複数ノミネートされても全員分が人名付きで表示される', () => {
    // 第82回ゴールデングローブ賞 助演女優賞の『エミリア・ペレス』は2人
    const category = createMockCategory({
      category: 'best_supporting_actress',
      label: '助演女優賞',
      winner: createAwardMovie({
        tmdbMovieId: 974950,
        title: 'エミリア・ペレス',
        personName: 'ゾーイ・サルダナ',
        isWinner: true,
      }),
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
      winner: createAwardMovie({
        tmdbMovieId: 100,
        title: '受賞映画',
        personName: '山田太郎',
      }),
      nominees: [
        createAwardMovie({
          tmdbMovieId: 100,
          title: '受賞映画',
          personName: '山田太郎',
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
});
