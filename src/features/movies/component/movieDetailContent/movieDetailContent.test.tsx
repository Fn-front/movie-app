/**
 * MovieDetailContentコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';

import { MovieDetailContent } from './movieDetailContent';

// --- Mocks ---

const mockUseMovieDetail = jest.fn();

jest.mock('@/features/movies/hooks/useMovieDetail', () => ({
  useMovieDetail: (...args: unknown[]) => mockUseMovieDetail(...args),
}));

const mockUseWatchlistToggle = {
  isInWatchlist: jest.fn().mockReturnValue(false),
  toggleWatchlist: jest.fn(),
  isToggling: false,
};

jest.mock('@/features/watchlist/hooks/useWatchlistToggle', () => ({
  useWatchlistToggle: () => mockUseWatchlistToggle,
}));

jest.mock('@/features/favorites/hooks/useFavoriteToggle', () => ({
  useFavoriteToggle: () => ({
    modalState: { isOpen: false, movie: null, currentFavorite: null },
    handleFavoriteToggle: jest.fn(),
    closeModal: jest.fn(),
    handleModalSubmit: jest.fn(),
    handleDelete: jest.fn(),
    isProcessing: false,
    isFavoriteProcessing: jest.fn().mockReturnValue(false),
  }),
}));

jest.mock(
  '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal',
  () => ({
    FavoriteRatingModal: () => null,
  }),
);

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} />;
  },
}));

// --- Tests ---

describe('MovieDetailContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ローディング中はスピナーを表示する', () => {
    mockUseMovieDetail.mockReturnValue({
      movie: undefined,
      isLoading: true,
      isError: false,
    });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  it('エラー時はエラーメッセージを表示する', () => {
    mockUseMovieDetail.mockReturnValue({
      movie: undefined,
      isLoading: false,
      isError: true,
    });

    render(<MovieDetailContent movieId={123} />);

    expect(
      screen.getByText('映画情報の取得に失敗しました。'),
    ).toBeInTheDocument();
  });

  it('映画詳細を表示する', () => {
    mockUseMovieDetail.mockReturnValue({
      movie: {
        id: 123,
        title: 'テスト映画',
        original_title: 'Test Movie',
        overview: 'テスト概要です。',
        release_date: '2025-03-15',
        runtime: 125,
        vote_average: 8.5,
        popularity: 150.5,
        genres: [
          { id: 28, name: 'アクション' },
          { id: 12, name: 'アドベンチャー' },
        ],
        production_companies: [
          {
            id: 1,
            name: 'テスト制作会社',
            logo_path: null,
            origin_country: 'JP',
          },
        ],
        production_countries: [{ iso_3166_1: 'JP', name: '日本' }],
        budget: 0,
        revenue: 0,
        credits: {
          cast: [
            {
              id: 1,
              name: 'テスト俳優',
              character: 'テスト役',
              profile_path: '/actor.jpg',
              order: 0,
            },
          ],
        },
        poster_path: '/poster.jpg',
        backdrop_path: '/backdrop.jpg',
      },
      isLoading: false,
      isError: false,
    });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.getByText('テスト映画')).toBeInTheDocument();
    expect(screen.getByText('Test Movie')).toBeInTheDocument();
    expect(screen.getByText('テスト概要です。')).toBeInTheDocument();
    expect(screen.getByText('2025年03月15日')).toBeInTheDocument();
    expect(screen.getByText('2時間5分')).toBeInTheDocument();
    expect(screen.getByText('8.5')).toBeInTheDocument();
    expect(screen.getByText('アクション')).toBeInTheDocument();
    expect(screen.getByText('アドベンチャー')).toBeInTheDocument();
    expect(screen.getByText('あらすじ')).toBeInTheDocument();
    expect(screen.getByText('詳細情報')).toBeInTheDocument();
    expect(screen.getByText('テスト制作会社')).toBeInTheDocument();
    expect(screen.getByText('日本')).toBeInTheDocument();
    expect(screen.getByText('150.5')).toBeInTheDocument();
    expect(screen.getByText('キャスト')).toBeInTheDocument();
    expect(screen.getByText('テスト俳優')).toBeInTheDocument();
    expect(screen.getByText('テスト役')).toBeInTheDocument();
  });

  it('原題がタイトルと同じ場合は原題を非表示にする', () => {
    mockUseMovieDetail.mockReturnValue({
      movie: {
        id: 123,
        title: '同じタイトル',
        original_title: '同じタイトル',
        overview: '',
        release_date: '2025-01-01',
        runtime: 90,
        vote_average: 0,
        popularity: 10,
        genres: [],
        production_companies: [],
        production_countries: [],
        budget: 0,
        revenue: 0,
        poster_path: null,
        backdrop_path: null,
      },
      isLoading: false,
      isError: false,
    });

    render(<MovieDetailContent movieId={123} />);

    const titles = screen.getAllByText('同じタイトル');
    expect(titles).toHaveLength(1);
  });

  it('概要がない場合はあらすじセクションを非表示にする', () => {
    mockUseMovieDetail.mockReturnValue({
      movie: {
        id: 123,
        title: 'テスト',
        original_title: 'Test',
        overview: '',
        release_date: '2025-01-01',
        runtime: 90,
        vote_average: 7.0,
        popularity: 10,
        genres: [],
        production_companies: [],
        production_countries: [],
        budget: 0,
        revenue: 0,
        poster_path: null,
        backdrop_path: null,
      },
      isLoading: false,
      isError: false,
    });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.queryByText('あらすじ')).not.toBeInTheDocument();
  });

  it('showFinancialInfo=trueの場合に予算・興行収入を表示する', () => {
    mockUseMovieDetail.mockReturnValue({
      movie: {
        id: 123,
        title: 'テスト',
        original_title: 'Test',
        overview: '',
        release_date: '2025-01-01',
        runtime: 90,
        vote_average: 7.0,
        popularity: 10,
        genres: [],
        production_companies: [],
        production_countries: [],
        budget: 150000000,
        revenue: 500000000,
        poster_path: null,
        backdrop_path: null,
      },
      isLoading: false,
      isError: false,
    });

    render(<MovieDetailContent movieId={123} showFinancialInfo />);

    expect(screen.getByText('制作予算')).toBeInTheDocument();
    expect(screen.getByText('$150,000,000（約225億円）')).toBeInTheDocument();
    expect(screen.getByText('興行収入')).toBeInTheDocument();
    expect(screen.getByText('$500,000,000（約750億円）')).toBeInTheDocument();
  });

  it('showFinancialInfo=falseの場合は予算・興行収入を非表示にする', () => {
    mockUseMovieDetail.mockReturnValue({
      movie: {
        id: 123,
        title: 'テスト',
        original_title: 'Test',
        overview: '',
        release_date: '2025-01-01',
        runtime: 90,
        vote_average: 7.0,
        popularity: 10,
        genres: [],
        production_companies: [],
        production_countries: [],
        budget: 150000000,
        revenue: 500000000,
        poster_path: null,
        backdrop_path: null,
      },
      isLoading: false,
      isError: false,
    });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.queryByText('制作予算')).not.toBeInTheDocument();
    expect(screen.queryByText('興行収入')).not.toBeInTheDocument();
  });

  it('配信プロバイダー情報を表示する', () => {
    mockUseMovieDetail.mockReturnValue({
      movie: {
        id: 123,
        title: 'テスト',
        original_title: 'Test',
        overview: '',
        release_date: '2025-01-01',
        runtime: 90,
        vote_average: 7.0,
        popularity: 10,
        genres: [],
        production_companies: [],
        production_countries: [],
        budget: 0,
        revenue: 0,
        poster_path: null,
        backdrop_path: null,
        'watch/providers': {
          results: {
            JP: {
              link: 'https://www.themoviedb.org/movie/123/watch?locale=JP',
              flatrate: [
                {
                  provider_id: 8,
                  provider_name: 'Netflix',
                  logo_path: '/netflix.jpg',
                  display_priority: 0,
                },
              ],
              rent: [
                {
                  provider_id: 2,
                  provider_name: 'Apple TV',
                  logo_path: '/apple.jpg',
                  display_priority: 1,
                },
              ],
              buy: [
                {
                  provider_id: 3,
                  provider_name: 'Google Play Movies',
                  logo_path: '/google.jpg',
                  display_priority: 2,
                },
              ],
            },
          },
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.getByText('配信')).toBeInTheDocument();
    expect(screen.getByText('レンタル')).toBeInTheDocument();
    expect(screen.getByText('購入')).toBeInTheDocument();
    expect(screen.getByAltText('Netflix')).toBeInTheDocument();
    expect(screen.getByAltText('Apple TV')).toBeInTheDocument();
    expect(screen.getByAltText('Google Play Movies')).toBeInTheDocument();
  });

  it('配信プロバイダー情報がない場合はセクションを非表示にする', () => {
    mockUseMovieDetail.mockReturnValue({
      movie: {
        id: 123,
        title: 'テスト',
        original_title: 'Test',
        overview: '',
        release_date: '2025-01-01',
        runtime: 90,
        vote_average: 7.0,
        popularity: 10,
        genres: [],
        production_companies: [],
        production_countries: [],
        budget: 0,
        revenue: 0,
        poster_path: null,
        backdrop_path: null,
      },
      isLoading: false,
      isError: false,
    });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.queryByText('配信')).not.toBeInTheDocument();
    expect(screen.queryByText('レンタル')).not.toBeInTheDocument();
    expect(screen.queryByText('購入')).not.toBeInTheDocument();
  });

  describe('ウォッチリスト統合', () => {
    const movieData = {
      id: 123,
      title: 'テスト映画',
      original_title: 'Test Movie',
      overview: 'テスト概要',
      release_date: '2025-03-15',
      runtime: 120,
      vote_average: 8.0,
      popularity: 100,
      genres: [],
      production_companies: [],
      production_countries: [],
      budget: 0,
      revenue: 0,
      poster_path: '/poster.jpg',
      backdrop_path: null,
    };

    it('ウォッチリスト追加ボタンが表示される', () => {
      mockUseMovieDetail.mockReturnValue({
        movie: movieData,
        isLoading: false,
        isError: false,
      });
      mockUseWatchlistToggle.isInWatchlist.mockReturnValue(false);

      render(<MovieDetailContent movieId={123} />);

      expect(
        screen.getByRole('button', { name: 'ウォッチリストに追加' }),
      ).toBeInTheDocument();
    });

    it('追加済みの場合は削除ボタンが表示される', () => {
      mockUseMovieDetail.mockReturnValue({
        movie: movieData,
        isLoading: false,
        isError: false,
      });
      mockUseWatchlistToggle.isInWatchlist.mockReturnValue(true);

      render(<MovieDetailContent movieId={123} />);

      expect(
        screen.getByRole('button', { name: 'ウォッチリストから削除' }),
      ).toBeInTheDocument();
    });
  });

  it('予算・興行収入が0の場合は「-」を表示する', () => {
    mockUseMovieDetail.mockReturnValue({
      movie: {
        id: 123,
        title: 'テスト',
        original_title: 'Test',
        overview: '',
        release_date: '2025-01-01',
        runtime: 90,
        vote_average: 7.0,
        popularity: 10,
        genres: [],
        production_companies: [],
        production_countries: [],
        budget: 0,
        revenue: 0,
        poster_path: null,
        backdrop_path: null,
      },
      isLoading: false,
      isError: false,
    });

    render(<MovieDetailContent movieId={123} showFinancialInfo />);

    expect(screen.getByText('制作予算')).toBeInTheDocument();
    const dashes = screen.getAllByText('-');
    expect(dashes).toHaveLength(2);
  });
});
