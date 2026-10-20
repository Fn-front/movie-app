/**
 * @jest-environment node
 */

/**
 * 人物ページ（Server Component）のテスト
 *
 * generateMetadata とページ本体が同じキャッシュ済み取得関数を共有し、
 * 表示できない人物を 404 に落とすことを検証する。
 */

import { AxiosError } from 'axios';

import Person, { generateMetadata } from './page';

// --- Mocks ---

const mockGetCachedPersonDetail = jest.fn();
jest.mock('@/lib/api/person/person.server', () => ({
  getCachedPersonDetail: (...args: unknown[]) =>
    mockGetCachedPersonDetail(...args),
}));

class NotFoundError extends Error {}
const mockNotFound = jest.fn(() => {
  throw new NotFoundError('NEXT_NOT_FOUND');
});
jest.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

jest.mock('./loader', () => ({
  PersonPageLoader: () => null,
}));

// --- Helpers ---

const createPerson = (overrides: Record<string, unknown> = {}) => ({
  id: 500,
  name: 'テスト俳優',
  biography: '略歴',
  is_biography_fallback: false,
  birthday: '1980-05-01',
  deathday: null,
  place_of_birth: '東京都',
  profile_path: '/profile.jpg',
  known_for_department: 'Acting',
  adult: false,
  cast: [
    { id: 1, title: '代表作A' },
    { id: 2, title: '代表作B' },
    { id: 3, title: '代表作C' },
    { id: 4, title: '代表作D' },
  ],
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

describe('人物ページ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateMetadata', () => {
    it('人物名をタイトルに入れる', async () => {
      mockGetCachedPersonDetail.mockResolvedValue(createPerson());

      const metadata = await generateMetadata({ params: params('500') });

      expect(metadata.title).toBe('テスト俳優 | Movie App');
    });

    it('活動分野と代表作3件をdescriptionに入れる', async () => {
      mockGetCachedPersonDetail.mockResolvedValue(createPerson());

      const metadata = await generateMetadata({ params: params('500') });

      expect(metadata.description).toBe(
        'テスト俳優（俳優）のプロフィールと出演作品。代表作: 代表作A、代表作B、代表作C',
      );
    });

    it('出演作が無い場合は代表作を書かない', async () => {
      mockGetCachedPersonDetail.mockResolvedValue(createPerson({ cast: [] }));

      const metadata = await generateMetadata({ params: params('500') });

      expect(metadata.description).toBe(
        'テスト俳優（俳優）のプロフィールと出演作品',
      );
    });

    it('不正なIDではTMDbを呼ばずに未検出タイトルを返す', async () => {
      const metadata = await generateMetadata({ params: params('abc') });

      expect(metadata.title).toBe('人物が見つかりません | Movie App');
      expect(mockGetCachedPersonDetail).not.toHaveBeenCalled();
    });

    it('TMDbが404なら未検出タイトルを返す', async () => {
      mockGetCachedPersonDetail.mockRejectedValue(createNotFoundError());

      const metadata = await generateMetadata({ params: params('999999') });

      expect(metadata.title).toBe('人物が見つかりません | Movie App');
    });
  });

  describe('ページ本体', () => {
    it('表示できる人物なら loader を返す', async () => {
      mockGetCachedPersonDetail.mockResolvedValue(createPerson());

      const element = await Person({ params: params('500') });

      expect(element).not.toBeNull();
      expect(mockNotFound).not.toHaveBeenCalled();
    });

    it('不正なIDは404にする', async () => {
      await expect(Person({ params: params('1e3') })).rejects.toThrow(
        NotFoundError,
      );
      expect(mockGetCachedPersonDetail).not.toHaveBeenCalled();
    });

    it('TMDbが404なら404にする', async () => {
      mockGetCachedPersonDetail.mockRejectedValue(createNotFoundError());

      await expect(Person({ params: params('999999') })).rejects.toThrow(
        NotFoundError,
      );
    });

    it('TMDbが一時障害でも404にする（ページとしては出せないため）', async () => {
      mockGetCachedPersonDetail.mockRejectedValue(new Error('boom'));

      await expect(Person({ params: params('500') })).rejects.toThrow(
        NotFoundError,
      );
    });

    it('アダルト作品の出演者は404にする', async () => {
      mockGetCachedPersonDetail.mockResolvedValue(
        createPerson({ adult: true }),
      );

      await expect(Person({ params: params('500') })).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  it('generateMetadata とページ本体で同じ取得関数を共有する（TMDbを二重に叩かない）', async () => {
    mockGetCachedPersonDetail.mockResolvedValue(createPerson());

    await generateMetadata({ params: params('500') });
    await Person({ params: params('500') });

    // 呼び出し先は常にキャッシュ済み関数。同じ引数なので TMDb へは1回しか出ない
    expect(mockGetCachedPersonDetail).toHaveBeenCalledTimes(2);
    expect(mockGetCachedPersonDetail).toHaveBeenNthCalledWith(1, 500);
    expect(mockGetCachedPersonDetail).toHaveBeenNthCalledWith(2, 500);
  });
});
