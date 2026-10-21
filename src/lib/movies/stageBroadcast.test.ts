/**
 * 舞台・演劇中継作品の判定のテスト
 */

import type { Movie } from '@/lib/types';

import { isStageBroadcast } from './stageBroadcast';

/** 判定対象がタイトルのみのため、ジャンルは劇映画の既定値を置く */
function createMovie(title: string, overrides: Partial<Movie> = {}): Movie {
  return {
    id: 1,
    title,
    original_title: 'Test Movie',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    release_date: '2026-01-01',
    overview: '概要',
    vote_average: 7.5,
    vote_count: 100,
    popularity: 10,
    genre_ids: [18],
    adult: false,
    original_language: 'ja',
    ...overrides,
  };
}

describe('isStageBroadcast', () => {
  describe('上演物の中継を検出する', () => {
    it.each([
      ['National Theatre Live: Hamlet'],
      ['National Theatre Live: The Playboy of the Western World'],
      ['National Theatre Live: Les Liaisons Dangereuses'],
      ['ナショナル・シアター・ライブ「フィフス・ステップ」'],
      ['Paris Opera Ballet: Le Parc'],
      ['「チェンソーマン」ザ・ステージ レゼ篇'],
    ])('シリーズ名で検出すること: %s', (title) => {
      expect(isStageBroadcast(createMovie(title))).toBe(true);
    });

    it.each([
      ['舞台 『光が死んだ夏』'],
      ['舞台「忍たま乱太郎」〜みんなニコニコ、はい、どうぞ！の段〜'],
      ['舞台『龍が如く』-神室町八犬伝-'],
      ['ミュージカル『エリザベート』'],
      ['ミュージカル「忍たま乱太郎」第1弾リブート がんばれ六年生！'],
      ['ペコポン侵略ミュージカル『ケロロ軍曹』'],
    ])('「上演種別＋作品名の括弧」で検出すること: %s', (title) => {
      expect(isStageBroadcast(createMovie(title))).toBe(true);
    });

    it('劇映画ジャンルを持っていても検出すること', () => {
      // 舞台中継は Drama / Comedy が付くため、ジャンルでは候補を絞れない
      const movie = createMovie('舞台『龍が如く』-神室町八犬伝-', {
        genre_ids: [28, 18],
      });

      expect(isStageBroadcast(movie)).toBe(true);
    });

    it('ジャンル未設定でも検出すること', () => {
      const movie = createMovie('ミュージカル『エリザベート』', {
        genre_ids: [],
      });

      expect(isStageBroadcast(movie)).toBe(true);
    });
  });

  describe('通常の映画を検出しない', () => {
    it.each([
      ['ストレンジャー・シングス 未知の世界 5 ～"最後の冒険"の舞台裏～'],
      ['ハイスクール・ミュージカル／ザ・ムービー'],
      ['うみねこのなく頃に～Stage of the golden Witch～Episode 8 EVE'],
      ['ようこそ歌舞伎座へ'],
      ['Kaiser: The Greatest Footballer Never to Play Football'],
    ])('語の一部に一致するだけの作品を検出しないこと: %s', (title) => {
      expect(isStageBroadcast(createMovie(title))).toBe(false);
    });

    it('括弧を伴わない「舞台」を検出しないこと', () => {
      expect(isStageBroadcast(createMovie('舞台裏のヒーローたち'))).toBe(false);
    });

    it('括弧を伴わない「ミュージカル」を検出しないこと', () => {
      expect(isStageBroadcast(createMovie('ミュージカル映画の歴史'))).toBe(
        false,
      );
    });
  });

  describe('表記ゆれ', () => {
    it('全角英字のシリーズ名を検出すること', () => {
      expect(
        isStageBroadcast(
          createMovie('ＮＡＴＩＯＮＡＬ ＴＨＥＡＴＲＥ ＬＩＶＥ: Hamlet'),
        ),
      ).toBe(true);
    });

    it('小文字のシリーズ名を検出すること', () => {
      expect(
        isStageBroadcast(createMovie('national theatre live: Hamlet')),
      ).toBe(true);
    });

    it('種別と括弧の間に空白が無くても検出すること', () => {
      expect(isStageBroadcast(createMovie('舞台『光が死んだ夏』'))).toBe(true);
    });

    it('種別と括弧の間に全角空白があっても検出すること', () => {
      expect(isStageBroadcast(createMovie('舞台　『光が死んだ夏』'))).toBe(
        true,
      );
    });
  });
});
