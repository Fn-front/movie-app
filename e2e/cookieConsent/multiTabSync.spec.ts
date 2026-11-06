/**
 * 複数タブ間の同期（#931）
 *
 * `subscribeConsent`（`src/utils/cookieConsent.ts`）は、同一タブをカスタム
 * イベント、別タブを `storage` イベントで拾う。`storage` は書き込んだタブ自身には
 * 発火しないという仕様に依存しているため、jsdom のモックでは本当に二重に
 * ならないかを確かめられない。
 */

import {
  consentBanner,
  consentToggleRadio,
  expect,
  grantButton,
  test,
} from './fixtures';

test.describe('Cookie同意 / 複数タブ', () => {
  test('片方のタブで同意すると、もう片方のバナーも消える', async ({
    context,
  }) => {
    const first = await context.newPage();
    const second = await context.newPage();

    await first.goto('/');
    await second.goto('/');

    await expect(consentBanner(first)).toBeVisible();
    await expect(consentBanner(second)).toBeVisible();

    await grantButton(first).click();

    await expect(consentBanner(first)).toBeHidden();
    // storage イベント経由。ここが落ちるなら購読が外れている
    await expect(consentBanner(second)).toBeHidden();
  });

  test('片方のタブで撤回すると、もう片方のトグルも追随する', async ({
    context,
  }) => {
    const first = await context.newPage();
    const second = await context.newPage();

    await first.goto('/');
    await grantButton(first).click();
    await expect(consentBanner(first)).toBeHidden();

    // 2枚目は同意済みの状態で開く（トグルが出る条件）
    await second.goto('/privacy');
    await expect(consentToggleRadio(second, '同意する')).toBeChecked();

    await first.goto('/privacy');
    await consentToggleRadio(first, '同意しない').click();

    await expect(consentToggleRadio(second, '同意しない')).toBeChecked();
  });
});
