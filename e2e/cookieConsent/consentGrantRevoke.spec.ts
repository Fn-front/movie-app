/**
 * 同意と撤回の往復（#931）
 *
 * - gtag.js 読み込み後に `consent update` が反映されるか
 * - 同意で `_ga` / `_ga_<コンテナID>` が生成され、撤回で消えるか
 *
 * Cookie の生成・削除は gtag.js 本体と `document.cookie` の挙動に依存するため、
 * jsdom では確かめられない（`deleteGaCookies` が domain 候補を総当たりするのも
 * そのため）。
 */

import {
  GA_COOKIE_NAMES,
  consentBanner,
  consentToggleRadio,
  expect,
  gaCookieNames,
  grantButton,
  readConsentCommands,
  readStoredConsent,
  test,
} from './fixtures';
import type { Page } from '@playwright/test';

/** `consent update` に渡された analytics_storage の履歴 */
async function consentUpdates(page: Page): Promise<string[]> {
  const commands = await readConsentCommands(page);
  return commands
    .filter((command) => command.action === 'update')
    .map((command) => command.params.analytics_storage);
}

test.describe('Cookie同意 / 同意と撤回', () => {
  test('同意すると consent update が granted になり _ga が作られる', async ({
    page,
    context,
    ga,
  }) => {
    await page.goto('/');
    await expect(consentBanner(page)).toBeVisible();
    expect(await gaCookieNames(context)).toEqual([]);

    await grantButton(page).click();

    // バナーは決定と同時に消える
    await expect(consentBanner(page)).toBeHidden();

    await expect.poll(() => consentUpdates(page)).toContain('granted');
    await expect.poll(() => gaCookieNames(context)).toEqual(GA_COOKIE_NAMES);

    const stored = await readStoredConsent(page);
    expect(stored.state).toBe('granted');
    // 未ログインの意思表示なので所有者は空文字
    expect(stored.owner).toBe('');

    // 同意した以上ヒットは発生する。それを全部こちらで止めている
    // （実送信が0件であることは ga fixture が毎テスト検証する）
    expect(ga.blockedBeacons.length).toBeGreaterThan(0);
  });

  test('/privacy の撤回トグルで denied になり _ga が消える', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await grantButton(page).click();
    await expect.poll(() => gaCookieNames(context)).toEqual(GA_COOKIE_NAMES);

    // 撤回トグルは未認証でも使える（/settings は認証必須なので、
    // 未ログインの利用者にとっては /privacy が唯一の撤回手段）
    await page.goto('/privacy');
    await expect(consentToggleRadio(page, '同意する')).toBeChecked();

    // トグルは長い本文の最後にあるため、見える位置まで送ってから撮る
    await consentToggleRadio(page, '同意する').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/e2e-screenshots/cookie-consent-toggle.png',
    });

    await consentToggleRadio(page, '同意しない').click();

    await expect.poll(() => consentUpdates(page)).toContain('denied');
    await expect.poll(() => gaCookieNames(context)).toEqual([]);

    const stored = await readStoredConsent(page);
    expect(stored.state).toBe('denied');
  });

  test('「同意しない」を選んでも Cookie は作られず、バナーは再表示されない', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await consentBanner(page)
      .getByRole('button', { name: '同意しない' })
      .click();

    await expect(consentBanner(page)).toBeHidden();
    expect(await gaCookieNames(context)).toEqual([]);

    // 決定済みなので、再訪問してもバナーは出ない（操作を強制しない設計だが、
    // 一度断った利用者に出し続けるのもダークパターンになる）
    await page.goto('/');
    await expect(consentBanner(page)).toBeHidden();
    expect(await gaCookieNames(context)).toEqual([]);
  });
});
