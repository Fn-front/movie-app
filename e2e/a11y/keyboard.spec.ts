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

/**
 * 2本目。
 *
 * 「最後尾から Tab 1回」が**件数によらない**ことを見るため、1件では足りない。
 * あわせて `toHaveCount(2)` が描画完了の待ちも兼ねる（1件しか出ていない瞬間に
 * `.last()` が1本目のリンクを掴むと、Tab で2本目の iframe へ進んで落ちる）
 */
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
   * したがって、**閉じるボタンかその脇のリンクまで来ていれば** Tab 移動と
   * Enter で閉じられる。プレイヤーの中からは下記のとおり扱えない。
   *
   * ## ⚠️ プレイヤーの中からは検証できない（#1100）
   *
   * 以前はここで `iframe.focus()` してから Tab を2回送っていたが、
   * **断続的に落ちた**（`--workers=1 --repeat-each=5` で5本中5本）。
   *
   * **実測した事実**（本番ビルド / chromium / 空のスタブ / Playwright 経由の
   * キー送出）。`iframe.focus()` のあと、親の `document.activeElement` は
   * Tab を3回送っても変わらなかった:
   *
   *     iframe.focus() 直後 → IFRAME
   *     Tab 1回目           → IFRAME
   *     Tab 2回目           → IFRAME
   *     Tab 3回目           → IFRAME
   *
   * ⚠️ **ここから言えるのは「親の要素へ戻らなかった」ことだけ。** フォーカスが
   * 子フレームのどこにあっても親の `activeElement` は `<iframe>` 要素を返すので、
   * 「Tab が子側で処理された」とまでは示していない。**機構は未確定**で、
   * Playwright がキーをどのフレームへ送っているか（`Input.dispatchKeyEvent` の
   * 配送先）も確かめていない。
   *
   * 分かっているのは、**この手順では安定して検証できない**ということ。
   * たまに通っていたのは `focus()` の委譲が子へ伝わる前に Tab が届いた場合
   * と思われる（これも推測）。
   *
   * ## 代わりに何を固定するか
   *
   * 親ドキュメント側で保証できるのは**DOM 順と回り込み**の2つ。
   *
   * DOM は `閉じる → iframe1 → YouTubeリンク1 → iframe2 → YouTubeリンク2 → …`
   * の順で、動画は最大5件並ぶ（`TRAILER_DISPLAY_LIMIT`）。
   * **最後の YouTube リンクから Tab 1回で先頭＝閉じるボタンへ戻る**。
   * 動画が何件でもこの回数は変わらない（最後尾だけを見ているため）。
   *
   * ### なぜ決定的なのか
   *
   * この回り込みは**ブラウザのネイティブな Tab 順ではなく Radix の JS 実装**で
   * 起きる。`FocusScope` の `handleKeyDown` が
   * 「`document.activeElement === last` かつ Tab」のとき `preventDefault()` して
   * `focus(first)` を呼ぶ（`@radix-ui/react-focus-scope/dist/index.mjs`。
   * `loop: true` は `@radix-ui/react-dialog` が渡している）。
   *
   * つまり**親ドキュメント内で完結する**ので、クロスプロセスの競合が
   * 原理的に入らない。WebKit で skip しない理由もここ（下記）。
   *
   * ここが壊れる＝閉じるボタンを後ろへ動かすと、プレイヤーの脇にある
   * リンクまで来たキーボード利用者の出口が遠くなる。
   */
  test('予告編は最後尾から Tab 1回で閉じるボタンへ戻れる', async ({ page }) => {
    /*
      ⚠️ **このテストは WebKit でも skip しない。**

      冒頭のスキップリンクのテストと違い、ネイティブの Tab 順に依存しない。
      起点は `locator.focus()`（プログラム的）で、Tab は上記のとおり Radix の
      ハンドラが `preventDefault()` して処理するため、ブラウザが a / button を
      Tab 順に含めるかは関係ない。

      実測で確認済み（本番ビルド）: webkit `--repeat-each=5` で5本、
      firefox `--repeat-each=3` で3本とも通過。
    */

    // 実物の埋め込みを読ませるとプレイヤーがフォーカスを奪い、
    // どの要素にフォーカスがあるかが環境依存になる（#1093）
    await stubTrailerEmbed(page);
    await mockMovieDetail(page, {
      backdrop_path: '/e2e-backdrop.jpg',
      // 2件入れる。回り込みが件数によらないことと、描画完了の待ちのため
      // （定数の JSDoc 参照）。中間項目の DOM 順はこのテストでは見ていない
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
    // 起点が取れたことを先に確定させる（落ちたとき原因を切り分けやすい）
    await expect(youtubeLinks.last()).toBeFocused();

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
