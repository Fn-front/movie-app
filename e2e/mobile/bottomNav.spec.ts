/**
 * SP のボトムナビゲーション E2E（#1028）
 *
 * 単体テスト（`src/components/layout/bottomNav/bottomNav.test.tsx`）が見るのは
 * 「何件出るか・どれが現在地か・どこへ行くか」まで。ここでしか確かめられないのは
 * **位置関係**で、いずれも CSS と実レイアウトでしか決まらない。
 *
 * - 本文・フッターを覆っていないか（`--bottom-nav-height` → padding-bottom）
 * - 同意バナーと重なっていないか（`--cookie-banner-height` ぶん持ち上がるか）
 * - lg 以上で消えたあとに余計な padding が残らないか
 * - タップ領域が実寸で 44×44 以上あるか（#1017）
 *
 * ここに無いボトムナビの検証:
 * - 320px で横に溢れないこと → `mobileResponsive.spec.ts` の「最狭幅での表示」
 *   （最狭幅の崩れを機能横断でまとめている既存の describe に寄せた）
 * - 実バナーが出た状態で重ならないこと → `e2e/cookieConsent/bottomNavOverlap.spec.ts`
 *   （同意UIは `playwright.ga.config.ts` の担当。#931）
 *
 * ⚠️ 同意バナーそのものは**この config では出ない**。`playwright.config.ts` の
 * `webServer.env` が `NEXT_PUBLIC_GA_ID: ''` にしているため（同意UIは
 * `playwright.ga.config.ts` の担当。#931）。ここでは実装と同じ経路——
 * `document.documentElement.style` へ `--cookie-banner-height` を直接書く
 * （`src/features/cookieConsent/utils/bannerHeight.ts` がやっているのと同じこと）
 * ——でバナーの高さだけを再現し、ナビがその上へ積まれるかを見る。
 * バナーの描画は検証対象ではなく、「高さが変数に出ている状態で正しい位置に
 * 来るか」がボトムナビ側の責務のすべてなので、これで必要十分と判断した。
 */

import type { Locator, Page } from '@playwright/test';

import { ARIA_LABELS } from '@/constants';

import { test, expect } from '../fixtures/auth';

/** iPhone 相当。認証済みの4件を等幅で割ると1件 93.75px */
const SP_VIEWPORT = { width: 375, height: 812 };

/** #1017 のタップ領域の基準 */
const MIN_TAP_SIZE = 44;

/** 同意バナーの高さの模擬値（実測ではなく、積み上がるかだけを見る） */
const FAKE_BANNER_HEIGHT = 80;

/** ボトムナビのランドマーク */
const bottomNav = (page: Page): Locator =>
  page.getByRole('navigation', { name: ARIA_LABELS.PRIMARY_NAV });

/** `--bottom-nav-height` の計算値（未設定なら空文字） */
const readNavHeightVar = (page: Page): Promise<string> =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--bottom-nav-height')
      .trim(),
  );

