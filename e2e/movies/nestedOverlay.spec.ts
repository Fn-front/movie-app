/**
 * 入れ子オーバーレイ E2Eテスト
 *
 * 映画詳細モーダルの上に予告動画ダイアログが重なる。内側を閉じたときに
 * 外側まで閉じてはいけない（#1039 と同じ日に入った #1026 の回帰）。
 *
 * 幅に依存しない挙動なので、既定のデスクトップ幅で確認する。
 */

import type { Page } from '@playwright/test';

import { ARIA_LABELS } from '@/constants';
import { test, expect } from '../fixtures/auth';

/** 予告動画を持つ作品の詳細モーダルを開く。見つからなければ false */
async function openDetailWithTrailer(page: Page): Promise<boolean> {
  await page.goto('/movies/now-showing');

  const tiles = page.locator('button[class*="movie_tile__title_button"]');
  await expect(tiles.first()).toBeVisible({ timeout: 15000 });

  const count = Math.min(await tiles.count(), 6);

  for (let index = 0; index < count; index += 1) {
    await tiles.nth(index).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // 予告動画の有無は詳細APIの応答後に決まるので、待ってから判定する
    const play = dialog.getByRole('button', { name: ARIA_LABELS.PLAY_TRAILER });
    const hasTrailer = await play
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    if (hasTrailer) {
      return true;
    }

    await dialog.getByRole('button', { name: ARIA_LABELS.CLOSE }).click();
    await expect(dialog).toBeHidden();
  }

  return false;
}

test.describe('入れ子オーバーレイ', () => {
  test('予告動画を閉じても映画詳細は開いたままになる', async ({
    authenticatedPage: page,
  }) => {
    const found = await openDetailWithTrailer(page);
    test.skip(!found, '予告動画を持つ作品が無いためスキップ');

    // 予告動画を開くと Radix が背面へ aria-hidden を付けるため、
    // getByRole では数えられない。DOM で数える
    const dialogs = page.locator('[role="dialog"]');
    await page.getByRole('button', { name: ARIA_LABELS.PLAY_TRAILER }).click();
    await expect(dialogs).toHaveCount(2);

    // 内側だけを閉じる
    await page.keyboard.press('Escape');

    // 外側（映画詳細）は残る
    await expect(dialogs).toHaveCount(1);
  });

  test('予告動画を開いた状態で戻ると予告動画だけが閉じる', async ({
    authenticatedPage: page,
  }) => {
    const found = await openDetailWithTrailer(page);
    test.skip(!found, '予告動画を持つ作品が無いためスキップ');

    // 予告動画を開くと Radix が背面へ aria-hidden を付けるため、
    // getByRole では数えられない。DOM で数える
    const dialogs = page.locator('[role="dialog"]');
    await page.getByRole('button', { name: ARIA_LABELS.PLAY_TRAILER }).click();
    await expect(dialogs).toHaveCount(2);

    await page.goBack();

    await expect(dialogs).toHaveCount(1);
    await expect(page).toHaveURL(/\/movies\/now-showing$/);
  });
});
