/**
 * 検索 E2Eテスト（公開・未認証）
 *
 * ユーザーストーリー網羅:
 * - 正常系: ヘッダーから検索 → 結果一覧表示
 * - 詳細遷移: 検索結果クリック → 詳細モーダル
 * - 空状態: 該当なし → 「検索結果が見つかりませんでした」
 */

import { test, expect } from '@playwright/test';

test.describe('検索（公開）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('ヘッダーから検索すると結果一覧が表示される', async ({ page }) => {
    await page.goto('/');

    // 検索ページは本文側にも同じラベルの検索欄を持つため、ヘッダーに絞る（#1016）
    const headerSearch = page.getByRole('banner').getByLabel('映画を検索');
    await headerSearch.fill('バットマン');
    await headerSearch.press('Enter');

    await page.waitForURL(/\/search\?query=/);
    await expect(
      page.getByRole('heading', { name: '「バットマン」の検索結果' }),
    ).toBeVisible();
    await expect(page.locator('[class*="movie_tile"]').first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('検索結果をクリックすると詳細モーダルが開く', async ({ page }) => {
    await page.goto('/search?query=バットマン');

    const firstTile = page
      .locator(
        '[class*="c_card"][class*="c_movie_tile"]:not([class*="c_movie_tile_skeleton"])',
      )
      .first();
    await firstTile.waitFor({ timeout: 15000 });
    await firstTile.click();

    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('該当なしのキーワードで空状態が表示される', async ({ page }) => {
    await page.goto('/search?query=zzzqqxyz存在しない映画123');

    await expect(page.getByText('検索結果が見つかりませんでした')).toBeVisible({
      timeout: 15000,
    });
  });

  /**
   * 検索前と0件は別の状態（#1024）
   *
   * どちらも結果は空なので、**0件側の文言が出ていないこと**まで見ないと
   * 区別できているか分からない
   */
  test('クエリなしで開くと0件ではなく入力を促す文言が出る', async ({
    page,
  }) => {
    await page.goto('/search');

    await expect(page.getByText('キーワードを入力してください')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('検索結果が見つかりませんでした')).toHaveCount(
      0,
    );
  });

  /**
   * キーワード無し＋フィルターのみの検索（#1024 のレビュー指摘）
   *
   * この画面は**キーワードが無くても検索が成立する**。フィルターモーダルの
   * 「公開年で検索する」（`filterModal.tsx` の `pastMoviesSearchHref`）が
   * まさにこの形で着地する。「まだ検索していない」をキーワードの有無で
   * 判定すると、ここで返ってきた結果が丸ごと隠れる
   */
  test('公開年だけでも検索結果が出る（入力を促す文言は出ない）', async ({
    page,
  }) => {
    const year = new Date().getFullYear();
    await page.goto(`/search?year=${year}`);

    // 結果の有無は TMDb 次第なので、どちらでも「検索した画面」であることを見る
    await expect(
      page
        .getByText('件の検索結果')
        .or(page.getByText('検索結果が見つかりませんでした')),
    ).toBeVisible({ timeout: 20000 });

    await expect(page.getByText('キーワードを入力してください')).toHaveCount(0);
  });
});