test.describe('SP のボトムナビゲーション（認証済み）', () => {
  test.use({ viewport: SP_VIEWPORT });

  test('ドロワーを開かずに主要導線を1タップで移動できる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    const nav = bottomNav(page);
    await expect(nav).toBeVisible();

    // 従来は「≡ を押す → 項目を押す」の2タップだった。
    // ドロワーが一度も開かないことが1タップであることの証明になる
    const drawerTitle = page.getByText('メニュー');

    await nav.getByRole('link', { name: '公開中' }).click();
    await page.waitForURL('/movies/now-showing');
    await expect(drawerTitle).toBeHidden();

    await nav.getByRole('link', { name: 'ウォッチリスト' }).click();
    await page.waitForURL('/watchlist');
    await expect(drawerTitle).toBeHidden();

    await nav.getByRole('link', { name: 'ホーム' }).click();
    await page.waitForURL('/');
    await expect(drawerTitle).toBeHidden();
  });

  test('現在地のリンクに aria-current が付く', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');

    const nav = bottomNav(page);
    await expect(nav.getByRole('link', { name: '公開中' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'ホーム' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('タップ領域が 44×44 以上ある', async ({ authenticatedPage: page }) => {
    await page.goto('/');

    const links = bottomNav(page).getByRole('link');
    await expect(links).toHaveCount(4);

    for (const link of await links.all()) {
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      // 375px を4等分して 93.75px。未認証の2件なら 187.5px
      expect(box!.width).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
      expect(box!.height).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
    }
  });

  test('本文とフッターの下端がナビに隠れない', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    const nav = bottomNav(page);
    const navBox = await nav.boundingBox();
    expect(navBox).not.toBeNull();

    // ResizeObserver 経由なので1フレーム遅れる。実装は切り上げて書き込む
    const expected = `${Math.ceil(navBox!.height)}px`;
    await expect.poll(() => readNavHeightVar(page)).toBe(expected);

    // AppLayout が同じぶんだけ下端を空けている（`appLayout.module.scss`）
    const layout = page.locator('div[class*="c_app_layout"]').first();
    await expect
      .poll(() => layout.evaluate((el) => getComputedStyle(el).paddingBottom))
      .toBe(expected);

    // 実測でも覆っていない。フッターの下端がナビの上端を越えないこと
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const footerBox = await page.getByRole('contentinfo').boundingBox();
    expect(footerBox).not.toBeNull();
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
  });

  test('同意バナーが出ている高さぶん、ナビが持ち上がる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    const nav = bottomNav(page);
    await expect(nav).toBeVisible();

    const navHeight = (await nav.boundingBox())!.height;

    // バナー本体は GA 無効のため描画されない。実装（bannerHeight.ts）と
    // 同じ経路で高さだけを立てて、ナビがその上へ積まれるかを見る
    await page.evaluate((height) => {
      document.documentElement.style.setProperty(
        '--cookie-banner-height',
        `${height}px`,
      );
    }, FAKE_BANNER_HEIGHT);

    // ナビの下端 = 画面下端 - バナー高 ＝ バナーに1pxも重ならない
    await expect
      .poll(async () => {
        const box = await nav.boundingBox();
        return box === null
          ? null
          : Math.round(box.y + box.height - page.viewportSize()!.height);
      })
      .toBe(-FAKE_BANNER_HEIGHT);

    // トーストは両方の上へ出す（`toast.module.scss`）。
    // 片方しか足していないとナビかバナーに隠れる
    const toastViewport = page.locator('[class*="toast__viewport"]').first();
    await expect
      .poll(() => toastViewport.evaluate((el) => getComputedStyle(el).bottom))
      .toBe(`${FAKE_BANNER_HEIGHT + Math.ceil(navHeight)}px`);
  });
});

test.describe('SP のボトムナビゲーション（未認証）', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    viewport: SP_VIEWPORT,
  });

  test('保護された2件を出さず2件になる', async ({ page }) => {
    await page.goto('/');

    const nav = bottomNav(page);
    await expect(nav).toBeVisible();

    // 押してもログイン誘導が出るだけの導線を常設しない。2件まで減るのは
    // 承知のうえで、保護項目を隠す方針を優先する（ログイン誘導はドロワーが持つ）
    await expect(nav.getByRole('link')).toHaveCount(2);
    await expect(nav.getByRole('link', { name: 'ウォッチリスト' })).toHaveCount(
      0,
    );
    await expect(nav.getByRole('link', { name: 'お気に入り' })).toHaveCount(0);
  });
});

test.describe('lg 以上のボトムナビゲーション', () => {
  test.use({ viewport: SP_VIEWPORT });

  test('lg まで広げるとナビが消え、本文に余計な padding が残らない', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    const nav = bottomNav(page);
    await expect(nav).toBeVisible();
    await expect.poll(() => readNavHeightVar(page)).not.toBe('0px');

    // SP → lg の順に広げ、「display: none になった要素を ResizeObserver が
    // 0 と報告する」経路を通す。ここが効いていないと lg の本文下端に
    // SP 用の余白が残る。
    // （lg で読み込んだ場合も Chromium は display:none の要素に初回観測を
    //   1回返すので 0px が書かれる。どちらにせよ参照側は
    //   `var(--bottom-nav-height, 0px)` なので結果は同じ）
    await page.setViewportSize({ width: 1280, height: 800 });

    await expect(nav).toBeHidden();
    await expect.poll(() => readNavHeightVar(page)).toBe('0px');

    const layout = page.locator('div[class*="c_app_layout"]').first();
    await expect
      .poll(() => layout.evaluate((el) => getComputedStyle(el).paddingBottom))
      .toBe('0px');

    // 従来どおりサイドバーのナビが使える
    await expect(
      page.getByRole('navigation', { name: '映画ナビゲーション' }),
    ).toBeVisible();
  });
});
