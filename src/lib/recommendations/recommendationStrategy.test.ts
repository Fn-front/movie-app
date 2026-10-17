/**
 * @jest-environment node
 */

/**
 * レコメンド生成の戦略ロジック テスト
 */

import {
  OPENAI_CONFIG,
  RECOMMENDATIONS_MAX_COUNT,
  RECOMMENDATIONS_MAX_GENRE_RATIO,
  RECOMMENDATIONS_RETRY_MAX_TEMPERATURE,
  RECOMMENDATIONS_RETRY_TEMPERATURE_STEP,
} from '@/constants';
import type { ResolvedRecommendation } from '@/lib/openai/generateRecommendations';

import {
  applyDiversityReranking,
  buildRetryStrategy,
} from './recommendationStrategy';

// --- Helpers ---

/** 指定ジャンルの候補を1件作る */
const createCandidate = (
  id: number,
  genreIds: number[] | null,
): ResolvedRecommendation => ({
  tmdb_movie_id: id,
  title: `Movie ${id}`,
  poster_path: null,
  release_date: null,
  vote_average: null,
  vote_count: 0,
  genre_ids: genreIds,
  reason: `理由${id}`,
  display_order: id,
});

/** 代表ジャンルの並びから候補配列を作る */
const createCandidates = (genres: (number | null)[]) =>
  genres.map((genre, i) =>
    createCandidate(i + 1, genre === null ? null : [genre]),
  );

const ACTION = 28;
const DRAMA = 18;
const COMEDY = 35;

// --- Tests ---

describe('buildRetryStrategy', () => {
  it('初回は基準のtemperatureで追加指示を付けない', () => {
    const strategy = buildRetryStrategy(0);

    expect(strategy.temperature).toBe(
      OPENAI_CONFIG.RECOMMENDATIONS_TEMPERATURE,
    );
    expect(strategy.hint).toBeNull();
  });

  it('試行ごとにtemperatureを上げる', () => {
    expect(buildRetryStrategy(1).temperature).toBeCloseTo(
      OPENAI_CONFIG.RECOMMENDATIONS_TEMPERATURE +
        RECOMMENDATIONS_RETRY_TEMPERATURE_STEP,
    );
    expect(buildRetryStrategy(2).temperature).toBeCloseTo(
      OPENAI_CONFIG.RECOMMENDATIONS_TEMPERATURE +
        RECOMMENDATIONS_RETRY_TEMPERATURE_STEP * 2,
    );
  });

  it('temperatureは上限を超えない', () => {
    expect(buildRetryStrategy(100).temperature).toBe(
      RECOMMENDATIONS_RETRY_MAX_TEMPERATURE,
    );
  });

  it('2回目以降は方向を変える指示を付ける', () => {
    const hint = buildRetryStrategy(1).hint;

    expect(hint).toContain('異なるジャンル');
    expect(hint).toContain('年代');
  });
});

describe('applyDiversityReranking', () => {
  /** 10件中、同一ジャンルが占めてよい上限 */
  const maxPerGenre = Math.ceil(
    RECOMMENDATIONS_MAX_COUNT * RECOMMENDATIONS_MAX_GENRE_RATIO,
  );

  it('同一ジャンルの採用数を上限までに抑える', () => {
    // アクション8件 + ドラマ2件 → アクションは上限(4件)まで
    const candidates = createCandidates([
      ...Array<number>(8).fill(ACTION),
      DRAMA,
      DRAMA,
    ]);

    const result = applyDiversityReranking(
      candidates,
      RECOMMENDATIONS_MAX_COUNT,
    );
    const actionCount = result.filter(
      (r) => r.genre_ids?.[0] === ACTION,
    ).length;

    // 上限4件 + 枠が余った分の補充で10件は埋まる
    expect(result).toHaveLength(RECOMMENDATIONS_MAX_COUNT);
    expect(actionCount).toBeGreaterThanOrEqual(maxPerGenre);
    // 上限を超えた分は後ろに回されるので、先頭4件はアクションが占めない
    expect(
      result.slice(0, maxPerGenre + 2).filter((r) => r.genre_ids?.[0] === DRAMA)
        .length,
    ).toBe(2);
  });

  it('候補が足りなくても件数を減らさない（保留分で補充する）', () => {
    // 全件アクションしかない場合、上限より多くても採用する
    const candidates = createCandidates(Array<number>(10).fill(ACTION));

    const result = applyDiversityReranking(
      candidates,
      RECOMMENDATIONS_MAX_COUNT,
    );

    expect(result).toHaveLength(RECOMMENDATIONS_MAX_COUNT);
  });

  it('ジャンルが分散していれば関連度順をそのまま保つ', () => {
    const candidates = createCandidates([ACTION, DRAMA, COMEDY, ACTION, DRAMA]);

    const result = applyDiversityReranking(candidates, 5);

    expect(result.map((r) => r.tmdb_movie_id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('偏った候補は上限超過分が後ろに回る', () => {
    // アクション5件が先頭、ドラマ1件が最後 → ドラマが繰り上がる
    const candidates = createCandidates([
      ACTION,
      ACTION,
      ACTION,
      ACTION,
      ACTION,
      DRAMA,
    ]);

    const result = applyDiversityReranking(candidates, 5);

    // 5件中、同一ジャンル上限は ceil(5 * 0.4) = 2
    expect(result.slice(0, 3).map((r) => r.tmdb_movie_id)).toEqual([1, 2, 6]);
  });

  it('genre_idsがnullの候補は偏り判定の対象外', () => {
    const candidates = createCandidates([null, null, null, null, null]);

    const result = applyDiversityReranking(candidates, 5);

    expect(result).toHaveLength(5);
  });

  it('limitを超えて返さない', () => {
    const candidates = createCandidates([
      ACTION,
      DRAMA,
      COMEDY,
      ACTION,
      DRAMA,
      COMEDY,
    ]);

    const result = applyDiversityReranking(candidates, 3);

    expect(result).toHaveLength(3);
  });

  it('display_orderを1から振り直す', () => {
    const candidates = createCandidates([ACTION, ACTION, ACTION, DRAMA]);

    const result = applyDiversityReranking(candidates, 4);

    expect(result.map((r) => r.display_order)).toEqual([1, 2, 3, 4]);
  });

  it('候補0件なら空配列を返す', () => {
    expect(applyDiversityReranking([], RECOMMENDATIONS_MAX_COUNT)).toEqual([]);
  });

  it('limitが1でも上限計算が0にならない', () => {
    const candidates = createCandidates([ACTION, ACTION]);

    const result = applyDiversityReranking(candidates, 1);

    expect(result).toHaveLength(1);
  });
});
