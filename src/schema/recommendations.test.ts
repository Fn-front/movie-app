/**
 * レコメンド zodスキーマ テスト
 */

import { RECOMMENDATIONS_MAX_REQUEST_COUNT } from '@/constants';

import {
  openAiRecommendationItemSchema,
  openAiRecommendationsResponseSchema,
  recommendationSchema,
} from './recommendations';

/** AIレスポンスで許容される最大件数（1回の要求件数の上限と揃う） */
const MAX_RESPONSE_COUNT = RECOMMENDATIONS_MAX_REQUEST_COUNT;

describe('openAiRecommendationItemSchema', () => {
  const validItem = {
    title_ja: 'インターステラー',
    title_en: 'Interstellar',
    year: 2014,
    reason: 'SFが好きな方におすすめ',
  };

  it('有効な入力でパースが成功する', () => {
    const result = openAiRecommendationItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it('title_jaが空の場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      ...validItem,
      title_ja: '',
    });
    expect(result.success).toBe(false);
  });

  it('title_jaが未指定の場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      ...validItem,
      title_ja: undefined,
    });
    expect(result.success).toBe(false);
  });

  it('title_enが空の場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      ...validItem,
      title_en: '',
    });
    expect(result.success).toBe(false);
  });

  it('title_enが未指定の場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      ...validItem,
      title_en: undefined,
    });
    expect(result.success).toBe(false);
  });

  it('邦題と原題が同一文字列でも成功する（邦題が存在しない作品）', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      ...validItem,
      title_ja: 'Memoria',
      title_en: 'Memoria',
    });
    expect(result.success).toBe(true);
  });

  it('yearが小数の場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      ...validItem,
      year: 2014.5,
    });
    expect(result.success).toBe(false);
  });

  it('yearが1888未満の場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      ...validItem,
      year: 1887,
    });
    expect(result.success).toBe(false);
  });

  it('yearが2100を超える場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      ...validItem,
      year: 2101,
    });
    expect(result.success).toBe(false);
  });

  it('yearが未指定の場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      ...validItem,
      year: undefined,
    });
    expect(result.success).toBe(false);
  });

  it('reasonが空の場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      ...validItem,
      reason: '',
    });
    expect(result.success).toBe(false);
  });

  it('reasonが未指定の場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      ...validItem,
      reason: undefined,
    });
    expect(result.success).toBe(false);
  });

  it('yearが1888の場合成功する（最小値）', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      ...validItem,
      year: 1888,
    });
    expect(result.success).toBe(true);
  });

  it('yearが2100の場合成功する（最大値）', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      ...validItem,
      year: 2100,
    });
    expect(result.success).toBe(true);
  });
});

