/**
 * ライブ・コンサート映像作品の判定のテスト
 */

import {
  DOCUMENTARY_GENRE_ID,
  MUSIC_GENRE_ID,
  CONCERT_KEYWORD_IDS,
} from '@/constants/movies';
import { getMovieKeywordIds } from '@/lib/tmdb/tmdb';
import type { Movie } from '@/lib/types';

import {
  hasConcertTitle,
  isConcertFilm,
  isConcertFilmCandidate,
} from './concertFilm';

jest.mock('@/lib/tmdb/tmdb', () => ({
  getMovieKeywordIds: jest.fn(),
}));

const mockGetMovieKeywordIds = getMovieKeywordIds as jest.MockedFunction<
  typeof getMovieKeywordIds
>;

/** Music ジャンル単体の映画を生成する */
function createMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 1,
    title: 'テスト映画',
    original_title: 'Test Movie',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    release_date: '2026-01-01',
    overview: '概要',
    vote_average: 7.5,
    vote_count: 100,
    popularity: 10,
    genre_ids: [MUSIC_GENRE_ID],
    adult: false,
    original_language: 'ja',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMovieKeywordIds.mockResolvedValue([]);
});

describe('isConcertFilmCandidate', () => {
  it('Music単体の作品を候補とすること', () => {
    expect(isConcertFilmCandidate(createMovie())).toBe(true);
  });

  it('Music + Documentary の作品を候補とすること', () => {
    expect(
      isConcertFilmCandidate(
        createMovie({ genre_ids: [MUSIC_GENRE_ID, DOCUMENTARY_GENRE_ID] }),
      ),
    ).toBe(true);
  });

  it('ジャンルの順序が逆でも候補とすること', () => {
    expect(
      isConcertFilmCandidate(
        createMovie({ genre_ids: [DOCUMENTARY_GENRE_ID, MUSIC_GENRE_ID] }),
      ),
    ).toBe(true);
  });

  it('劇映画ジャンルを併せ持つ作品を候補にしないこと（音楽伝記映画）', () => {
    // 『ボヘミアン・ラプソディ』は [Music, Drama]
    expect(
      isConcertFilmCandidate(createMovie({ genre_ids: [MUSIC_GENRE_ID, 18] })),
    ).toBe(false);
  });

  it('Musicを含まないドキュメンタリーを候補にしないこと', () => {
    expect(
      isConcertFilmCandidate(
        createMovie({ genre_ids: [DOCUMENTARY_GENRE_ID] }),
      ),
    ).toBe(false);
  });

  it('ジャンルが空の作品を候補にしないこと', () => {
    expect(isConcertFilmCandidate(createMovie({ genre_ids: [] }))).toBe(false);
  });

  it('ジャンルが未設定の作品を候補にしないこと', () => {
    expect(isConcertFilmCandidate(createMovie({ genre_ids: undefined }))).toBe(
      false,
    );
  });
});

describe('hasConcertTitle', () => {
  it.each([
    ['ヨルシカ LIVE「盗作」'],
    ['&TEAM VR CONCERT: BOUNDLESS'],
    ['Taylor Swift | The Eras Tour | The Final Show'],
    ['ATEEZ: LIGHT THE WAY IN CINEMAS'],
    ['『あんさんぶるスターズ！THE STAGE』 -Requiem from Knights-'],
    ['時光代理人-LINK CLICK- Game of Rules」THE MUSICAL'],
    ['XXXXX Livestream'],
    ['パワー・トゥ・ザ・ピープル：ジョン＆ヨーコ・ライヴ・イン・NYC'],
    ['MILESixTONES（スタジアムツアー）'],
    ['EPiC / エピック エルヴィス・プレスリー・イン・コンサート'],
    ['東京ドーム公演記念 乗車準備会 僕たちは、超特急です!'],
    ["투모로우바이투게더 월드 투어 ‘액트 : 투모로우'"],
  ])('ライブ興行のタイトルを検出すること: %s', (title) => {
    expect(hasConcertTitle(title)).toBe(true);
  });

  it.each([
    ['オアシス：ドント・ルック・バック・イン・アンガー'],
    ['ポール･マッカートニー：マン･オン･ザ･ラン'],
    ['Iron Maiden: Burning Ambition'],
    ['Amazing Journey: The Story of The Who'],
    ['KATSEYE: WILD HEARTS'],
    ['Lost Angel: The Genius of Judee Sill'],
  ])('音楽ドキュメンタリーのタイトルを検出しないこと: %s', (title) => {
    expect(hasConcertTitle(title)).toBe(false);
  });

  it.each([
    ['Alive'],
    ['Still Alive'],
    ['Olive Kitteridge'],
    ['The Detour'],
    ['Delivery Man'],
  ])('語の一部に一致するだけのタイトルを検出しないこと: %s', (title) => {
    expect(hasConcertTitle(title)).toBe(false);
  });
});

describe('isConcertFilm', () => {
  it('候補外の作品はTMDbに問い合わせず false を返すこと', async () => {
    const movie = createMovie({
      genre_ids: [MUSIC_GENRE_ID, 18],
      title: 'LIVE TOUR の文字を含む劇映画',
    });

    expect(await isConcertFilm(movie)).toBe(false);
    expect(mockGetMovieKeywordIds).not.toHaveBeenCalled();
  });

  it('タイトルで判定できる場合はTMDbに問い合わせないこと', async () => {
    const movie = createMovie({ title: 'ヨルシカ LIVE「盗作」' });

    expect(await isConcertFilm(movie)).toBe(true);
    expect(mockGetMovieKeywordIds).not.toHaveBeenCalled();
  });

  it('concert系キーワードを持つ作品を除外対象とすること', async () => {
    mockGetMovieKeywordIds.mockResolvedValue([CONCERT_KEYWORD_IDS[0]]);
    const movie = createMovie({ title: 'Queen Budapest' });

    expect(await isConcertFilm(movie)).toBe(true);
    expect(mockGetMovieKeywordIds).toHaveBeenCalledWith(movie.id, undefined);
  });

  it('concert系キーワードを持たない作品を除外対象としないこと', async () => {
    // 『オアシス：ドント・ルック・バック・イン・アンガー』は music documentary のみ
    mockGetMovieKeywordIds.mockResolvedValue([165194]);
    const movie = createMovie({
      genre_ids: [DOCUMENTARY_GENRE_ID, MUSIC_GENRE_ID],
      title: 'オアシス：ドント・ルック・バック・イン・アンガー',
    });

    expect(await isConcertFilm(movie)).toBe(false);
  });

  it('キーワード取得に失敗した場合は除外しないこと（fail-open）', async () => {
    mockGetMovieKeywordIds.mockRejectedValue(new Error('TMDb error'));
    const movie = createMovie({ title: '音楽ドキュメンタリー' });

    expect(await isConcertFilm(movie)).toBe(false);
  });

  it('中断シグナルをTMDb呼び出しへ引き渡すこと', async () => {
    const controller = new AbortController();
    const movie = createMovie({ title: '音楽ドキュメンタリー' });

    await isConcertFilm(movie, { signal: controller.signal });

    expect(mockGetMovieKeywordIds).toHaveBeenCalledWith(movie.id, {
      signal: controller.signal,
    });
  });
});
