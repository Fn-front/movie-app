/**
 * 予告編ダイアログの CSP E2Eテスト（#973）
 *
 * ## このテストが守るもの
 *
 * **予告編のサムネイル（`i.ytimg.com`）を本体ドキュメントから読まないこと。**
 *
 * いまは読んでいない。プレイヤーのサムネイルは別オリジンの iframe
 * （`youtube-nocookie.com`）の中で読まれ、本サイトの CSP は適用されない。
 * リポジトリのソースに `ytimg` の参照も1件も無い。
 *
 * ⚠️ **放っておくと壊れる種類の性質**なので固定する。予告編を
 * 「サムネイル → クリックで iframe を読む」facade パターンに変える案が
 * PR #1094 の引き継ぎメモにあり、素直に実装すると `i.ytimg.com` の
 * `<img>` を本体ドキュメントへ置くことになる。そうなると `img-src` で
 * 遮断され、**画像が出ないうえに `/api/csp-report` へ違反が流れ続ける**。
 *
 * ## #973 の前提は再現しなかった
 *
 * Issue は「メインフレームからも要求されていて `img-src` 違反が出る」と
 * していたが、本番ビルド・dev の両方で**1件も再現しなかった**。
 * 詳細は Issue のコメントに測定結果を残している。
 *
 * ## 計測方法
 *
 * `securitypolicyviolation` イベントだけを見る。コンソールや
 * `request.frame()` では iframe の分と区別できない（`helpers/csp.ts` 参照）。
 */

import { expect, test } from '@playwright/test';

import { ARIA_LABELS } from '@/constants';

import { collectCspViolations, readCspViolations } from '../helpers/csp';
import { MOVIE_ID, mockMovieDetail } from '../helpers/movieDetail';

/**
 * 実在する動画キーを使う。**埋め込みをスタブしない**のがこのテストの要点で、
 * 実物を読ませないと YouTube 側がどこから何を要求するかを検証できない
 */
const TRAILER_VIDEOS = [
  {
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
  },
  {
    id: 'v2',
    iso_639_1: 'ja',
    iso_3166_1: 'JP',
    key: 'oHg5SJYRHA0',
    name: 'E2E予告編2',
    site: 'YouTube',
    size: 1080,
    type: 'Trailer',
    official: true,
    published_at: '2026-01-01T00:00:00.000Z',
  },
] as const;

test.describe('予告編ダイアログの CSP', () => {
  test.describe.configure({ timeout: 120000 });

  test.use({ storageState: { cookies: [], origins: [] } });

  test('予告編を開いても img-src の違反が出ない', async ({ page }) => {
    await collectCspViolations(page);

    await mockMovieDetail(page, {
      backdrop_path: '/e2e-backdrop.jpg',
      videos: { results: [...TRAILER_VIDEOS] },
    });

    await page.goto(`/movies/now-showing?movie_id=${MOVIE_ID}`);

    const detail = page.getByRole('dialog');
    await expect(detail).toBeVisible({ timeout: 30000 });

    await detail
      .getByRole('button', { name: ARIA_LABELS.PLAY_TRAILER })
      .click();

    const videoDialog = page.getByRole('dialog', { name: /の予告動画$/ });
    await expect(videoDialog).toBeVisible({ timeout: 30000 });

    // プレイヤーが読み込まれ、サムネイルを要求するまで待つ。
    // iframe の中身は別オリジンなので load を直接は待てない
    await expect(videoDialog.locator('iframe')).toHaveCount(
      TRAILER_VIDEOS.length,
    );
    await page.waitForTimeout(8000);

    const violations = await readCspViolations(page);
    const imageViolations = violations.filter(
      (v) => v.effectiveDirective === 'img-src',
    );

    expect(
      imageViolations,
      '本体ドキュメントから画像が遮断された。予告編のサムネイルを ' +
        '本体側で読むように変えたなら、cspDirectives.mjs の img-src に ' +
        'https://i.ytimg.com を足すこと（配信専用ホストなので追跡面は広がらない）:\n' +
        JSON.stringify(imageViolations, null, 2),
    ).toEqual([]);
  });
});
