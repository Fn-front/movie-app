/**
 * 入れ子オーバーレイ E2Eテスト
 *
 * 映画詳細モーダルの上に予告動画ダイアログが重なる。内側を閉じたときに
 * 外側まで閉じてはいけない（#1041）。
 *
 * 幅に依存しない挙動なので、既定のデスクトップ幅で確認する。
 * 予告動画の有無は TMDb のデータ次第なので、詳細APIをモックして
 * 必ず存在させる（実データ依存にすると無言スキップで回帰を見逃す）。
 */

import type { Page } from '@playwright/test';

import { ARIA_LABELS } from '@/constants';
import { mockMovieDetail } from '../helpers/movieDetail';
import { test, expect } from '../fixtures/auth';

/** DOM 上のダイアログ。Radix が背面に aria-hidden を付けるため role では数えられない */
const DIALOG_SELECTOR = '[role="dialog"]';

/** `selectTrailerVideos` の絞り込み（YouTube かつ Trailer/Teaser）を満たす動画 */
const TRAILER = {
  id: 'e2e-trailer-1',
  key: 'dQw4w9WgXcQ',
  name: 'E2E 予告編',
  site: 'YouTube',
  type: 'Trailer',
  official: true,
  iso_639_1: 'ja',
  iso_3166_1: 'JP',
  size: 1080,
  published_at: '2026-01-01T00:00:00.000Z',
};

/** 詳細モーダルを開き、予告動画も開いて入れ子にする */
async function openNestedOverlays(page: Page): Promise<void> {
  // 再生ボタンは背景画像のブロックの中にあるため、backdrop_path が無いと
  // 予告動画があっても描画されない（movieDetailContent.tsx:270-290）
  await mockMovieDetail(page, {
    backdrop_path: '/e2eBackdrop.jpg',
    videos: { results: [TRAILER] },
  } as never);

  await page.goto('/movies/now-showing');

  const tile = page
    .locator('button[class*="movie_tile__title_button"]')
    .first();
  await expect(tile).toBeVisible({ timeout: 15000 });
  await tile.click();

  await expect(page.locator(DIALOG_SELECTOR)).toHaveCount(1);

  await page.getByRole('button', { name: ARIA_LABELS.PLAY_TRAILER }).click();
  await expect(page.locator(DIALOG_SELECTOR)).toHaveCount(2);
}

/**
 * 内側を閉じた後、外側が残り続けることを確認する。
 *
 * 回帰時は 2 → 1 → 0 と遷移するため、件数を1回見るだけでは途中の 1 を
 * 拾って誤って成功する。落ち着いてから再確認する。
 */
async function expectOnlyOuterRemains(page: Page): Promise<void> {
  const dialogs = page.locator(DIALOG_SELECTOR);
  await expect(dialogs).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(dialogs).toHaveCount(1);
}

test.describe('入れ子オーバーレイ', () => {
  test('予告動画を Esc で閉じても映画詳細は残る', async ({
    authenticatedPage: page,
  }) => {
    await openNestedOverlays(page);

    await page.keyboard.press('Escape');

    await expectOnlyOuterRemains(page);
  });

  test('予告動画を × で閉じても映画詳細は残る', async ({
    authenticatedPage: page,
  }) => {
    await openNestedOverlays(page);

    // 予告動画ダイアログの閉じるボタン（最前面のもの）
    await page
      .locator(DIALOG_SELECTOR)
      .last()
      .getByRole('button', { name: ARIA_LABELS.CLOSE })
      .click();

    await expectOnlyOuterRemains(page);
  });

  test('予告動画を開いた状態で戻ると予告動画だけが閉じる', async ({
    authenticatedPage: page,
  }) => {
    await openNestedOverlays(page);

    await page.goBack();

    await expectOnlyOuterRemains(page);
    await expect(page).toHaveURL(/\/movies\/now-showing$/);
  });

  test('入れ子を閉じた後、戻るで前のページまで出られる', async ({
    authenticatedPage: page,
  }) => {
    // 畳み漏れ（ゴーストエントリ）があると、ここで空振りして
    // 前のページへ出られない
    await page.goto('/movies/upcoming');
    await openNestedOverlays(page);

    await page.keyboard.press('Escape');
    await expectOnlyOuterRemains(page);

    await page
      .locator(DIALOG_SELECTOR)
      .first()
      .getByRole('button', { name: ARIA_LABELS.CLOSE })
      .click();
    await expect(page.locator(DIALOG_SELECTOR)).toHaveCount(0);

    await page.goBack();

    await expect(page).toHaveURL(/\/movies\/upcoming$/);
  });
});
