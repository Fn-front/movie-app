/**
 * 劇場公開 / 配信の相互排他撤廃 E2Eテスト（Issue #580）
 *
 * 以前は「別 release_type に同じIDが存在する映画」を同期時に除外していたため、
 * 劇場公開後に配信化された作品が配信タブに一生現れなかった。
 * movie_cache の PK は (id, release_type) のため両立でき、除外は不要かつ有害だった。
 *
 * 同期（TMDb Discover）側の除外撤廃は実TMDbデータに依存せず検証できないため
 * 単体テストで担保し、ここでは「両 release_type に存在する映画が、
 * どちらのタブの一覧APIからも返る」ことを確認する。
 */

import { test, expect } from '@playwright/test';

import {
  CROSS_RELEASE_TYPE_MOVIE_ID,
  seedCrossReleaseTypeMovie,
  cleanupCrossReleaseTypeMovie,
} from '../helpers/api';
import { localDateFromToday } from '../helpers/date';

/** 指定IDの映画がレスポンスに含まれるか */
function includesSeededMovie(json: {
  data: { movies: { id: number }[] };
}): boolean {
  return json.data.movies.some(
    (movie) => movie.id === CROSS_RELEASE_TYPE_MOVIE_ID,
  );
}

test.describe('劇場公開と配信の共存', () => {
  // fullyParallel ではファイル内のテストが複数ワーカーに分散し、
  // 先に終わったワーカーの afterAll がシードを削除してしまうため、
  // 同一ワーカーで順に実行する
  test.describe.configure({ mode: 'default' });

  // 一覧の日付範囲に確実に収まるよう、本日の日付を使う
  const releaseDate = localDateFromToday();

  test.beforeAll(async () => {
    await seedCrossReleaseTypeMovie(releaseDate);
  });

  test.afterAll(async () => {
    await cleanupCrossReleaseTypeMovie();
  });

  test('劇場公開済みの作品が配信タブの一覧にも表示される', async ({
    request,
  }) => {
    const response = await request.get(
      `/api/movies?release_type=streaming&time_frame=now_showing&release_date_gte=${releaseDate}&release_date_lte=${releaseDate}`,
    );

    expect(response.status()).toBe(200);
    expect(includesSeededMovie(await response.json())).toBe(true);
  });

  test('同じ作品が劇場公開タブの一覧にも表示される', async ({ request }) => {
    const response = await request.get(
      `/api/movies?release_type=theatrical&time_frame=upcoming&release_date_gte=${releaseDate}&release_date_lte=${releaseDate}`,
    );

    expect(response.status()).toBe(200);
    expect(includesSeededMovie(await response.json())).toBe(true);
  });
});
