/**
 * キーボードのみでの操作に関するE2Eテスト
 *
 * axe-core では検出できない「実際に操作できるか」を担保する。
 */

import { test, expect } from '@playwright/test';

import { ARIA_LABELS } from '@/constants';

import { MOVIE_ID, mockMovieDetail } from '../helpers/movieDetail';

import { gotoWithTheme } from './helpers';

/** 予告編の検証用。実データに依存させない */
const TRAILER_VIDEO = {
  id: 'v1',
  iso_639_1: 'ja',
  iso_3166_1: 'JP',
  key: 'dQw4w9WgXcQ',
  name: 'E2E予告編',
  site: 'YouTube',
  size: 1080,
  type: 'Trailer',
  official: true,
  published_at: '2026-01-01T00:00:00.000Z',
} as const;

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

  /**
   * 予告編ダイアログからの脱出（#1092）
   *
   * ⚠️ **ここだけ Escape を使わない。** 予告編は別オリジンの iframe
   * （youtube-nocookie.com）で、プレイヤーにフォーカスが移ると keydown は
   * その iframe の document に入り、Radix の escape 検知（本体側の document）
   * に届かない。別オリジンである以上、本体側からキー入力は観測できない。
   *
   * 実測（本番ビルド / chromium）:
   *
   *     フォーカス = 閉じるボタン → Escape で閉じる
   *     フォーカス = iframe       → Escape では閉じない
   *
   * したがって**保証できる脱出路は Tab 移動と Enter**。閉じるボタンは
   * ダイアログ内で最初のフォーカス可能要素なので、プレイヤーから
   * Shift+Tab 1回で戻れる。ここが壊れると、プレイヤーを操作した
   * キーボード利用者の出口が無くなる
   */
  test('予告編はプレイヤーにフォーカスがあってもキーボードで閉じられる', async ({
    page,
  }) => {
    await mockMovieDetail(page, {
      backdrop_path: '/e2e-backdrop.jpg',
      videos: { results: [TRAILER_VIDEO] },
    });

    await gotoWithTheme(
      page,
      `/movies/now-showing?movie_id=${MOVIE_ID}`,
      'light',
    );

    const detail = page.getByRole('dialog');
    await expect(detail).toBeVisible({ timeout: 20000 });

    await detail
      .getByRole('button', { name: ARIA_LABELS.PLAY_TRAILER })
      .click();
    const videoDialog = page.getByRole('dialog', { name: /の予告動画$/ });
    await expect(videoDialog).toBeVisible({ timeout: 15000 });

    // プレイヤーを操作した状態を作る
    await videoDialog
      .locator('iframe')
      .first()
      .evaluate((el) => (el as HTMLIFrameElement).focus());

    // Shift+Tab 1回で閉じるボタンへ戻れること（ここが肝）
    await page.keyboard.press('Shift+Tab');
    await expect(
      videoDialog.getByRole('button', { name: ARIA_LABELS.CLOSE }),
    ).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(videoDialog).toHaveCount(0);
    // 下の映画詳細は開いたまま
    await expect(detail).toBeVisible();
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
