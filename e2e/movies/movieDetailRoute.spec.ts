/**
 * 映画詳細ルート E2Eテスト（#1033）
 *
 * 映画詳細は `/movies/detail/[id]` という URL を持つ。一覧からのソフト遷移では
 * intercepting route がモーダルで重ね、直接アクセス・リロード・共有では
 * 全画面ページになる。
 *
 * 表示内容は /api/movies/:id をモックして TMDb 非依存にする。ただし
 * ページ本体（Server Component）の存在確認と `<title>` 生成だけは
 * サーバ側で TMDb を呼ぶため、実在が安定している MOVIE_ID を使う。
 */

import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';

import { movieTileDetailLinks, movieTiles } from '../helpers/locators';
import {
  MISSING_MOVIE_ID,
  MOVIE_ID,
  mockMovieDetail,
} from '../helpers/movieDetail';

/**
 * 一覧が描画されるのを待つ（TMDb由来のデータが無い run ではスキップする）
 */
const waitForList = (page: Page) =>
  movieTiles(page)
    .first()
    .waitFor({ state: 'visible', timeout: 30000 })
    .then(() => true)
    .catch(() => false);

/** 詳細の URL（/movies/detail/<数値>） */
const DETAIL_URL = /\/movies\/detail\/\d+$/;

test.describe('映画詳細ルート', () => {
  test.beforeEach(async ({ page }) => {
    await mockMovieDetail(page);
  });

  test('一覧から開くとモーダルで表示され、URLが /movies/detail/<id> になる', async ({
    page,
  }) => {
    await page.goto('/movies/now-showing');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    // 一覧はそのまま残り、上にモーダルが重なる
    await movieTileDetailLinks(page).first().click();

    await expect(page).toHaveURL(DETAIL_URL);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('dialog').getByText('詳細情報')).toBeVisible({
      timeout: 15000,
    });
  });

  test('モーダル表示中にリロードすると専用ページになる', async ({ page }) => {
    await page.goto('/movies/now-showing');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    await movieTileDetailLinks(page).first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });

    await page.reload();

    // 割り込みは効かず、同じURLが全画面ページになる
    await expect(page).toHaveURL(DETAIL_URL);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 20000,
    });
  });

  test('戻るでモーダルが閉じ、進むで再び開く', async ({ page }) => {
    await page.goto('/movies/now-showing');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    await movieTileDetailLinks(page).first().click();
    await expect(page).toHaveURL(DETAIL_URL);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });

    await page.goBack();

    // 1回で一覧へ戻る。モーダル側でも履歴を積んでいると2つ分戻って飛び越す
    await expect(page).toHaveURL(/\/movies\/now-showing$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.goForward();

    await expect(page).toHaveURL(DETAIL_URL);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
  });

  test('/movies/detail/<id> を直接開くと専用ページが全画面で表示される', async ({
    page,
  }) => {
    await page.goto(`/movies/detail/${MOVIE_ID}`);

    await expect(page.getByRole('dialog')).toHaveCount(0);
    // 作品名が h1。モーダルでは h3 なので、器が切り替わったことまで見える
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 20000,
    });
    // ヘッダー・サイドバーを持つ通常のアプリ画面として出る
    await expect(page.getByRole('banner')).toBeVisible();
  });

  test('直接アクセスでは作品名がタイトルになる', async ({ page }) => {
    await page.goto(`/movies/detail/${MOVIE_ID}`);

    await expect(page).toHaveTitle(/\| Movie App$/);
  });

  test('存在しない映画IDは404ページになる', async ({ page }) => {
    const response = await page.goto(`/movies/detail/${MISSING_MOVIE_ID}`);

    expect(response?.status()).toBe(404);
  });

  test('書式が不正な映画IDは404ページになる', async ({ page }) => {
    const response = await page.goto('/movies/detail/abc');

    expect(response?.status()).toBe(404);
  });

  /**
   * 一覧と詳細の衝突（#1033 で実際に踏んだ）
   *
   * 割り込みの一致は URL の形だけで決まるため、詳細を `/movies/[id]` に
   * 置くと `(.)movies/[id]` が `/movies/upcoming` まで横取りし、
   * **一覧を表示したまま URL だけ変わる**。`detail` を挟んでセグメント数で
   * 分けているので、リンクで行き来しても中身が入れ替わる
   */
  test('一覧ページどうしをリンクで行き来しても中身が入れ替わる', async ({
    page,
  }) => {
    await page.goto('/movies/now-showing');
    await expect(
      page.getByRole('heading', { level: 1, name: '公開中の映画' }),
    ).toBeVisible({ timeout: 20000 });

    await page.getByRole('link', { name: '公開予定' }).first().click();

    await expect(page).toHaveURL(/\/movies\/upcoming$/);
    await expect(
      page.getByRole('heading', { level: 1, name: '公開予定の映画' }),
    ).toBeVisible({ timeout: 20000 });

    await page.getByRole('link', { name: '公開中' }).first().click();

    await expect(page).toHaveURL(/\/movies\/now-showing$/);
    await expect(
      page.getByRole('heading', { level: 1, name: '公開中の映画' }),
    ).toBeVisible({ timeout: 20000 });
  });

  test('一覧ページは動的セグメントに食われない', async ({ page }) => {
    for (const path of ['/movies/now-showing', '/movies/upcoming']) {
      const response = await page.goto(path);

      expect(response?.status()).toBe(200);
      await expect(page.getByRole('tab', { name: '劇場公開' })).toBeVisible({
        timeout: 20000,
      });
    }
  });
});
