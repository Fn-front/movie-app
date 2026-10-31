/**
 * 地域（原語）フィルタ E2Eテスト
 *
 * ストーリー: 既定では韓国・中華圏・タイ/インドの作品が一覧に出ず、
 * 検索条件でそれぞれを表示に含められる。
 *
 * 既定の除外は `/api/movies` が担保している（UIの初期値ではない）ため、
 * 一覧APIの結果で検証する。原語違いの作品を movie_cache にシードし、
 * 実TMDbデータの入れ替わりに依存させない。
 */

import { test, expect } from '../fixtures/auth';
import {
  REGION_FILTER_MOVIE_IDS,
  seedRegionFilterMovies,
  cleanupRegionFilterMovies,
  resetFilters,
} from '../helpers/api';
import { localDateFromToday } from '../helpers/date';

/** 一覧レスポンスに含まれる映画IDの集合を返す */
function movieIdsOf(json: { data: { movies: { id: number }[] } }): number[] {
  return json.data.movies.map((movie) => movie.id);
}

test.describe('地域（原語）フィルタ', () => {
  // fullyParallel ではファイル内のテストが複数ワーカーに分散し、
  // 先に終わったワーカーの afterAll がシードを削除してしまうため、
  // 同一ワーカーで順に実行する
  test.describe.configure({ mode: 'default' });

  // 一覧の日付範囲に確実に収まるよう、本日の日付を使う
  const releaseDate = localDateFromToday();

  /** シードした作品だけに絞り込んだ一覧APIのパス */
  const listPath = (query = '') =>
    `/api/movies?release_type=theatrical&time_frame=upcoming` +
    `&release_date_gte=${releaseDate}&release_date_lte=${releaseDate}${query}`;

  test.beforeAll(async () => {
    await seedRegionFilterMovies(releaseDate);
  });

  test.afterAll(async () => {
    await cleanupRegionFilterMovies();
  });

  test('既定では韓国・タイ/インドの作品が一覧に出ない', async ({ request }) => {
    const response = await request.get(listPath());

    expect(response.status()).toBe(200);
    const ids = movieIdsOf(await response.json());
    expect(ids).not.toContain(REGION_FILTER_MOVIE_IDS.KOREAN);
    expect(ids).not.toContain(REGION_FILTER_MOVIE_IDS.TAMIL);
  });

  test('既定でも日本語作品は一覧に出る', async ({ request }) => {
    const response = await request.get(listPath());

    expect(movieIdsOf(await response.json())).toContain(
      REGION_FILTER_MOVIE_IDS.JAPANESE,
    );
  });

  test('原語が未取得（NULL）の作品は既定でも一覧に出る', async ({
    request,
  }) => {
    // バックフィル未完了の作品を消さないための仕様。NULL は「未取得」であって
    // 「対象地域」ではない
    const response = await request.get(listPath());

    expect(movieIdsOf(await response.json())).toContain(
      REGION_FILTER_MOVIE_IDS.UNKNOWN_LANGUAGE,
    );
  });

  test('韓国を含めると韓国語作品が出る（タイ/インドは出ない）', async ({
    request,
  }) => {
    const response = await request.get(listPath('&include_regions=korea'));

    const ids = movieIdsOf(await response.json());
    expect(ids).toContain(REGION_FILTER_MOVIE_IDS.KOREAN);
    expect(ids).not.toContain(REGION_FILTER_MOVIE_IDS.TAMIL);
  });

  test('タイ・インドを含めるとタミル語作品が出る', async ({ request }) => {
    const response = await request.get(
      listPath('&include_regions=thai_indian'),
    );

    expect(movieIdsOf(await response.json())).toContain(
      REGION_FILTER_MOVIE_IDS.TAMIL,
    );
  });

  test('全地域を含めると対象作品がすべて出る', async ({ request }) => {
    const response = await request.get(
      listPath('&include_regions=korea,chinese,thai_indian'),
    );

    const ids = movieIdsOf(await response.json());
    expect(ids).toEqual(
      expect.arrayContaining([
        REGION_FILTER_MOVIE_IDS.KOREAN,
        REGION_FILTER_MOVIE_IDS.TAMIL,
        REGION_FILTER_MOVIE_IDS.JAPANESE,
      ]),
    );
  });

  test('未知の地域キーは400で拒否する', async ({ request }) => {
    const response = await request.get(listPath('&include_regions=atlantis'));

    expect(response.status()).toBe(400);
  });

  test.describe('検索条件のUI', () => {
    // goto＋一覧の描画待ち＋モーダル操作と重く、並列負荷下で30秒予算を
    // 超過しうるためタイムアウトを延長する（filterPersistence.spec.ts と同じ）
    test.describe.configure({ timeout: 60000 });

    // 認証済みで走るため、適用したフィルタが saved_filters に残り
    // 後続テストへ漏れる。各テストの前に消す
    test.beforeEach(async ({ request }) => {
      await resetFilters(request);
    });

    /** 一覧の描画を待ってからフィルターモーダルを開く */
    async function openFilterModal(page: import('@playwright/test').Page) {
      await page
        .locator('[class*="movie_tile"]')
        .first()
        .or(page.getByText(/映画が見つかりませんでした/))
        .waitFor({ timeout: 15000 });

      await page.getByRole('button', { name: /フィルター/ }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      return dialog;
    }

    test('地域を選んで適用するとURLに反映される', async ({ page }) => {
      await page.goto('/movies/upcoming');
      const dialog = await openFilterModal(page);

      // 入力は視覚的に隠してあり、利用者はラベルをクリックして切り替える
      await dialog
        .getByRole('group', { name: '地域フィルタ' })
        .getByText('韓国', { exact: true })
        .click();
      await expect(
        dialog.getByRole('checkbox', { name: '韓国' }),
      ).toBeChecked();

      await dialog.getByRole('button', { name: '適用' }).click();

      await expect(page).toHaveURL(/include_regions=korea/);
    });

    test('リロードしても選んだ地域が保持される', async ({ page }) => {
      await page.goto('/movies/upcoming?include_regions=korea');
      const dialog = await openFilterModal(page);

      await expect(
        dialog.getByRole('checkbox', { name: '韓国' }),
      ).toBeChecked();
      await expect(
        dialog.getByRole('checkbox', { name: '中華圏' }),
      ).not.toBeChecked();
    });

    // 「既定ではどの地域も未選択」はここでは検証しない。E2Eは3ブラウザが
    // 同じ共有ユーザーで並列実行されるため、別プロジェクトのテストが適用した
    // saved_filters を読んでしまい構造的に不安定になる。
    // 既定の挙動は上の一覧APIのテストと filterModal の単体テストで担保する。

    test('キーボードだけで地域の選択を切り替えられる', async ({ page }) => {
      await page.goto('/movies/upcoming');
      const dialog = await openFilterModal(page);

      const korea = dialog.getByRole('checkbox', { name: '韓国' });
      // 共有ユーザーの保存済みフィルタが残りうるため、絶対値ではなく
      // 「操作で反転すること」を見る
      const before = await korea.isChecked();

      await korea.focus();
      await page.keyboard.press('Space');

      await expect(korea).toBeChecked({ checked: !before });
    });

    test('配信タブでも地域セクションが使える', async ({ page }) => {
      await page.goto('/movies/upcoming?release_type=streaming');
      const dialog = await openFilterModal(page);

      await expect(
        dialog.getByRole('checkbox', { name: 'タイ・インド' }),
      ).toBeVisible();
    });
  });
});
