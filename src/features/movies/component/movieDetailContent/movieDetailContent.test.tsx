/**
 * MovieDetailContentコンポーネント テスト
 */

import { fireEvent, render, screen } from '@testing-library/react';

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

const mockHandleFavoriteToggle = jest.fn();

jest.mock('@/features/favorites/hooks/useFavoriteToggle', () => ({
  useFavoriteToggle: () => ({
    modalState: { isOpen: false, movie: null, currentFavorite: null },
    handleFavoriteToggle: mockHandleFavoriteToggle,
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

jest.mock('@/features/movies/component/videoDialog/videoDialog', () => ({
  VideoDialog: ({ open, movieTitle }: { open: boolean; movieTitle: string }) =>
    open ? <div data-testid='video-dialog'>{movieTitle}の予告動画</div> : null,
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} />;
  },
}));

// --- Helpers ---

const defaultMovie = {
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
};

function setupMovie(overrides: Record<string, unknown> = {}) {
  mockUseMovieDetail.mockReturnValue({
    movie: { ...defaultMovie, ...overrides },
    isLoading: false,
    isError: false,
  });
}

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
    setupMovie({
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
    setupMovie({ title: '同じタイトル', original_title: '同じタイトル' });

    render(<MovieDetailContent movieId={123} />);

    const titles = screen.getAllByText('同じタイトル');
    expect(titles).toHaveLength(1);
  });

  it('概要がない場合はあらすじセクションを非表示にする', () => {
    setupMovie();

    render(<MovieDetailContent movieId={123} />);

    expect(screen.queryByText('あらすじ')).not.toBeInTheDocument();
  });

  it('showFinancialInfo=trueの場合に予算・興行収入を表示する', () => {
    setupMovie({ budget: 150000000, revenue: 500000000 });

    render(<MovieDetailContent movieId={123} showFinancialInfo />);

    expect(screen.getByText('制作予算')).toBeInTheDocument();
    expect(screen.getByText('$150,000,000（約225億円）')).toBeInTheDocument();
    expect(screen.getByText('興行収入')).toBeInTheDocument();
    expect(screen.getByText('$500,000,000（約750億円）')).toBeInTheDocument();
  });

  it('showFinancialInfo=falseの場合は予算・興行収入を非表示にする', () => {
    setupMovie({ budget: 150000000, revenue: 500000000 });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.queryByText('制作予算')).not.toBeInTheDocument();
    expect(screen.queryByText('興行収入')).not.toBeInTheDocument();
  });

  it('配信プロバイダー情報を表示する', () => {
    setupMovie({
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
    setupMovie();

    render(<MovieDetailContent movieId={123} />);

    expect(screen.queryByText('配信')).not.toBeInTheDocument();
    expect(screen.queryByText('レンタル')).not.toBeInTheDocument();
    expect(screen.queryByText('購入')).not.toBeInTheDocument();
  });

  describe('ウォッチリスト統合', () => {
    const movieWithPoster = {
      title: 'テスト映画',
      original_title: 'Test Movie',
      overview: 'テスト概要',
      release_date: '2025-03-15',
      runtime: 120,
      vote_average: 8.0,
      popularity: 100,
      poster_path: '/poster.jpg',
    };

    it('ウォッチリスト追加ボタンが表示される', () => {
      setupMovie(movieWithPoster);
      mockUseWatchlistToggle.isInWatchlist.mockReturnValue(false);

      render(<MovieDetailContent movieId={123} />);

      expect(
        screen.getByRole('button', { name: 'ウォッチリストに追加' }),
      ).toBeInTheDocument();
    });

    it('追加済みの場合は削除ボタンが表示される', () => {
      setupMovie(movieWithPoster);
      mockUseWatchlistToggle.isInWatchlist.mockReturnValue(true);

      render(<MovieDetailContent movieId={123} />);

      expect(
        screen.getByRole('button', { name: 'ウォッチリストから削除' }),
      ).toBeInTheDocument();
    });
  });

  it('予算・興行収入が0の場合は「-」を表示する', () => {
    setupMovie();

    render(<MovieDetailContent movieId={123} showFinancialInfo />);

    expect(screen.getByText('制作予算')).toBeInTheDocument();
    const dashes = screen.getAllByText('-');
    expect(dashes).toHaveLength(2);
  });

  it('上映時間が60分未満の場合「○分」と表示する', () => {
    setupMovie({ title: 'ショート', original_title: 'Short', runtime: 30 });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.getByText('30分')).toBeInTheDocument();
  });

  it('runtimeがnullの場合は上映時間を非表示にする', () => {
    setupMovie({ runtime: null });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.queryByText(/分$/)).not.toBeInTheDocument();
  });

  it('release_dateがnullの場合は日付を非表示にする', () => {
    setupMovie({ release_date: null });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.queryByText(/年/)).not.toBeInTheDocument();
  });

  it('vote_averageが0の場合は評価を非表示にする', () => {
    setupMovie({ vote_average: 0 });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.queryByText('0.0')).not.toBeInTheDocument();
  });

  it('creditsがない場合はキャストセクションを非表示にする', () => {
    setupMovie({ credits: null });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.queryByText('キャスト')).not.toBeInTheDocument();
  });

  it('キャストのprofile_pathがnullの場合はプレースホルダーを表示する', () => {
    setupMovie({
      credits: {
        cast: [
          {
            id: 1,
            name: '山田太郎',
            character: null,
            profile_path: null,
            order: 0,
          },
        ],
      },
    });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.getByText('山田太郎')).toBeInTheDocument();
    expect(screen.getByText('山')).toBeInTheDocument();
  });

  it('1万円未満の金額を正しくフォーマットする', () => {
    setupMovie({ budget: 50 });

    render(<MovieDetailContent movieId={123} showFinancialInfo />);

    expect(screen.getByText('$50（約7,500円）')).toBeInTheDocument();
  });

  it('億単位で小数を含む場合に小数点1桁で表示する', () => {
    setupMovie({ budget: 7000000 });

    render(<MovieDetailContent movieId={123} showFinancialInfo />);

    expect(screen.getByText('$7,000,000（約10.5億円）')).toBeInTheDocument();
  });

  it('万単位の金額を正しくフォーマットする', () => {
    setupMovie({ budget: 1000 });

    render(<MovieDetailContent movieId={123} showFinancialInfo />);

    expect(screen.getByText('$1,000（約15万円）')).toBeInTheDocument();
  });

  it('プロバイダーのlogo_pathがnullの場合は画像が表示されない', () => {
    setupMovie({
      'watch/providers': {
        results: {
          JP: {
            link: 'https://example.com',
            flatrate: [
              {
                provider_id: 99,
                provider_name: 'NullLogo',
                logo_path: null,
                display_priority: 0,
              },
            ],
          },
        },
      },
    });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.getByText('配信')).toBeInTheDocument();
    expect(screen.queryByAltText('NullLogo')).not.toBeInTheDocument();
  });

  it('flatrateのみのプロバイダー表示', () => {
    setupMovie({
      'watch/providers': {
        results: {
          JP: {
            link: 'https://example.com',
            flatrate: [
              {
                provider_id: 8,
                provider_name: 'Netflix',
                logo_path: '/netflix.jpg',
                display_priority: 0,
              },
            ],
          },
        },
      },
    });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.getByText('配信')).toBeInTheDocument();
    expect(screen.queryByText('レンタル')).not.toBeInTheDocument();
    expect(screen.queryByText('購入')).not.toBeInTheDocument();
  });

  it('movie.favoriteがある場合もレンダリングされる', () => {
    setupMovie({
      title: 'お気に入り映画',
      original_title: 'Favorite Movie',
      favorite: { id: 'fav-1', rating: 8, comment: 'Great' },
    });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.getByText('お気に入り映画')).toBeInTheDocument();
  });

  it('watch/providersのJPがない場合はプロバイダー非表示', () => {
    setupMovie({
      'watch/providers': {
        results: {
          US: {
            link: 'https://example.com',
            flatrate: [
              {
                provider_id: 8,
                provider_name: 'Netflix',
                logo_path: '/netflix.jpg',
                display_priority: 0,
              },
            ],
          },
        },
      },
    });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.queryByText('配信')).not.toBeInTheDocument();
  });

  it('ウォッチリストボタンをクリックするとtoggleWatchlistが呼ばれる', () => {
    setupMovie({
      title: 'テスト映画',
      original_title: 'Test Movie',
      release_date: '2025-03-15',
      runtime: 120,
      vote_average: 8.0,
      popularity: 100,
      poster_path: '/poster.jpg',
    });
    mockUseWatchlistToggle.isInWatchlist.mockReturnValue(false);

    render(<MovieDetailContent movieId={123} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'ウォッチリストに追加' }),
    );

    expect(mockUseWatchlistToggle.toggleWatchlist).toHaveBeenCalledWith({
      id: 123,
      title: 'テスト映画',
      poster_path: '/poster.jpg',
      release_date: '2025-03-15',
    });
  });

  it('お気に入りボタンをクリックするとhandleFavoriteToggleが呼ばれる', () => {
    setupMovie({
      title: 'テスト映画',
      original_title: 'Test Movie',
      release_date: '2025-03-15',
      runtime: 120,
      vote_average: 8.0,
      popularity: 100,
      poster_path: '/poster.jpg',
    });

    render(<MovieDetailContent movieId={123} />);

    fireEvent.click(screen.getByRole('button', { name: 'お気に入りに追加' }));

    expect(mockHandleFavoriteToggle).toHaveBeenCalledWith(
      {
        id: 123,
        title: 'テスト映画',
        poster_path: '/poster.jpg',
        release_date: '2025-03-15',
      },
      null,
    );
  });

  it('レンタルのみのプロバイダーを表示する', () => {
    setupMovie({
      'watch/providers': {
        results: {
          JP: {
            link: 'https://example.com',
            rent: [
              {
                provider_id: 2,
                provider_name: 'Apple TV',
                logo_path: '/apple.jpg',
                display_priority: 1,
              },
            ],
          },
        },
      },
    });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.getByText('レンタル')).toBeInTheDocument();
    expect(screen.queryByText('配信')).not.toBeInTheDocument();
    expect(screen.queryByText('購入')).not.toBeInTheDocument();
  });

  it('購入のみのプロバイダーを表示する', () => {
    setupMovie({
      'watch/providers': {
        results: {
          JP: {
            link: 'https://example.com',
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
    });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.getByText('購入')).toBeInTheDocument();
    expect(screen.queryByText('配信')).not.toBeInTheDocument();
    expect(screen.queryByText('レンタル')).not.toBeInTheDocument();
  });

  describe('予告動画', () => {
    const youtubeVideos = {
      videos: {
        results: [
          {
            id: 'v1',
            iso_639_1: 'ja',
            iso_3166_1: 'JP',
            key: 'abc123',
            name: '予告編1',
            site: 'YouTube',
            size: 1080,
            type: 'Trailer',
            official: true,
            published_at: '2025-01-01T00:00:00.000Z',
          },
        ],
      },
    };

    it('YouTube動画がある場合、再生ボタンを表示する', () => {
      setupMovie({ ...youtubeVideos, backdrop_path: '/backdrop.jpg' });

      render(<MovieDetailContent movieId={123} />);

      expect(
        screen.getByRole('button', { name: '予告動画を再生' }),
      ).toBeInTheDocument();
    });

    it('YouTube動画がない場合、再生ボタンを表示しない', () => {
      setupMovie({ backdrop_path: '/backdrop.jpg' });

      render(<MovieDetailContent movieId={123} />);

      expect(
        screen.queryByRole('button', { name: '予告動画を再生' }),
      ).not.toBeInTheDocument();
    });

    it('YouTube以外の動画のみの場合、再生ボタンを表示しない', () => {
      setupMovie({
        backdrop_path: '/backdrop.jpg',
        videos: {
          results: [
            {
              id: 'v1',
              iso_639_1: 'ja',
              iso_3166_1: 'JP',
              key: 'abc123',
              name: '予告編1',
              site: 'Vimeo',
              size: 1080,
              type: 'Trailer',
              official: true,
              published_at: '2025-01-01T00:00:00.000Z',
            },
          ],
        },
      });

      render(<MovieDetailContent movieId={123} />);

      expect(
        screen.queryByRole('button', { name: '予告動画を再生' }),
      ).not.toBeInTheDocument();
    });

    it('再生ボタンをクリックすると動画ダイアログが表示される', () => {
      setupMovie({ ...youtubeVideos, backdrop_path: '/backdrop.jpg' });

      render(<MovieDetailContent movieId={123} />);

      expect(screen.queryByTestId('video-dialog')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '予告動画を再生' }));

      expect(screen.getByTestId('video-dialog')).toBeInTheDocument();
    });
  });
});
