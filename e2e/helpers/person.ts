/**
 * 人物ページ用 E2Eヘルパー
 *
 * 人物ページのクライアント側データは GET /api/person/:id（サーバ側で TMDb 取得）に
 * 依存するため、TMDb のレート制限/一時障害で表示が揺れて E2E が flaky になる。
 * ここで /api/person/:id をモックし、表示内容の検証を TMDb 非依存で安定させる。
 *
 * ⚠️ ページ本体（Server Component）の存在確認と <title> 生成だけは
 *    サーバ側で TMDb を直接呼ぶため route モックが効かない。そのため E2E では
 *    実在が安定している人物ID（PERSON_ID）を使う。
 */

import type { Page, Route } from '@playwright/test';
import type { PersonDetail, PersonMovieCredit } from '@/lib/types';

/** /api/person/<id> にマッチ */
const PERSON_DETAIL_URL = /\/api\/person\/\d+(?:$|\?)/;

/**
 * E2Eで使う人物ID。
 * TMDb に長期間存在している人物を選ぶ（サーバ側の存在確認は実APIを通るため）。
 */
export const PERSON_ID = 500;

/** TMDb に存在しない人物ID（404ページの検証用） */
export const MISSING_PERSON_ID = 999999999;

/** 出演作クレジットを組み立てる */
function buildCredit(
  overrides: Partial<PersonMovieCredit> = {},
): PersonMovieCredit {
  return {
    id: 101,
    title: 'E2E出演作',
    overview: 'E2E用の出演作概要',
    poster_path: null,
    backdrop_path: null,
    release_date: '2024-05-01',
    vote_average: 7.2,
    vote_count: 250,
    popularity: 30,
    genre_ids: [28],
    adult: false,
    original_language: 'en',
    character: 'E2E役',
    ...overrides,
  };
}

/** 人物詳細を組み立てる */
function buildPersonDetail(
  id: number,
  overrides: Partial<PersonDetail>,
): PersonDetail {
  return {
    id,
    name: 'E2Eテスト俳優',
    biography: 'E2E用の略歴テキストです。',
    is_biography_fallback: false,
    birthday: '1980-05-01',
    deathday: null,
    place_of_birth: '東京都',
    profile_path: null,
    known_for_department: 'Acting',
    adult: false,
    cast: [
      buildCredit({ id: 101, title: 'E2E出演作A', character: '主人公' }),
      buildCredit({
        id: 102,
        title: 'E2E出演作B',
        character: '脇役',
        release_date: '2022-03-01',
      }),
    ],
    ...overrides,
  };
}

/**
 * 人物詳細の取得API（GET /api/person/:id）をモックする
 *
 * @param page Playwright Page
 * @param overrides 返す PersonDetail の一部を上書き（例: { cast: [] }）
 */
export async function mockPersonDetail(
  page: Page,
  overrides: Partial<PersonDetail> = {},
): Promise<void> {
  await page.route(PERSON_DETAIL_URL, async (route: Route) => {
    const match = route
      .request()
      .url()
      .match(/\/api\/person\/(\d+)/);
    const id = match ? Number(match[1]) : 0;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: buildPersonDetail(id, overrides),
      }),
    });
  });
}
