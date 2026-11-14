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

    // 実装が渡すのは ResizeObserver の `borderBoxSize`＝**境界ボックス**（#966）。
    // バナーは position: fixed なので、画面を覆うのは境界線を含めた高さ。
    // 内容ボックスで測っていた頃は border-top ぶん 1px 足りず、フッターの
    // 最下 1px に枠線が重なっていた
    const geometry = await banner.evaluate((element) => ({
      borderBoxHeight: element.getBoundingClientRect().height,
    }));

    // ResizeObserver から渡す値と同じく切り上げる
    const expected = `${Math.ceil(geometry.borderBoxHeight)}px`;

    // 初回はレイアウト効果が同期で書くので待ちは要らない（#1155）。
    // poll のままにしてあるのは、折り返しの変化で RO が後から上書きする
    // 経路が残っているため
    await expect.poll(() => readBannerHeightVar(page)).toBe(expected);

    const paddingBottom = await page.evaluate(
      () => getComputedStyle(document.body).paddingBottom,
    );
    expect(paddingBottom).toBe(expected);

    // フッターの下端がバナーの上端を越えない＝1pxも覆われていない。
    // #966 以前はここに border-top ぶんの許容が要った
    const footerBox = await page.getByRole('contentinfo').boundingBox();
    expect(footerBox).not.toBeNull();
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(bannerBox!.y);

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
