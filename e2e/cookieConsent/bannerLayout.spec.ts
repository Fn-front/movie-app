/**
 * バナー表示中のレイアウト（#931）
 *
 * バナーは `position: fixed` なので、そのままだとフッターや本文末尾を覆う。
 * 実測した高さを `--cookie-banner-height` に出し、`body` の padding-bottom と
 * AppLayout の height から差し引くことで場所を空けている
 * （`src/features/cookieConsent/utils/bannerHeight.ts`）。
 *
 * 高さは文量と画面幅で変わるため、単体テストでは「変数に書いたか」しか見られない。
 * 実際に覆っていないかは実ブラウザでしか確かめられない。
 */

import {
  consentBanner,
  expect,
  grantButton,
  readBannerHeightVar,
  test,
} from './fixtures';

test.describe('Cookie同意 / バナー表示中のレイアウト', () => {
  test('高さが CSS 変数に出て、フッターを覆わない', async ({ page }) => {
    await page.goto('/');

    const banner = consentBanner(page);
    await expect(banner).toBeVisible();

    const bannerBox = await banner.boundingBox();
    expect(bannerBox).not.toBeNull();

    // 実装が渡しているのは ResizeObserver の `entry.contentRect`＝**内容ボックス**
    // なので、境界線と padding を引いた値と突き合わせる。
    //
    // ⚠️ `.c_cookie_banner` には `border-top: 1px` があるため、この値は実際の
    // バナー高さ（境界ボックス）より 1px 小さい。つまりレイアウトが空ける場所が
    // 1px 足りず、フッターの最下 1px が枠線に重なる。本 Issue（#931）は E2E の
    // 追加が範囲なので直さず、#966 に切り出した
    const geometry = await banner.evaluate((element) => {
      const style = getComputedStyle(element);
      const border =
        parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      const padding =
        parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      return {
        borderBoxHeight: element.getBoundingClientRect().height,
        contentBoxHeight:
          element.getBoundingClientRect().height - border - padding,
        borderTopWidth: parseFloat(style.borderTopWidth),
      };
    });

    // ResizeObserver から渡す値と同じく切り上げる
    const expected = `${Math.ceil(geometry.contentBoxHeight)}px`;

    // 失敗時に #966 の存在が分かるようにする。コメントまで遡らないと
    // 「わざと現状を固定している」と気づけないため
    const pendingFix =
      '#966（--cookie-banner-height が境界線ぶん 1px 足りない）を直したら、' +
      '期待値を境界ボックス基準へ変えること';

    // ResizeObserver 経由なので1フレーム遅れる
    await expect
      .poll(() => readBannerHeightVar(page), { message: pendingFix })
      .toBe(expected);

    const paddingBottom = await page.evaluate(
      () => getComputedStyle(document.body).paddingBottom,
    );
    expect(paddingBottom, pendingFix).toBe(expected);

    // フッターの下端がバナーの上端より上にある＝覆われていない。
    // 許容するのは上記の境界線ぶんだけ（直ったらここも 0 に絞れる）
    const footerBox = await page.getByRole('contentinfo').boundingBox();
    expect(footerBox).not.toBeNull();
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(
      bannerBox!.y + geometry.borderTopWidth,
    );

    await page.screenshot({
      path: 'docs/e2e-screenshots/cookie-consent-banner.png',
    });
  });

  test('決定するとCSS変数が外れ、レイアウトが元に戻る', async ({ page }) => {
    await page.goto('/');
    await expect(consentBanner(page)).toBeVisible();

    await grantButton(page).click();
    await expect(consentBanner(page)).toBeHidden();

    // 変数を外すと `_theme.scss` の :root が持つ既定値へ戻る。
    // 外し忘れるとトーストが浮いたままになる
    await expect.poll(() => readBannerHeightVar(page)).toBe('0px');

    const paddingBottom = await page.evaluate(
      () => getComputedStyle(document.body).paddingBottom,
    );
    expect(paddingBottom).toBe('0px');
  });
});
