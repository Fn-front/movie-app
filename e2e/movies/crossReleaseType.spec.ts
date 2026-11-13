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

import { test, expect, type APIRequestContext } from '@playwright/test';

import {
  CROSS_RELEASE_TYPE_MOVIE_ID,
  seedCrossReleaseTypeMovie,
  cleanupCrossReleaseTypeMovie,
} from '../helpers/api';
import { localDateFromToday } from '../helpers/date';

/**
 * 暴走防止の上限。
 * 同じ公開日に 200 件も並ぶことは無いので、ここに達したら前提が壊れている
 */
const MAX_PAGES = 10;

type MovieListResponse = {
  data: {
    movies: { id: number }[];
    pagination: { hasNextPage: boolean };
  };
};

/**
 * 一覧APIを辿って、シードした映画が含まれるか調べる
 *
 * **1ページ目だけを見てはいけない（#1112）。** シード映画のIDは
 * `runScopedMovieId` により実データ（最大 1,822,524）より必ず大きく、
 * id 昇順では最後尾に来る。同じ公開日の作品が ITEMS_PER_PAGE（20件）に
 * 達した時点で1ページ目から溢れ、実データが増えた日に突然落ちる。
 */
async function listIncludesSeededMovie(
  request: APIRequestContext,
  query: string,
): Promise<boolean> {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await request.get(`${query}&page=${page}`);

    expect(response.status()).toBe(200);

    const json: MovieListResponse = await response.json();

    if (
      json.data.movies.some((movie) => movie.id === CROSS_RELEASE_TYPE_MOVIE_ID)
    ) {
      return true;
    }

    if (!json.data.pagination.hasNextPage) return false;
  }

  return false;
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
    const found = await listIncludesSeededMovie(
      request,
      `/api/movies?release_type=streaming&time_frame=now_showing&release_date_gte=${releaseDate}&release_date_lte=${releaseDate}`,
    );

    expect(found).toBe(true);
  });

  test('同じ作品が劇場公開タブの一覧にも表示される', async ({ request }) => {
    const found = await listIncludesSeededMovie(
      request,
      `/api/movies?release_type=theatrical&time_frame=upcoming&release_date_gte=${releaseDate}&release_date_lte=${releaseDate}`,
    );

    expect(found).toBe(true);
  });
});
