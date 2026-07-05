/**
 * 詳細モーダル用 E2Eヘルパー
 *
 * 詳細モーダルは GET /api/movies/:id（サーバ側で TMDb 取得）に依存するため、
 * TMDb のレート制限/一時障害で「詳細情報」が描画されず E2E が flaky になる。
 * このヘルパーで /api/movies/:id をモックし、TMDb 非依存で安定させる。
 *
 * ※ 一覧API（GET /api/movies?...）は対象外にするため、末尾が数値IDの
 *   パスのみにマッチする正規表現を使う（glob `**​/api/movies**` との衝突回避）。
 */

import type { Page, Route } from '@playwright/test';
import type { MovieDetail } from '@/lib/types';

/** /api/movies/<id> のみにマッチ（一覧 /api/movies?... は除外） */
const MOVIE_DETAIL_URL = /\/api\/movies\/\d+(?:$|\?)/;

/**
 * 「詳細情報」セクションが確実に描画される、型を満たした完全な MovieDetail を返す。
 * 配列は空配列、数値は数値で埋め、favorite は null（お気に入り未登録）。
 */
function buildMovieDetail(
  id: number,
  overrides: Partial<MovieDetail>,
): MovieDetail {
  return {
    id,
    title: 'E2E詳細映画',
    original_title: 'E2E Detail Movie',
    overview: 'E2E用の概要テキスト',
    poster_path: null,
    backdrop_path: null,
    release_date: '2026-01-01',
    vote_average: 7.5,
    vote_count: 100,
    popularity: 12.3,
    adult: false,
    original_language: 'ja',
    runtime: 120,
    genres: [{ id: 28, name: 'アクション' }],
    production_companies: [],
    production_countries: [],
    spoken_languages: [],
    budget: 0,
    revenue: 0,
    tagline: '',
    status: 'Released',
    homepage: null,
    favorite: null,
    ...overrides,
  };
}

/**
 * 詳細モーダルの取得API（GET /api/movies/:id）をモックする。
 * URL からリクエストされた ID を読み取り、その ID の詳細を返す。
 *
 * @param page Playwright Page
 * @param overrides 返す MovieDetail の一部を上書き（例: { favorite: {...} }）
 */
export async function mockMovieDetail(
  page: Page,
  overrides: Partial<MovieDetail> = {},
): Promise<void> {
  await page.route(MOVIE_DETAIL_URL, async (route: Route) => {
    const match = route
      .request()
      .url()
      .match(/\/api\/movies\/(\d+)/);
    const id = match ? Number(match[1]) : 0;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: buildMovieDetail(id, overrides),
      }),
    });
  });
}
