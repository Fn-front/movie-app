/**
 * @jest-environment node
 */

/**
 * 映画詳細 intercepting route のテスト
 *
 * 一覧からのソフト遷移で当たるスロット。ここで TMDb を引かないこと
 * （引くとモーダルが出るまでサーバー往復を待つ）と、不正なIDでは
 * 器だけを重ねないことを確認する（#1033）。
 */

import InterceptedMovieDetail from './page';

// --- Mocks ---

jest.mock(
  '@/features/movies/component/movieDetailRouteModal/movieDetailRouteModal',
  () => ({
    MovieDetailRouteModal: () => null,
  }),
);

const params = (id: string) => Promise.resolve({ id });

// --- Tests ---

describe('映画詳細 intercepting route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('数値のIDならモーダルを描画する', async () => {
    const element = await InterceptedMovieDetail({ params: params('550') });

    expect(element).not.toBeNull();
    expect(element?.props).toEqual({ movieId: 550 });
  });

  it.each([
    ['非数値', 'abc'],
    ['指数表記', '1e3'],
    ['ゼロ', '0'],
  ])('%s のIDでは何も描画しない（404はページ側に任せる）', async (_l, id) => {
    const element = await InterceptedMovieDetail({ params: params(id) });

    expect(element).toBeNull();
  });
});
