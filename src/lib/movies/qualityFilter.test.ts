/**
 * 映画の品質フィルタのテスト
 */

import { MIN_POPULARITY, MIN_VOTE_AVERAGE } from '@/constants/movies';
import type { Movie } from '@/lib/types';

import { isQualityMovie } from './qualityFilter';

/**
 * 品質基準をすべて満たす映画を生成する
 */
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
    genre_ids: [28],
    adult: false,
    original_language: 'ja',
    ...overrides,
  };
}

describe('isQualityMovie', () => {
  describe('既定（全条件を適用）', () => {
    it('すべての条件を満たす映画を通すこと', () => {
      expect(isQualityMovie(createMovie())).toBe(true);
    });

    it('adult作品を除外すること', () => {
      expect(isQualityMovie(createMovie({ adult: true }))).toBe(false);
    });

    it('許可言語の映画を通すこと', () => {
      expect(isQualityMovie(createMovie({ original_language: 'en' }))).toBe(
        true,
      );
    });

    it('許可されていない言語の映画を除外すること', () => {
      expect(isQualityMovie(createMovie({ original_language: 'ko' }))).toBe(
        false,
      );
    });

    it('ジャンルが空配列の映画を除外すること', () => {
      expect(isQualityMovie(createMovie({ genre_ids: [] }))).toBe(false);
    });

    it('ジャンルが未定義の映画を除外すること', () => {
      expect(
        isQualityMovie(
          createMovie({ genre_ids: undefined as unknown as number[] }),
        ),
      ).toBe(false);
    });

    it('未評価（vote_average=0）の映画は除外しないこと', () => {
      expect(isQualityMovie(createMovie({ vote_average: 0 }))).toBe(true);
    });

    it('評価が閾値未満の映画を除外すること', () => {
      expect(
        isQualityMovie(createMovie({ vote_average: MIN_VOTE_AVERAGE - 0.1 })),
      ).toBe(false);
    });

    it('評価が閾値ちょうどの映画を通すこと', () => {
      expect(
        isQualityMovie(createMovie({ vote_average: MIN_VOTE_AVERAGE })),
      ).toBe(true);
    });

    it('人気度が閾値未満の映画を除外すること', () => {
      expect(
        isQualityMovie(createMovie({ popularity: MIN_POPULARITY - 0.1 })),
      ).toBe(false);
    });

    it('人気度が閾値ちょうどの映画を通すこと', () => {
      expect(isQualityMovie(createMovie({ popularity: MIN_POPULARITY }))).toBe(
        true,
      );
    });
  });

  describe('requireLanguage: false', () => {
    it('許可されていない言語でも通すこと', () => {
      expect(
        isQualityMovie(createMovie({ original_language: 'ko' }), {
          requireLanguage: false,
        }),
      ).toBe(true);
    });

    it('他の条件は引き続き適用されること', () => {
      expect(
        isQualityMovie(createMovie({ genre_ids: [] }), {
          requireLanguage: false,
        }),
      ).toBe(false);
    });
  });

  describe('requireGenres: false', () => {
    it('ジャンルが無くても通すこと', () => {
      expect(
        isQualityMovie(createMovie({ genre_ids: [] }), {
          requireGenres: false,
        }),
      ).toBe(true);
    });
  });

  describe('requireVoteAverage: false', () => {
    it('評価が閾値未満でも通すこと', () => {
      expect(
        isQualityMovie(createMovie({ vote_average: 1 }), {
          requireVoteAverage: false,
        }),
      ).toBe(true);
    });
  });

  describe('requirePopularity: false', () => {
    it('人気度が閾値未満でも通すこと', () => {
      expect(
        isQualityMovie(createMovie({ popularity: 0 }), {
          requirePopularity: false,
        }),
      ).toBe(true);
    });
  });

  describe('adult除外は無効化できないこと', () => {
    // iCal経由（syncEigaMovies）など全条件をオフにする呼び出しでも、
    // adult作品が保存されないことを担保する（#569 の再発防止）
    it('全オプションをfalseにしてもadult作品は除外されること', () => {
      const movie = createMovie({
        adult: true,
        original_language: 'ko',
        genre_ids: [],
        vote_average: 1,
        popularity: 0,
      });

      expect(
        isQualityMovie(movie, {
          requireLanguage: false,
          requireGenres: false,
          requireVoteAverage: false,
          requirePopularity: false,
        }),
      ).toBe(false);
    });

    it('全オプションをfalseにすればadult以外の低品質作品は通ること', () => {
      const movie = createMovie({
        adult: false,
        original_language: 'ko',
        genre_ids: [],
        vote_average: 1,
        popularity: 0,
      });

      expect(
        isQualityMovie(movie, {
          requireLanguage: false,
          requireGenres: false,
          requireVoteAverage: false,
          requirePopularity: false,
        }),
      ).toBe(true);
    });
  });

  describe('移行前の表記との等価性', () => {
    // route.ts は正の論理、syncNowPlayingMovies.ts は否定の論理で
    // 同じ条件を書いていた。統一後も両方と同じ判定になることを確認する
    const voteAverages = [0, 0.1, MIN_VOTE_AVERAGE - 0.1, MIN_VOTE_AVERAGE, 10];

    it.each(voteAverages)(
      'vote_average=%p で旧実装（正の論理・否定の論理）と一致すること',
      (voteAverage) => {
        const movie = createMovie({ vote_average: voteAverage });

        // route.ts の旧表記
        const legacyPositive =
          movie.vote_average === 0 || movie.vote_average >= MIN_VOTE_AVERAGE;
        // syncNowPlayingMovies.ts の旧表記
        const legacyNegative = !(
          movie.vote_average > 0 && movie.vote_average < MIN_VOTE_AVERAGE
        );

        expect(legacyPositive).toBe(legacyNegative);
        expect(isQualityMovie(movie)).toBe(legacyPositive);
      },
    );
  });
});
