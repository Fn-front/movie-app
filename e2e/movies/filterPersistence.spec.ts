/**
 * フィルター条件の永続化 E2Eテスト
 *
 * - 認証済み: saved_filters によるリロード後の復元
 * - 未認証: URLクエリによるページ遷移後の復元（Issue #567）
 */

import { test, expect } from '../fixtures/auth';
import { resetFilters } from '../helpers/api';

test.describe('フィルター条件がリロード後も保持される', () => {
  // goto×2＋フィルタ操作＋PUT/GET待ち＋reload と重く、並列負荷下で30秒予算を
  // 超過しうるためタイムアウトを延長する
  test.describe.configure({ timeout: 60000 });

  test.beforeEach(async ({ request }) => {
    await resetFilters(request);
  });

  test('リバイバル除外 → リロード → APIレスポンスと復元を確認', async ({
    page,
  }) => {
    await page.goto('/movies/upcoming');
    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // フィルターモーダルを開いてリバイバル除外を設定
    await page.getByRole('button', { name: /フィルター/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByText('リバイバル除外').click();

    // 適用してPUTリクエストの内容を確認
    const putPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/filters') && res.request().method() === 'PUT',
      { timeout: 30000 },
    );
    await dialog.getByRole('button', { name: '適用' }).click();
    const putResponse = await putPromise;
    const putBody = putResponse.request().postDataJSON();

    // PUTにis_revival: falseが含まれていることを確認
    expect(putBody.is_revival).toBe(false);

    // リロードしてGETレスポンスを確認
    const getPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/filters') &&
        res.request().method() === 'GET' &&
        res.status() === 200,
      { timeout: 30000 },
    );
    await page.reload();
    const getResponse = await getPromise;
    const getBody = await getResponse.json();

    // GETにis_revival: falseが含まれていることを確認
    expect(getBody.data.filter_conditions.is_revival).toBe(false);

    // 映画読み込み待ち
    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // フィルターモーダルを開いてUIに反映されているか確認
    await page.getByRole('button', { name: /フィルター/ }).click();
    const dialogAfter = page.getByRole('dialog');
    await expect(dialogAfter).toBeVisible();
    await expect(
      dialogAfter.locator('input[name="revival"][value="false"]'),
    ).toBeChecked();
  });
});

test.describe('未認証でもフィルターがページ遷移後に保持される', () => {
  // 一覧の読み込み・遷移・復帰を含むため30秒予算を超過しうる
  test.describe.configure({ timeout: 60000 });

  // storageStateを空にして未認証状態にする
  test.use({ storageState: { cookies: [], origins: [] } });

  test('並び順を変更 → 他ページへ遷移 → ブラウザバックで復元される', async ({
    page,
  }) => {
    await page.goto('/movies/now-showing');
    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // 並び順を「人気順」に変更
    const sortSelect = page.getByRole('combobox');
    await sortSelect.click();
    await page.getByRole('option', { name: '人気順' }).click();

    // URLに反映される（未認証でも復元手段が残る）
    await expect(page).toHaveURL(/sort_by=popularity/);

    // 他ページへ遷移してからブラウザバック
    await page.getByRole('link', { name: '公開予定' }).first().click();
    await expect(page).toHaveURL(/\/movies\/upcoming/);

    await page.goBack();

    await expect(page).toHaveURL(/sort_by=popularity/);
    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // 初期レンダリングからデフォルト値を経由せず復元されている
    await expect(sortSelect).toContainText('人気順');
  });

  test('フィルター変更で履歴が積まれない（1回のバックで前ページへ戻る）', async ({
    page,
  }) => {
    await page.goto('/movies/upcoming');
    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    await page.getByRole('link', { name: '公開中' }).first().click();
    await expect(page).toHaveURL(/\/movies\/now-showing/);

    // 並び順を2回変更（pushなら履歴が2段積まれる）
    const sortSelect = page.getByRole('combobox');
    await sortSelect.click();
    await page.getByRole('option', { name: '人気順' }).click();
    await expect(page).toHaveURL(/sort_by=popularity/);

    await sortSelect.click();
    await page.getByRole('option', { name: '評価順' }).click();
    await expect(page).toHaveURL(/sort_by=vote_average/);

    // replace のため1回のバックで前ページへ戻る
    await page.goBack();
    await expect(page).toHaveURL(/\/movies\/upcoming/);
  });

  test('ナビリンク経由で戻ってもフィルターが保持される（localStorage）', async ({
    page,
  }) => {
    await page.goto('/movies/now-showing');
    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // 並び順を「人気順」に変更
    const sortSelect = page.getByRole('combobox');
    await sortSelect.click();
    await page.getByRole('option', { name: '人気順' }).click();
    await expect(page).toHaveURL(/sort_by=popularity/);

    // サイドナビのリンクで往復する（URLにクエリが付かない経路）
    await page.getByRole('link', { name: '公開予定' }).first().click();
    await expect(page).toHaveURL(/\/movies\/upcoming$/);

    await page.getByRole('link', { name: '公開中' }).first().click();
    await expect(page).toHaveURL(/\/movies\/now-showing$/);

    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // クエリは無いが localStorage から復元される
    await expect(sortSelect).toContainText('人気順');
  });

  test('不正なクエリパラメータでもエラーにならずデフォルトで表示される', async ({
    page,
  }) => {
    await page.goto(
      '/movies/now-showing?sort_by=invalid&release_type=tv&genre_ids=abc&date_range_gte=2026%2F01%2F01&is_revival=maybe',
    );

    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // 不正値はフォールバックされ、既定の並び順が表示される
    await expect(page.getByRole('combobox')).toContainText('公開日順');
  });
});
