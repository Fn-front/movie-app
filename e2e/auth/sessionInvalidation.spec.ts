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

/**
 * 確認窓を開き直しながら、締め出されるまで再試行する
 *
 * ⚠️ 1回の `goto` に賭けると CI で断続的に落ちる。
 *
 * 確認窓（`lastPasswordCheck` の5分間隔）は**最初に通ったリクエストが
 * 消費する**。アプリのページに留まったまま Cookie を差し替えると、
 * `SessionProvider` の `/api/auth/session` やページ自身の API 呼び出しが
 * 同時に走り、全部が同じ（窓の開いた）Cookie で検査を始める。
 * それぞれが更新後の Cookie を返すため**最後に届いた Set-Cookie が勝ち**、
 * 失効させた Cookie が失効していない Cookie に上書きされうる。そうなると
 * 窓は閉じているので、続く `goto` では何も起きない。
 *
 * 対策は2つ重ねる。
 *   1. 差し替える前に空ページへ移して、背景のリクエストを止める
 *   2. それでも競り負けたときのために、窓を開き直して再試行する
 *
 * @param page - 対象のページ
 * @param from - アクセスするパス
 * @param to - 締め出された結果たどり着くべきパス
 * @param seed - セッションを差し替える処理
 */
async function expectLockedOut(
  page: Page,
  from: string,
  to: string,
  seed: () => Promise<void>,
): Promise<void> {
  await expect(async () => {
    // 背景のリクエストに窓を奪われないよう、静止してから差し替える
    await page.goto('about:blank');
    await seed();
    await page.goto(from);

    expect(new URL(page.url()).pathname).toBe(to);
  }).toPass({ timeout: 60000 });
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

    // 失効したセッションは user.id が空になり、保護パスでログインへ送られる
    await expectLockedOut(page, ROUTES.SETTINGS, ROUTES.LOGIN, () =>
      seedStaleCheckSession(page.context(), {
        id: userId,
        email: USER.email,
        role: 'admin',
        // ⚠️ 十分に過去を明示する。省略すると発行時刻（＝上のDB更新より後）に
        // 倒れ、「DBのほうが新しい」が成立しなくなる
        passwordChangedAt: BASELINE_PASSWORD_CHANGED_AT,
      }),
    );

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

    // 権限不足はホームへ送る（存在を隠しても守りにならないため 404 にしない）
    await expectLockedOut(page, ROUTES.ADMIN_AWARDS, ROUTES.HOME, () =>
      seedStaleCheckSession(page.context(), {
        id: userId,
        email: USER.email,
        role: 'admin',
      }),
    );
  });

  /**
   * 反証用。上2件が「Cookie を差し替えただけで落ちている」のではなく、
   * **DB の変更に追従した結果**であることを示す
   */
  test('DBが変わっていなければ締め出されない', async ({ page }) => {
    await signIn(page);

    // 締め出される側と条件を揃える（背景リクエストで窓を消費させない）
    await page.goto('about:blank');
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
