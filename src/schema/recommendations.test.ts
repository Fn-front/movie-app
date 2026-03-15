/**
 * レコメンド zodスキーマ テスト
 */

import {
  openAiRecommendationItemSchema,
  openAiRecommendationsResponseSchema,
  recommendationSchema,
  recommendationsApiResponseSchema,
} from './recommendations';

describe('openAiRecommendationItemSchema', () => {
  it('有効な入力でパースが成功する', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      title: 'インターステラー',
      year: 2014,
      reason: 'SFが好きな方におすすめ',
    });
    expect(result.success).toBe(true);
  });

  it('titleが空の場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      title: '',
      year: 2014,
      reason: '推薦理由',
    });
    expect(result.success).toBe(false);
  });

  it('titleが未指定の場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      year: 2014,
      reason: '推薦理由',
    });
    expect(result.success).toBe(false);
  });

  it('yearが小数の場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      title: 'テスト映画',
      year: 2014.5,
      reason: '推薦理由',
    });
    expect(result.success).toBe(false);
  });

  it('yearが1888未満の場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      title: 'テスト映画',
      year: 1887,
      reason: '推薦理由',
    });
    expect(result.success).toBe(false);
  });

  it('yearが2100を超える場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      title: 'テスト映画',
      year: 2101,
      reason: '推薦理由',
    });
    expect(result.success).toBe(false);
  });

  it('yearが未指定の場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      title: 'テスト映画',
      reason: '推薦理由',
    });
    expect(result.success).toBe(false);
  });

  it('reasonが空の場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      title: 'テスト映画',
      year: 2014,
      reason: '',
    });
    expect(result.success).toBe(false);
  });

  it('reasonが未指定の場合エラーになる', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      title: 'テスト映画',
      year: 2014,
    });
    expect(result.success).toBe(false);
  });

  it('yearが1888の場合成功する（最小値）', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      title: 'テスト映画',
      year: 1888,
      reason: '推薦理由',
    });
    expect(result.success).toBe(true);
  });

  it('yearが2100の場合成功する（最大値）', () => {
    const result = openAiRecommendationItemSchema.safeParse({
      title: 'テスト映画',
      year: 2100,
      reason: '推薦理由',
    });
    expect(result.success).toBe(true);
  });
});

describe('openAiRecommendationsResponseSchema', () => {
  const validItem = {
    title: 'テスト映画',
    year: 2024,
    reason: '推薦理由',
  };

  it('有効なレコメンド配列でパースが成功する', () => {
    const result = openAiRecommendationsResponseSchema.safeParse({
      recommendations: [validItem],
    });
    expect(result.success).toBe(true);
  });

  it('10件のレコメンドでパースが成功する（最大件数）', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      ...validItem,
      title: `映画${i + 1}`,
    }));
    const result = openAiRecommendationsResponseSchema.safeParse({
      recommendations: items,
    });
    expect(result.success).toBe(true);
  });

  it('空配列の場合エラーになる', () => {
    const result = openAiRecommendationsResponseSchema.safeParse({
      recommendations: [],
    });
    expect(result.success).toBe(false);
  });

  it('11件以上の場合エラーになる', () => {
    const items = Array.from({ length: 11 }, (_, i) => ({
      ...validItem,
      title: `映画${i + 1}`,
    }));
    const result = openAiRecommendationsResponseSchema.safeParse({
      recommendations: items,
    });
    expect(result.success).toBe(false);
  });

  it('recommendationsが未指定の場合エラーになる', () => {
    const result = openAiRecommendationsResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('不正な項目を含む場合エラーになる', () => {
    const result = openAiRecommendationsResponseSchema.safeParse({
      recommendations: [{ title: '', year: 2024, reason: '理由' }],
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

describe('recommendationsApiResponseSchema', () => {
  const validRecommendation = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    tmdb_movie_id: 12345,
    title: 'テスト映画',
    poster_path: '/test.jpg',
    release_date: '2024-01-01',
    vote_average: 7.5,
    genre_ids: [28, 12],
    reason: 'おすすめの理由',
    display_order: 1,
  };

  it('レコメンドありの場合パースが成功する', () => {
    const result = recommendationsApiResponseSchema.safeParse({
      recommendations: [validRecommendation],
      generated_at: '2026-03-15T03:00:00Z',
      has_favorites: true,
    });
    expect(result.success).toBe(true);
  });

  it('空配列とgenerated_at nullの場合パースが成功する', () => {
    const result = recommendationsApiResponseSchema.safeParse({
      recommendations: [],
      generated_at: null,
      has_favorites: false,
    });
    expect(result.success).toBe(true);
  });

  it('recommendationsが未指定の場合エラーになる', () => {
    const result = recommendationsApiResponseSchema.safeParse({
      generated_at: null,
      has_favorites: false,
    });
    expect(result.success).toBe(false);
  });

  it('generated_atが未指定の場合エラーになる', () => {
    const result = recommendationsApiResponseSchema.safeParse({
      recommendations: [],
      has_favorites: false,
    });
    expect(result.success).toBe(false);
  });

  it('has_favoritesが未指定の場合エラーになる', () => {
    const result = recommendationsApiResponseSchema.safeParse({
      recommendations: [],
      generated_at: null,
    });
    expect(result.success).toBe(false);
  });
});
