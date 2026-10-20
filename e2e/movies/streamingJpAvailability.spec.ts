/**
 * JP配信実態による配信タブの振り分け E2Eテスト（Issue #582）
 *
 * TMDb Discover の `with_release_type=4` は「どこかの国でデジタル公開された」
 * しか意味せず、日本で観られるかは保証されない。以前はこれだけで配信タブを
 * 組み立てていたため、JP未配信作品や配信終了作品が混ざっていた。
 *
 * TMDb watch/providers を叩く同期処理そのものは実TMDbデータに依存するため
 * 単体テストで担保し、ここでは movie_cache の状態に対して一覧APIが
 * 正しく振り分けることを確認する。
 */

import { test, expect, type APIResponse } from '@playwright/test';

import {
  JP_AVAILABILITY_MOVIE_IDS,
  seedJpAvailabilityMovies,
  cleanupJpAvailabilityMovies,
} from '../helpers/api';
import { localDateFromToday } from '../helpers/date';

const TODAY = localDateFromToday();
/** 劇場公開済みを表す過去日。同期対象ウィンドウ（-2ヶ月）に収まる値にする */
const PAST_RELEASE_DATE = localDateFromToday(-30);
/** 配信開始がこれからであることを表す未来日 */
const FUTURE_DIGITAL_DATE = localDateFromToday(30);
/**
 * 劇場公開のみの作品に使う未来日
 *
 * 本日だと「upcoming が当日を含むか」という境界の実装詳細に結果が左右される。
 * 検証したいのは配信フィルタに巻き込まれないことなので、境界から離す
 */
const FUTURE_THEATRICAL_DATE = localDateFromToday(7);

/** レスポンスに含まれる映画IDの一覧 */
async function movieIdsOf(response: APIResponse): Promise<number[]> {
  const json = (await response.json()) as {
    data: { movies: { id: number }[] };
  };
  return json.data.movies.map((movie) => movie.id);
}

test.describe('配信タブのJP配信実態フィルタ', () => {
  // fullyParallel ではファイル内のテストが複数ワーカーに分散し、
  // beforeAll/afterAll がワーカーごとに走る。先に終わったワーカーの
  // afterAll がシードを削除し、実行中の別ワーカーが0件になるため
  // 同一ワーカーで順に実行する
  test.describe.configure({ mode: 'default' });

  test.beforeAll(async () => {
    await seedJpAvailabilityMovies({
      today: TODAY,
      pastReleaseDate: PAST_RELEASE_DATE,
      futureDigitalDate: FUTURE_DIGITAL_DATE,
      futureTheatricalDate: FUTURE_THEATRICAL_DATE,
    });
  });

  test.afterAll(async () => {
    await cleanupJpAvailabilityMovies();
  });

  test('配信中タブは日本で配信中の作品を返す', async ({ request }) => {
    const response = await request.get(
      `/api/movies?release_type=streaming&time_frame=now_showing&release_date_gte=${TODAY}&release_date_lte=${TODAY}`,
    );

    expect(response.status()).toBe(200);
    expect(await movieIdsOf(response)).toContain(
      JP_AVAILABILITY_MOVIE_IDS.STREAMING_NOW,
    );
  });

  test('配信中タブは日本未配信の作品を返さない', async ({ request }) => {
    // 公開日・リリースタイプは配信中の作品と同じで、JP配信可否だけが異なる。
    // release_date だけに依存していた旧実装ではこの作品も返っていた
    const response = await request.get(
      `/api/movies?release_type=streaming&time_frame=now_showing&release_date_gte=${TODAY}&release_date_lte=${TODAY}`,
    );

    expect(response.status()).toBe(200);
    expect(await movieIdsOf(response)).not.toContain(
      JP_AVAILABILITY_MOVIE_IDS.NOT_AVAILABLE_IN_JP,
    );
  });

  test('配信予定タブは劇場公開済みでも配信開始が未来の作品を返す', async ({
    request,
  }) => {
    // release_date は過去のため、release_date >= today で絞っていた旧実装では
    // 取りこぼしていたケース
    const response = await request.get(
      `/api/movies?release_type=streaming&time_frame=upcoming&release_date_gte=${PAST_RELEASE_DATE}&release_date_lte=${PAST_RELEASE_DATE}`,
    );

    expect(response.status()).toBe(200);
    expect(await movieIdsOf(response)).toContain(
      JP_AVAILABILITY_MOVIE_IDS.DIGITAL_UPCOMING,
    );
  });

  test('配信予定タブは配信中の作品を返さない', async ({ request }) => {
    const response = await request.get(
      `/api/movies?release_type=streaming&time_frame=upcoming&release_date_gte=${TODAY}&release_date_lte=${TODAY}`,
    );

    expect(response.status()).toBe(200);
    const ids = await movieIdsOf(response);
    expect(ids).not.toContain(JP_AVAILABILITY_MOVIE_IDS.STREAMING_NOW);
    // デジタル公開日が無い作品も配信予定ではない
    expect(ids).not.toContain(JP_AVAILABILITY_MOVIE_IDS.NOT_AVAILABLE_IN_JP);
  });

  test('劇場公開タブはJP配信実態で絞り込まれない', async ({ request }) => {
    // is_currently_streaming=false の劇場公開作品が、配信タブ用の条件に
    // 巻き込まれて消えないことを確認する
    const response = await request.get(
      `/api/movies?release_type=theatrical&time_frame=upcoming&release_date_gte=${FUTURE_THEATRICAL_DATE}&release_date_lte=${FUTURE_THEATRICAL_DATE}`,
    );

    expect(response.status()).toBe(200);
    expect(await movieIdsOf(response)).toContain(
      JP_AVAILABILITY_MOVIE_IDS.THEATRICAL_ONLY,
    );
  });
});