describe('openAiRecommendationsResponseSchema', () => {
  const validItem = {
    title_ja: 'テスト映画',
    title_en: 'Test Movie',
    year: 2024,
    reason: '推薦理由',
  };

  /** 連番の邦題・原題を持つ項目を生成する */
  const createItems = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      ...validItem,
      title_ja: `映画${i + 1}`,
      title_en: `Movie ${i + 1}`,
    }));

  it('有効なレコメンド配列でパースが成功する', () => {
    const result = openAiRecommendationsResponseSchema.safeParse({
      recommendations: [validItem],
    });
    expect(result.success).toBe(true);
  });

  it('最大件数＋バッファ件のレコメンドでパースが成功する（上限）', () => {
    const result = openAiRecommendationsResponseSchema.safeParse({
      recommendations: createItems(MAX_RESPONSE_COUNT),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recommendations).toHaveLength(MAX_RESPONSE_COUNT);
    }
  });

  it('空配列の場合エラーになる', () => {
    const result = openAiRecommendationsResponseSchema.safeParse({
      recommendations: [],
    });
    expect(result.success).toBe(false);
  });

  it('上限（最大件数＋バッファ）を超える場合は弾かず上限件数に切り詰める', () => {
    const result = openAiRecommendationsResponseSchema.safeParse({
      recommendations: createItems(MAX_RESPONSE_COUNT + 1),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recommendations).toHaveLength(MAX_RESPONSE_COUNT);
    }
  });

  it('上限を大幅に超える場合も先頭から上限件数のみ残す（順序維持）', () => {
    const result = openAiRecommendationsResponseSchema.safeParse({
      recommendations: createItems(MAX_RESPONSE_COUNT + 10),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recommendations).toHaveLength(MAX_RESPONSE_COUNT);
      expect(result.data.recommendations[0].title_ja).toBe('映画1');
      expect(result.data.recommendations[MAX_RESPONSE_COUNT - 1].title_ja).toBe(
        `映画${MAX_RESPONSE_COUNT}`,
      );
    }
  });

  it('recommendationsが未指定の場合エラーになる', () => {
    const result = openAiRecommendationsResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('不正な項目を含む場合エラーになる', () => {
    const result = openAiRecommendationsResponseSchema.safeParse({
      recommendations: [{ ...validItem, title_ja: '' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('recommendationSchema', () => {
  const validRecommendation = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    tmdb_movie_id: 12345,
    title: 'テスト映画',
    poster_path: '/test.jpg',
    release_date: '2024-01-01',
    vote_average: 7.5,
    vote_count: 1234,
    genre_ids: [28, 12],
    reason: 'おすすめの理由',
    display_order: 1,
  };

  it('有効な入力でパースが成功する', () => {
    const result = recommendationSchema.safeParse(validRecommendation);
    expect(result.success).toBe(true);
  });

  it('poster_pathがnullでも成功する', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      poster_path: null,
    });
    expect(result.success).toBe(true);
  });

  it('release_dateがnullでも成功する', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      release_date: null,
    });
    expect(result.success).toBe(true);
  });

  it('vote_averageがnullでも成功する', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      vote_average: null,
    });
    expect(result.success).toBe(true);
  });

  it('vote_averageが0の場合成功する（最小値）', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      vote_average: 0,
    });
    expect(result.success).toBe(true);
  });

  it('vote_averageが10の場合成功する（最大値）', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      vote_average: 10,
    });
    expect(result.success).toBe(true);
  });

  it('vote_averageが負の場合エラーになる', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      vote_average: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it('vote_averageが10を超える場合エラーになる', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      vote_average: 10.1,
    });
    expect(result.success).toBe(false);
  });

  it('vote_countが0の場合成功する（最小値）', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      vote_count: 0,
    });
    expect(result.success).toBe(true);
  });

  it('vote_countが負の場合エラーになる', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      vote_count: -1,
    });
    expect(result.success).toBe(false);
  });

  it('vote_countが小数の場合エラーになる', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      vote_count: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('vote_countが未指定の場合エラーになる', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      vote_count: undefined,
    });
    expect(result.success).toBe(false);
  });

  it('genre_idsがnullでも成功する', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      genre_ids: null,
    });
    expect(result.success).toBe(true);
  });

  it('idが不正なUUIDの場合エラーになる', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      id: 'invalid-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('tmdb_movie_idが0以下の場合エラーになる', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      tmdb_movie_id: 0,
    });
    expect(result.success).toBe(false);
  });

  it('display_orderが0の場合エラーになる', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      display_order: 0,
    });
    expect(result.success).toBe(false);
  });

  it('display_orderが11の場合エラーになる', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      display_order: 11,
    });
    expect(result.success).toBe(false);
  });

  it('display_orderが1の場合成功する（最小値）', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      display_order: 1,
    });
    expect(result.success).toBe(true);
  });

  it('display_orderが10の場合成功する（最大値）', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      display_order: 10,
    });
    expect(result.success).toBe(true);
  });

  it('reasonが空の場合エラーになる', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      reason: '',
    });
    expect(result.success).toBe(false);
  });
});
