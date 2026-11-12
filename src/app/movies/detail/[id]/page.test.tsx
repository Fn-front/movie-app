/**
 * @jest-environment node
 */

/**
 * 映画詳細ページ（Server Component）のテスト
 *
 * generateMetadata とページ本体が同じキャッシュ済み取得関数を共有し、
 * 表示できない映画を 404 に落とすことを検証する（#1033）。
 */

import { AxiosError } from 'axios';

import MovieDetail, { generateMetadata } from './page';

// --- Mocks ---

const mockGetCachedMovieDetail = jest.fn();
jest.mock('@/lib/api/movies/movies.server', () => ({
  getCachedMovieDetail: (...args: unknown[]) =>
    mockGetCachedMovieDetail(...args),
}));

class NotFoundError extends Error {}
const mockNotFound = jest.fn(() => {
  throw new NotFoundError('NEXT_NOT_FOUND');
});
jest.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

jest.mock(
  '@/features/movies/component/movieDetailPage/movieDetailPage',
  () => ({
    MovieDetailPage: () => null,
  }),
);

// --- Helpers ---

const createMovie = (overrides: Record<string, unknown> = {}) => ({
  id: 550,
  title: 'テスト映画',
  original_title: 'Test Movie',
  overview: 'テストのあらすじ',
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  release_date: '2020-01-01',
  vote_average: 8.4,
  vote_count: 100,
  popularity: 50,
  adult: false,
  original_language: 'en',
  runtime: 139,
  genres: [
    { id: 18, name: 'ドラマ' },
    { id: 53, name: 'スリラー' },
    { id: 28, name: 'アクション' },
  ],
  production_companies: [],
  production_countries: [],
  spoken_languages: [],
  budget: 0,
  revenue: 0,
  tagline: '',
  status: 'Released',
  homepage: null,
  ...overrides,
});

const params = (id: string) => Promise.resolve({ id });

const createNotFoundError = () =>
  new AxiosError('Not Found', '404', undefined, undefined, {
    status: 404,
    data: {},
    statusText: 'Not Found',
    headers: {},
    config: { headers: {} },
  } as never);

// --- Tests ---

describe('映画詳細ページ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateMetadata', () => {
    it('作品名をタイトルに入れる', async () => {
      mockGetCachedMovieDetail.mockResolvedValue(createMovie());

      const metadata = await generateMetadata({ params: params('550') });

      expect(metadata.title).toBe('テスト映画 | Movie App');
    });

    it('あらすじをdescriptionに入れる', async () => {
      mockGetCachedMovieDetail.mockResolvedValue(createMovie());

      const metadata = await generateMetadata({ params: params('550') });

      expect(metadata.description).toBe('テストのあらすじ');
    });

    it('長いあらすじは120文字で切る', async () => {
      mockGetCachedMovieDetail.mockResolvedValue(
        createMovie({ overview: 'あ'.repeat(300) }),
      );

      const metadata = await generateMetadata({ params: params('550') });

      expect(metadata.description).toHaveLength(120);
    });

    // 邦題未登録の洋画などはあらすじが空で返る
    it('あらすじが無ければ作品名・ジャンル・公開日で組み立てる', async () => {
      mockGetCachedMovieDetail.mockResolvedValue(createMovie({ overview: '' }));

      const metadata = await generateMetadata({ params: params('550') });

      expect(metadata.description).toBe(
        'テスト映画 / ドラマ、スリラー / 2020-01-01',
      );
    });

    it('OGにタイトル・説明・ポスターを入れる', async () => {
      mockGetCachedMovieDetail.mockResolvedValue(createMovie());

      const metadata = await generateMetadata({ params: params('550') });

      expect(metadata.openGraph).toEqual({
        title: 'テスト映画 | Movie App',
        description: 'テストのあらすじ',
        type: 'video.movie',
        images: ['https://image.tmdb.org/t/p/w500/poster.jpg'],
      });
    });

    it('ポスターが無ければOGに画像を入れない', async () => {
      mockGetCachedMovieDetail.mockResolvedValue(
        createMovie({ poster_path: null }),
      );

      const metadata = await generateMetadata({ params: params('550') });

      expect(metadata.openGraph).not.toHaveProperty('images');
    });

    it('不正なIDではTMDbを呼ばずに未検出タイトルを返す', async () => {
      const metadata = await generateMetadata({ params: params('abc') });

      expect(metadata.title).toBe('映画が見つかりません | Movie App');
      expect(mockGetCachedMovieDetail).not.toHaveBeenCalled();
    });

    it('TMDbが404なら未検出タイトルを返す', async () => {
      mockGetCachedMovieDetail.mockRejectedValue(createNotFoundError());

      const metadata = await generateMetadata({ params: params('999999') });

      expect(metadata.title).toBe('映画が見つかりません | Movie App');
    });
  });

  describe('ページ本体', () => {
    it('表示できる映画なら全画面表示を返す', async () => {
      mockGetCachedMovieDetail.mockResolvedValue(createMovie());

      const element = await MovieDetail({ params: params('550') });

      expect(element).not.toBeNull();
      expect(mockNotFound).not.toHaveBeenCalled();
    });

    it.each([
      ['非数値', 'abc'],
      ['指数表記', '1e3'],
      ['ゼロ', '0'],
      ['静的セグメント名', 'now-showing'],
    ])('%s のIDは404にする', async (_label, id) => {
      await expect(MovieDetail({ params: params(id) })).rejects.toThrow(
        NotFoundError,
      );
      expect(mockGetCachedMovieDetail).not.toHaveBeenCalled();
    });

    it('TMDbが404なら404にする', async () => {
      mockGetCachedMovieDetail.mockRejectedValue(createNotFoundError());

      await expect(MovieDetail({ params: params('999999') })).rejects.toThrow(
        NotFoundError,
      );
    });

    it('TMDbが一時障害でも404にする（ページとしては出せないため）', async () => {
      mockGetCachedMovieDetail.mockRejectedValue(new Error('boom'));

      await expect(MovieDetail({ params: params('550') })).rejects.toThrow(
        NotFoundError,
      );
    });

    it('アダルト作品は404にする', async () => {
      mockGetCachedMovieDetail.mockResolvedValue(createMovie({ adult: true }));

      await expect(MovieDetail({ params: params('550') })).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  it('generateMetadata とページ本体で同じ取得関数を共有する（TMDbを二重に叩かない）', async () => {
    mockGetCachedMovieDetail.mockResolvedValue(createMovie());

    await generateMetadata({ params: params('550') });
    await MovieDetail({ params: params('550') });

    // 呼び出し先は常にキャッシュ済み関数。同じ引数なので TMDb へは1回しか出ない
    expect(mockGetCachedMovieDetail).toHaveBeenCalledTimes(2);
    expect(mockGetCachedMovieDetail).toHaveBeenNthCalledWith(1, 550);
    expect(mockGetCachedMovieDetail).toHaveBeenNthCalledWith(2, 550);
  });
});
