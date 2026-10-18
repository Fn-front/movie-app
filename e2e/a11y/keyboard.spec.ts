/**
 * キーボードのみでの操作に関するE2Eテスト
 *
 * axe-core では検出できない「実際に操作できるか」を担保する。
 */

import { test, expect } from '@playwright/test';

import { gotoWithTheme } from './helpers';

test.describe('キーボード操作', () => {
  test.describe.configure({ timeout: 60000 });

  test.use({ storageState: { cookies: [], origins: [] } });

  test('スキップリンクで本文へ移動できる', async ({ page }) => {
    await gotoWithTheme(page, '/movies/now-showing', 'light');

    // 1回目の Tab でスキップリンクにフォーカスが当たる
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: '本文へ移動' });
    await expect(skipLink).toBeFocused();

    await page.keyboard.press('Enter');

    // main にフォーカスが移る
    await expect(page.locator('main')).toBeFocused();

    // 次の Tab は本文内の要素に進む
    await page.keyboard.press('Tab');
    await expect(page.locator('main :focus')).toHaveCount(1);
  });

  test('リリースタイプのタブを矢印キーで切り替えられる', async ({ page }) => {
    await gotoWithTheme(page, '/movies/now-showing', 'light');

    const theatrical = page.getByRole('tab', { name: '劇場公開' });
    const streaming = page.getByRole('tab', { name: 'ストリーミング' });

    await theatrical.click();
    await expect(theatrical).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowRight');
    await expect(streaming).toHaveAttribute('aria-selected', 'true');

    // 選択中タブの aria-controls が実在する tabpanel を指す
    const controls = await streaming.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    await expect(page.locator(`#${controls}`)).toHaveAttribute(
      'role',
      'tabpanel',
    );
  });

  test('映画タイルの詳細・操作ボタンがそれぞれ独立して到達できる', async ({
    page,
  }) => {
    await gotoWithTheme(page, '/movies/now-showing', 'light');

    const firstTile = page.locator('[class*="c_movie_tile"]').first();
    await expect(firstTile).toBeVisible();

    const title = await firstTile.locator('h1,h2,h3,h4').first().innerText();

    // タイトル（詳細を開くボタン）と操作ボタンが別々の button になっている
    const detailButton = page.getByRole('button', { name: title.trim() });
    await expect(detailButton).toBeVisible();

    const watchlistButton = firstTile.getByRole('button', {
      name: /ウォッチリスト/,
    });
    await expect(watchlistButton).toBeVisible();

    // 詳細ボタンは操作ボタンを含まない（入れ子になっていない）
    await expect(
      detailButton.getByRole('button', { name: /ウォッチリスト/ }),
    ).toHaveCount(0);
  });

  test('モーダルを閉じるとフォーカスがトリガーへ戻る', async ({ page }) => {
    await gotoWithTheme(page, '/movies/now-showing', 'light');

    const trigger = page.getByRole('link', { name: 'お気に入り' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await expect(trigger).toBeFocused();
  });
});
