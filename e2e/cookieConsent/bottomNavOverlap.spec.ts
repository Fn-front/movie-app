/**
 * 同意バナーとボトムナビの同時表示（#1028）
 *
 * **この組み合わせを見られるのはここだけ。** 既定の E2E
 * （`playwright.config.ts`）はサーバーの `NEXT_PUBLIC_GA_ID` が空でバナーが
 * 描画されず、同意UI担当のこの config は Desktop Chrome（1280px）＝ナビが
 * `display: none` になる。どちらか片方しか出ないので、ファイル単位で
 * SP ビューポートを当てて初めて両方が揃う。
 *
 * ⚠️ project は増やさないこと。増やすと既存の同意UI spec が全部2回走って
 * CI が伸びる。`test.use({ viewport })` はファイル単位に効く。
 *
 * 何を守っているか: 2つとも `position: fixed` で **z-index も同値（1030）**
 * なので、勝敗は DOM 順で決まりバナーが必ず勝つ。重ならないのはナビ側の
 * `bottom: var(--cookie-banner-height, 0px)` だけが根拠で、そのオフセットが
 * 1px でもずれると「少し重なる」ではなく**ナビが丸ごと隠れて押せなくなる**。
 */

import { ARIA_LABELS } from '@/constants';

import { consentBanner, expect, grantButton, test } from './fixtures';

/** iPhone 相当。未認証なので保護2件は出ず3件になる */
test.use({ viewport: { width: 375, height: 812 } });

/** ボトムナビのランドマーク */
const NAV_SELECTOR = `nav[aria-label="${ARIA_LABELS.PRIMARY_NAV}"]`;

test.describe('Cookie同意 / ボトムナビとの重なり', () => {
  test('バナーの上に積まれ、1pxも覆われない', async ({ page }) => {
    await page.goto('/');

    const banner = consentBanner(page);
    const nav = page.getByRole('navigation', { name: ARIA_LABELS.PRIMARY_NAV });
    await expect(banner).toBeVisible();
    await expect(nav).toBeVisible();

    const bannerBox = await banner.boundingBox();
    const navBox = await nav.boundingBox();
    expect(bannerBox).not.toBeNull();
    expect(navBox).not.toBeNull();

    // ナビの下端がバナーの上端を越えない。越えた瞬間に DOM 順でバナーが
    // 勝ち、ナビは「少し隠れる」ではなく全部隠れる
    await expect
      .poll(async () => {
        const current = await nav.boundingBox();
        return current === null
          ? null
          : Math.round(current.y + current.height) - Math.round(bannerBox!.y);
      })
      .toBeLessThanOrEqual(0);

    // 実際に押せること（重なり判定の決定版）。幾何だけだと
    // 透明な要素が上に乗っている場合を見逃す
    const link = nav.getByRole('link', { name: 'ホーム' });
    await expect(link).toBeVisible();
    const linkBox = await link.boundingBox();
    const hit = await page.evaluate(
      ({ x, y, selector }) => {
        const el = document.elementFromPoint(x, y);
        if (el === null) return 'none';
        return el.closest(selector) !== null
          ? 'bottom-nav'
          : String(el.className || el.tagName);
      },
      {
        x: linkBox!.x + linkBox!.width / 2,
        y: linkBox!.y + linkBox!.height / 2,
        selector: NAV_SELECTOR,
      },
    );
    expect(hit).toBe('bottom-nav');
  });

  test('本文とフッターがバナーとナビの両方に覆われない', async ({ page }) => {
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: ARIA_LABELS.PRIMARY_NAV });
    await expect(nav).toBeVisible();

    const navBox = await nav.boundingBox();
    expect(navBox).not.toBeNull();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // フッターの下端がナビの上端を越えない＝バナー＋ナビの両方のぶん
    // 場所が空いている（body の padding はバナー、AppLayout の
    // padding はナビが担当する）
    const footerBox = await page.getByRole('contentinfo').boundingBox();
    expect(footerBox).not.toBeNull();
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
  });

  test('同意するとナビが画面下端まで下がる', async ({ page }) => {
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: ARIA_LABELS.PRIMARY_NAV });
    await expect(nav).toBeVisible();

    await grantButton(page).click();
    await expect(consentBanner(page)).toBeHidden();

    // バナーが消えると `--cookie-banner-height` が外れ、ナビの下端が
    // 画面下端に戻る。外し忘れるとナビだけ浮いたままになる
    const viewportHeight = page.viewportSize()!.height;
    await expect
      .poll(async () => {
        const box = await nav.boundingBox();
        return box === null ? null : Math.round(box.y + box.height);
      })
      .toBe(viewportHeight);
  });
});
