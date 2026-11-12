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

  test('スキップリンクで本文へ移動できる', async ({ page, browserName }) => {
    await gotoWithTheme(page, '/movies/now-showing', 'light');

    const skipLink = page.getByRole('link', { name: '本文へ移動' });

    // WebKit は既定でリンクもボタンも Tab 順に含めない（Safari の
    // 「フルキーボードアクセス」が無効なときの挙動）。Tab を15回送っても
    // 当たるのは input だけで、a と button は0件だった。
    // ブラウザ側の設定であってアプリの性質ではないため、Tab 順そのものの
    // 確認は他のブラウザに任せ、WebKit では focus() で代替する。
    if (browserName === 'webkit') {
      await skipLink.focus();
    } else {
      // 1回目の Tab でスキップリンクにフォーカスが当たる
      await page.keyboard.press('Tab');
    }
    await expect(skipLink).toBeFocused();

    await page.keyboard.press('Enter');

    // main にフォーカスが移る。ここはどのブラウザでも満たすべき性質で、
    // 崩れるとスキップリンクが機能していないことになる
    await expect(page.locator('main')).toBeFocused();

    // 次の Tab は本文内の要素に進む。
    // 本文内の到達先もリンク・ボタンなので、WebKit では同じ理由で検証できない
    if (browserName !== 'webkit') {
      await page.keyboard.press('Tab');
      await expect(page.locator('main :focus')).toHaveCount(1);
    }
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

  test('映画タイルの詳細リンク・操作ボタンがそれぞれ独立して到達できる', async ({
    page,
  }) => {
    await gotoWithTheme(page, '/movies/now-showing', 'light');

    const firstTile = page.locator('[class*="c_movie_tile"]').first();
    await expect(firstTile).toBeVisible();

    const title = await firstTile.locator('h1,h2,h3,h4').first().innerText();

    // タイトル（詳細へのリンク・#1033）と操作ボタンが別々の要素になっている
    const detailLink = page.getByRole('link', { name: title.trim() });
    await expect(detailLink).toBeVisible();
    await expect(detailLink).toHaveAttribute('href', /^\/movies\/\d+$/);

    const watchlistButton = firstTile.getByRole('button', {
      name: /ウォッチリスト/,
    });
    await expect(watchlistButton).toBeVisible();

    // 詳細リンクは操作ボタンを含まない（入れ子になっていない）
    await expect(
      detailLink.getByRole('button', { name: /ウォッチリスト/ }),
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
