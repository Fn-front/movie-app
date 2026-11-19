/**
 * セッションの強制失効・admin 剥奪の追従 E2Eテスト（#1281）
 *
 * `jwt` コールバックは5分おきに `users` を引き直し、
 *   - `password_changed_at` がトークンより新しければ **セッションを失効**
 *   - `role` が変わっていれば **トークンのロールを追従**
 * させる。どちらもセキュリティの土台だが、**E2E が1本も無かった**。
 *
 * #1281 で `lookupSessionUser`（同じ利用者の問い合わせを1秒だけ共有する）
 * を挟んだため、ここが壊れていないことを確認する経路が要る。
 * `changePassword.spec.ts` はネットワークを `page.route` でモックしていて
 * `password_changed_at` を実際には動かさないので、代わりにならない。
 *
 * ⚠️ **製品コードにテスト用の抜け道は作らない。** セッションは本物の
 * `AUTH_SECRET` で署名・暗号化したものを差し込む（`helpers/sessionToken.ts`）。
 * ログイン直後のトークンは「確認済み」なので、そのままでは5分待たないと
 * 追従が走らない。確認窓を開けるためだけに `lastPasswordCheck` を 0 にする。
 *
 * ⚠️ 共有の `TEST_USER` は使わない。`password_changed_at` と `role` を
 * 書き換えるため、並列実行で他の spec を壊す（#750）。
 *
 * ユーザーストーリー網羅:
 * - セキュリティ: パスワードを変えられたセッションは保護ページから締め出される
 * - セキュリティ: admin を剥奪されたセッションは管理画面から締め出される
 * - 正常系（反証）: 何も変わっていなければ締め出されない（上2件が
 *   「単に Cookie を差し替えたから落ちた」のではないことを示す）
 */

import { test, expect, type Page } from '@playwright/test';

import { ROUTES } from '@/constants';

import {
  cleanupLoginIpRateLimits,
  cleanupRateLimitsForEmail,
  cleanupRateLimitsForUser,
  createVerifiedUser,
  deleteUserByEmail,
  updateUserColumns,
} from '../helpers/dedicatedUser';
import { runScopedEmail } from '../helpers/runScope';
import { seedStaleCheckSession } from '../helpers/sessionToken';

/**
 * 失効判定のベースライン
 *
 * 「DBの値のほうが新しい」ことが時刻の精度に依存しないよう、
 * 十分に過去の固定値を使う
 */
const BASELINE_PASSWORD_CHANGED_AT = '2000-01-01T00:00:00.000Z';

const USER = {
  email: runScopedEmail('e2e-session-invalidation'),
  password: 'SessionInvalidE2e1',
  role: 'admin',
} as const;

let userId = '';

/** 画面からログインする（本物のセッションCookieを得るため） */
async function signIn(page: Page): Promise<void> {
  await page.goto(ROUTES.LOGIN);
  await page.getByLabel('メールアドレス').fill(USER.email);
  await page.getByLabel('パスワード').fill(USER.password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await page.waitForURL(ROUTES.HOME);
}

// ログイン（bcrypt）＋DB往復＋画面遷移を行うため、既定の30秒では足りない
test.describe.configure({ mode: 'serial', timeout: 90000 });

test.describe('セッションの強制失効と admin 剥奪の追従', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async () => {
    userId = await createVerifiedUser(USER);
  });

  test.afterAll(async () => {
    await deleteUserByEmail(USER.email);
  });

  test.beforeEach(async () => {
    // ログインの試行回数で詰まらないようにする
    await cleanupLoginIpRateLimits();
    await cleanupRateLimitsForEmail(USER.email);
    await cleanupRateLimitsForUser(userId);

    // 前のテストが書き換えた状態を戻す
    await updateUserColumns(userId, {
      password_changed_at: null,
      role: 'admin',
    });
  });

  test('パスワードを変更されたセッションは保護ページから締め出される', async ({
    page,
  }) => {
    await signIn(page);

    // ⚠️ **DBを先に変えてから**セッションを差し替える。
    //
    // 逆にすると、差し替えた直後に `SessionProvider` の
    // `/api/auth/session` が走って確認窓を消費してしまう。そのときDBはまだ
    // 変更前なので失効せず、`lastPasswordCheck` だけ進んだ Cookie に
    // 上書きされる。`goto` の時点では窓が閉じていて、何も起きない
    await updateUserColumns(userId, {
      password_changed_at: new Date().toISOString(),
    });

    await seedStaleCheckSession(page.context(), {
      id: userId,
      email: USER.email,
      role: 'admin',
      // ⚠️ 十分に過去を明示する。省略すると発行時刻（＝上のDB更新より後）に
      // 倒れ、「DBのほうが新しい」が成立しなくなる
      passwordChangedAt: BASELINE_PASSWORD_CHANGED_AT,
    });

    await page.goto(ROUTES.SETTINGS);

    // 失効したセッションは user.id が空になり、保護パスでログインへ送られる
    await page.waitForURL((url) => url.pathname === ROUTES.LOGIN, {
      timeout: 30000,
    });
    await expect(
      page.getByRole('button', { name: 'ログイン', exact: true }),
    ).toBeVisible();
  });

  test('admin を剥奪されたセッションは管理画面から締め出される', async ({
    page,
  }) => {
    await signIn(page);

    // トークンには admin が載ったまま、DB 側だけ一般ユーザーへ落とす。
    // 上のテストと同じ理由で、セッションを差し替える前に更新しておく
    await updateUserColumns(userId, { role: 'user' });

    await seedStaleCheckSession(page.context(), {
      id: userId,
      email: USER.email,
      role: 'admin',
    });

    await page.goto(ROUTES.ADMIN_AWARDS);

    // 権限不足はホームへ送る（存在を隠しても守りにならないため 404 にしない）
    await page.waitForURL((url) => url.pathname === ROUTES.HOME, {
      timeout: 30000,
    });
  });

  /**
   * 反証用。上2件が「Cookie を差し替えただけで落ちている」のではなく、
   * **DB の変更に追従した結果**であることを示す
   */
  test('DBが変わっていなければ締め出されない', async ({ page }) => {
    await signIn(page);
    await seedStaleCheckSession(page.context(), {
      id: userId,
      email: USER.email,
      role: 'admin',
    });

    await page.goto(ROUTES.SETTINGS);
    await expect(page).toHaveURL(new RegExp(`${ROUTES.SETTINGS}$`));

    await page.goto(ROUTES.ADMIN_AWARDS);
    await expect(page).toHaveURL(new RegExp(`${ROUTES.ADMIN_AWARDS}$`));
  });
});
