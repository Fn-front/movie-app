/**
 * 管理者発行アカウント E2Eテスト
 *
 * クリティカルユーザージャーニー:
 * - admin はユーザーメニューからアカウント管理画面へ辿り着ける
 * - admin がアカウントを発行 → 一覧に出る
 * - 一般ユーザーは導線が出ず、画面にもAPIにも到達できない
 * - 未認証はログインへ誘導される
 *
 * メール実送信は E2E_TEST_MODE のバイパスでスキップされる。
 */

import { test, expect, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import { runScopedEmail } from '../helpers/runScope';
import { deleteUsersByUsernames } from '../helpers/dedicatedUser';

test.describe.configure({ mode: 'serial' });

const ADMIN = {
  email: runScopedEmail('admin-accounts-admin'),
  password: 'AdminPassw0rd!',
  role: 'admin' as const,
};

const MEMBER = {
  email: runScopedEmail('admin-accounts-member'),
  password: 'MemberPassw0rd!',
};

/**
 * 導線の検証に使うビューポート。
 *
 * PC（サイドバーの UserMenu）と SP（MobileDrawer）の出し分けは
 * `$breakpoint-lg: 1024px` の CSS メディアクエリだけで決まる
 * （`appLayout.module.scss` / `mobileMenuButton.module.scss`）。
 * 専用ユーザーを増やさずに済むよう、同じセッションの幅を変えて両方を見る。
 */
const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
const MOBILE_VIEWPORT = { width: 375, height: 812 };

/**
 * 発行したアカウント名の控え。
 *
 * 発行アカウントは合成アドレス（`.invalid`）を持つため、run 単位の
 * 後片付け（メールアドレス一致）では消えない。明示的に削除する。
 */
const issuedUsernames: string[] = [];

/** 発行フォームに宛先を入れて送信し、表示されたアカウント名を控える */
async function issueAccount(page: Page, email: string): Promise<void> {
  const form = page.locator('form').first();
  await form.getByLabel('送信先メールアドレス').fill(email);
  await form.getByRole('button', { name: 'アカウントを発行' }).click();

  const notice = page.getByRole('status');
  await expect(notice).toBeVisible();

  const text = (await notice.textContent()) ?? '';
  const matched = text.match(/アカウント名:\s*([A-Z0-9]+)/);

  if (matched) issuedUsernames.push(matched[1]);
}

test.describe('アカウント管理（admin）', () => {
  let session: DedicatedSession;

  test.beforeAll(async ({ browser }) => {
    session = await openDedicatedSession(browser, ADMIN);
  });

  test.afterAll(async () => {
    await session.close();
    // 合成アドレスのアカウントは run 単位の後片付けで消えない
    await deleteUsersByUsernames(issuedUsernames);
  });

  test('アカウントを発行すると一覧に表示される', async () => {
    const { page } = session;

    await page.goto('/admin/accounts');
    await expect(
      page.getByRole('heading', { name: 'アカウント管理' }),
    ).toBeVisible();

    const response = page.waitForResponse(
      (res) =>
        res.url().includes('/api/admin/accounts') &&
        res.request().method() === 'POST',
    );
    await issueAccount(page, runScopedEmail('issued-to'));
    expect((await response).status()).toBe(201);

    // 発行したアカウント名が一度だけ表示される
    const notice = page.getByRole('status');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('アカウント名');

    // 一覧にも出る。設定リンク未使用なので「パスワード未設定」が付く
    await expect(page.getByText('パスワード未設定').first()).toBeVisible();
  });

  // 宛先を保存しない方針なので、画面にも残さない
  test('送信後は宛先の入力欄が空になる', async () => {
    const { page } = session;

    await page.goto('/admin/accounts');
    const field = page
      .locator('form')
      .first()
      .getByLabel('送信先メールアドレス');

    await issueAccount(page, runScopedEmail('issued-to-2'));

    await expect(field).toHaveValue('');
  });

  test('設定リンクの再送フォームは対象アカウント名を確認表示する', async () => {
    const { page } = session;

    await page.goto('/admin/accounts');
    await page
      .getByRole('button', { name: '設定リンクを再送' })
      .first()
      .click();

    // 既にデータが入っているアカウントを渡すため、確定前に対象を明示する
    await expect(page.getByText('の設定リンクを再送します')).toBeVisible();
  });

  /**
   * ユーザーメニューからの導線（#868）
   *
   * 単体テスト（userMenu.test.tsx / mobileDrawer.test.tsx）は `useSession` を
   * モックするため、`auth.ts` の JWT / session コールバックが role を落としても
   * 通ってしまう。実セッションを通るここで、導線が実際に出ることを担保する。
   */
  test.describe('アカウント管理への導線', () => {
    // 幅を変えたまま後続の describe へ渡さない
    test.afterAll(async () => {
      await session.page.setViewportSize(DESKTOP_VIEWPORT);
    });

    test('PC: ユーザーメニューからアカウント管理画面へ遷移できる', async () => {
      const { page } = session;

      await page.setViewportSize(DESKTOP_VIEWPORT);
      await page.goto('/');
      await page.getByRole('button', { name: /ユーザーメニュー/ }).click();

      const item = page.getByRole('menuitem', { name: 'アカウント管理' });
      await expect(item).toBeVisible();
      await item.click();

      await expect(page).toHaveURL(/\/admin\/accounts/);
      await expect(
        page.getByRole('heading', { name: 'アカウント管理' }),
      ).toBeVisible();
    });

    test('SP: ドロワーからアカウント管理画面へ遷移できる', async () => {
      const { page } = session;

      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto('/');
      await page.getByRole('button', { name: 'メニューを開く' }).click();

      const item = page.getByRole('button', { name: 'アカウント管理' });
      await expect(item).toBeVisible();
      await item.click();

      await expect(page).toHaveURL(/\/admin\/accounts/);
      await expect(
        page.getByRole('heading', { name: 'アカウント管理' }),
      ).toBeVisible();
    });
  });
});

test.describe('アカウント管理（権限なし）', () => {
  let session: DedicatedSession;

  test.beforeAll(async ({ browser }) => {
    session = await openDedicatedSession(browser, MEMBER);
  });

  test.afterAll(async () => {
    await session.close();
  });

  test('一般ユーザーは画面にアクセスできない', async () => {
    const { page } = session;

    await page.goto('/admin/accounts');

    // 404 で隠しても守りにならない（APIを直接叩けば分かる）のでホームへ送る
    await expect(page).not.toHaveURL(/\/admin/);
  });

  // 画面を塞いでもAPIが開いていれば意味がない
  test('一般ユーザーはAPIも叩けない（403）', async () => {
    const { page } = session;

    const status = await page.evaluate(async () => {
      const res = await fetch('/api/admin/accounts', {
        credentials: 'include',
      });
      return res.status;
    });

    expect(status).toBe(403);
  });

  test('一般ユーザーは発行APIも叩けない（403）', async () => {
    const { page } = session;

    const status = await page.evaluate(async () => {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'attacker@example.com' }),
        credentials: 'include',
      });
      return res.status;
    });

    expect(status).toBe(403);
  });

  /**
   * 導線を出さないことの確認（#868）
   *
   * 画面とAPIが塞がっていても、導線が見えていれば「押せるのに弾かれる」
   * という体験になる。メニュー自体は開いていること（＝項目だけが無いこと）も
   * 併せて確かめる
   */
  test.describe('アカウント管理への導線', () => {
    test.afterAll(async () => {
      await session.page.setViewportSize(DESKTOP_VIEWPORT);
    });

    test('PC: ユーザーメニューにアカウント管理が出ない', async () => {
      const { page } = session;

      await page.setViewportSize(DESKTOP_VIEWPORT);
      await page.goto('/');
      await page.getByRole('button', { name: /ユーザーメニュー/ }).click();

      await expect(page.getByRole('menuitem', { name: '設定' })).toBeVisible();
      await expect(
        page.getByRole('menuitem', { name: 'アカウント管理' }),
      ).toHaveCount(0);
    });

    test('SP: ドロワーにアカウント管理が出ない', async () => {
      const { page } = session;

      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto('/');
      await page.getByRole('button', { name: 'メニューを開く' }).click();

      await expect(page.getByRole('button', { name: '設定' })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'アカウント管理' }),
      ).toHaveCount(0);
    });
  });
});

test.describe('アカウント管理（未認証）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('未認証はサインインへ誘導される', async ({ page }) => {
    await page.goto('/admin/accounts');

    await expect(page).toHaveURL(/\/auth\/signin/);
    expect(page.url()).toContain('callbackUrl=%2Fadmin%2Faccounts');
  });

  test('未認証のAPIアクセスは 401', async ({ page }) => {
    await page.goto('/');

    const status = await page.evaluate(async () => {
      const res = await fetch('/api/admin/accounts', {
        credentials: 'include',
      });
      return res.status;
    });

    expect(status).toBe(401);
  });
});
