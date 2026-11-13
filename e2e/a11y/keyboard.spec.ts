/**
 * キーボードのみでの操作に関するE2Eテスト
 *
 * axe-core では検出できない「実際に操作できるか」を担保する。
 */

import { test, expect } from '@playwright/test';

import { ARIA_LABELS } from '@/constants';

import {
  MOVIE_ID,
  mockMovieDetail,
  stubTrailerEmbed,
} from '../helpers/movieDetail';

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

/** 2本目。1件だけだと「2本目以降は戻る距離が伸びる」が隠れる */
const SECOND_TRAILER_VIDEO = {
  ...TRAILER_VIDEO,
  id: 'v2',
  key: 'oHg5SJYRHA0',
  name: 'E2E予告編2',
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
   * したがって**保証できる脱出路は Tab 移動と Enter**。
   *
   * ## ⚠️ プレイヤーの中からは検証できない（#1100）
   *
   * 以前はここで `iframe.focus()` してから Tab を2回送っていたが、
   * **断続的に落ちた**（`--workers=1 --repeat-each=5` で5本中5本）。
   * 原因を実測したところ、フォーカスが iframe に入ると**Tab を何回送っても
   * 親へ戻らない**:
   *
   *     iframe.focus() 直後 → IFRAME
   *     Tab 1回目           → IFRAME
   *     Tab 2回目           → IFRAME
   *     Tab 3回目           → IFRAME
   *
   * 親へ送った Tab は別プロセスの iframe（OOPIF）側で処理され、スタブは
   * フォーカス可能な要素を持たないのでそこに留まる。たまに通っていたのは、
   * `focus()` の委譲がまだ子へ伝わる前に Tab が届いた場合だけ。
   * **キー入力が観測できないのと同じ構造的な制約**で、Escape と同じ。
   *
   * ## 代わりに何を固定するか
   *
   * 親ドキュメント側で保証できるのは**DOM 順と回り込み**の2つ。
   *
   * DOM は `閉じる → iframe1 → YouTubeリンク1 → iframe2 → YouTubeリンク2 → …`
   * の順で、動画は最大5件並ぶ（`TRAILER_DISPLAY_LIMIT`）。
   * Radix の `FocusScope` は `loop: true`（`@radix-ui/react-dialog`）なので、
   * **最後の YouTube リンクから Tab 1回で先頭＝閉じるボタンへ戻る**。
   * 動画が何件でもこの回数は変わらない（最後尾だけを見ているため）。
   *
   * ここが壊れる＝閉じるボタンを後ろへ動かすと、プレイヤーの脇にある
   * リンクまで来たキーボード利用者の出口が遠くなる。
   */
  test('予告編は最後尾から Tab 1回で閉じるボタンへ戻れる', async ({
    page,
    browserName,
  }) => {
    // WebKit は既定でボタンもリンクも Tab 順に含めない（このファイル冒頭の
    // 実測コメント）。Tab 移動そのものを見るテストなので、ブラウザ側の設定差で落ちる
    test.skip(
      browserName === 'webkit',
      'WebKit は既定で button / a を Tab 順に含めない（冒頭の実測コメント参照）',
    );

    // 実物の埋め込みを読ませるとプレイヤーがフォーカスを奪い、
    // どの要素にフォーカスがあるかが環境依存になる（#1093）
    await stubTrailerEmbed(page);
    await mockMovieDetail(page, {
      backdrop_path: '/e2e-backdrop.jpg',
      // 2件入れる。1件だと「最後尾から」という条件が自明になり、
      // 2本目以降で DOM 順が崩れても気づけない
      videos: { results: [TRAILER_VIDEO, SECOND_TRAILER_VIDEO] },
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

    const closeButton = videoDialog.getByRole('button', {
      name: ARIA_LABELS.CLOSE,
    });

    // 1. 閉じるボタンが先頭＝開いた直後にフォーカスされる。
    //    これが成り立たないと、下の「回り込んで戻る」も意味を失う
    await expect(closeButton).toBeFocused();

    // 2. 親ドキュメント上の最後のフォーカス可能要素は、最後の動画の
    //    「YouTubeで見る」リンク。動画の件数ぶん並ぶ
    const youtubeLinks = videoDialog.getByRole('link');
    await expect(youtubeLinks).toHaveCount(2);
    await youtubeLinks.last().focus();

    // 3. そこから Tab 1回で先頭へ回り込む（FocusScope の loop）
    await page.keyboard.press('Tab');
    await expect(closeButton).toBeFocused();

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
