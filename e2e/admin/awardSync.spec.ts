/**
 * 受賞作品の手動同期 E2Eテスト
 *
 * クリティカルユーザージャーニー:
 * - admin はメニューから同期画面へ辿り着ける（PC / SP 両方）
 * - 年と賞を指定して実行 → 進捗が出て完了まで遷移する
 * - 実行中のジョブがあると弾かれ、閾値を超えたときだけ強制失効できる
 * - 一般ユーザーは導線が出ず、画面にもAPIにも到達できない
 * - 未認証はログインへ誘導される（戻り先を保持）
 *
 * ⚠️ 同期APIは page.route で固定する。実通信にすると
 *   - CI の e2e.yml に OPENAI_API_KEY が無いためカンヌ/GGは動かない
 *   - アカデミー賞も eiga.com への実HTTPで不安定
 *   - 本番DBの award_movies を書き換えてしまう
 *   検証対象は画面側（進捗表示・409・強制失効・導線）に絞る。
 */

import { test, expect, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import { runScopedEmail } from '../helpers/runScope';

test.describe.configure({ mode: 'serial' });

const ADMIN = {
  email: runScopedEmail('award-sync-admin'),
  password: 'AdminPassw0rd!',
  role: 'admin' as const,
};

const MEMBER = {
  email: runScopedEmail('award-sync-member'),
  password: 'MemberPassw0rd!',
};

/**
 * 導線の検証に使うビューポート。
 * PC（UserMenu）と SP（MobileDrawer）の出し分けは CSS メディアクエリだけで
 * 決まるため、同じセッションの幅を変えて両方を見る。
 */
const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
const MOBILE_VIEWPORT = { width: 375, height: 812 };

const SYNC_API = '**/api/admin/awards/sync';
const JOB_API = '**/api/admin/awards/sync/*';

const JOB_ID = '11111111-1111-4111-8111-111111111111';

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    awardName: 'cannes',
    awardYear: 2024,
    status: 'running',
    totalUpserted: null,
    errorMessage: null,
    createdAt: '2026-10-31T00:00:00.000Z',
    startedAt: '2026-10-31T00:00:00.000Z',
    finishedAt: null,
    ...overrides,
  };
}

/** GET（最新ジョブ）だけを固定する。POST は各テストが上書きする */
async function stubLatest(page: Page, data: unknown) {
  await page.route(SYNC_API, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ status: 200, json: { success: true, data } });
  });
}

/** 画面を開いて初期表示が落ち着くまで待つ */
async function openSyncPage(page: Page) {
  await page.goto('/admin/awards');
  await expect(
    page.getByRole('heading', { name: '受賞作品の手動同期' }),
  ).toBeVisible();
}

test.describe('受賞作品の手動同期（admin）', () => {
  let session: DedicatedSession;

  test.beforeAll(async ({ browser }) => {
    session = await openDedicatedSession(browser, ADMIN);
  });

  test.afterAll(async () => {
    await session.close();
  });

  test('年と賞を指定して実行すると進捗が出て完了まで遷移する', async () => {
    const { page } = session;

    // 画面由来のエラーを拾う（Next.js Dev Tools のバッジが赤くなる原因）
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await stubLatest(page, { job: null, isStale: false });
    await page.route(SYNC_API, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        status: 202,
        json: { success: true, data: { job: job() } },
      });
    });

    let polls = 0;
    await page.route(JOB_API, async (route) => {
      polls += 1;
      const done = polls >= 2;
      await route.fulfill({
        status: 200,
        json: {
          success: true,
          data: {
            job: job({
              status: done ? 'succeeded' : 'running',
              totalUpserted: done ? 12 : null,
              finishedAt: done ? '2026-10-31T00:05:00.000Z' : null,
            }),
            isStale: false,
          },
        },
      });
    });

    await openSyncPage(page);
    await expect(page.getByText('実行履歴はまだありません')).toBeVisible();

    await page.getByLabel('年（授賞式の年）').fill('2024');
    await page.getByRole('button', { name: '同期を開始' }).click();

    const status = page.getByRole('status');
    await expect(status).toContainText('実行中');
    await expect(status).toContainText('12件', { timeout: 30_000 });

    // 同期直後の確認リンクはキャッシュバスター付き
    const link = page.getByRole('link', { name: '受賞作品ページで確認' });
    await expect(link).toBeVisible();
    expect(await link.getAttribute('href')).toContain('/awards?t=');

    expect(consoleErrors).toEqual([]);
  });

  // 既にデータがある年の取り直しは正当な用途なので弾かない。注意喚起に留める
  test('既にデータがある年は件数を警告するが実行は妨げない', async () => {
    const { page } = session;

    await stubLatest(page, { job: null, isStale: false });
    await page.route('**/api/admin/awards/existing*', async (route) => {
      await route.fulfill({
        status: 200,
        json: { success: true, data: { count: 42 } },
      });
    });

    await openSyncPage(page);
    await page.getByLabel('年（授賞式の年）').fill('2024');

    await expect(
      page.getByText('この年は既に42件あります。実行すると置き換わります。'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '同期を開始' }),
    ).toBeEnabled();

    await page.unroute('**/api/admin/awards/existing*');
  });

  test('0件の年では警告を出さない', async () => {
    const { page } = session;

    await stubLatest(page, { job: null, isStale: false });
    await page.route('**/api/admin/awards/existing*', async (route) => {
      await route.fulfill({
        status: 200,
        json: { success: true, data: { count: 0 } },
      });
    });

    await openSyncPage(page);
    await page.getByLabel('年（授賞式の年）').fill('2024');
    await page.waitForTimeout(1000);

    await expect(page.getByText(/この年は既に/)).toHaveCount(0);

    await page.unroute('**/api/admin/awards/existing*');
  });

  test('取得0件で失敗したときは理由が表示される', async () => {
    const { page } = session;

    await stubLatest(page, {
      job: job({
        status: 'failed',
        errorMessage:
          '受賞作品を取得できませんでした（既存データは変更していません）',
        finishedAt: '2026-10-31T00:05:00.000Z',
      }),
      isStale: false,
    });

    await openSyncPage(page);

    await expect(page.getByRole('status')).toContainText(
      '既存データは変更していません',
    );
  });

  test('実行中のジョブがあると弾かれ、閾値未満では強制操作が出ない', async () => {
    const { page } = session;

    await stubLatest(page, { job: null, isStale: false });
    await page.route(SYNC_API, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        status: 409,
        json: {
          success: false,
          error: { code: 'CONFLICT', message: '実行中の同期があります' },
          data: { job: job(), isStale: false },
        },
      });
    });

    await openSyncPage(page);
    await page.getByLabel('年（授賞式の年）').fill('2024');
    await page.getByRole('button', { name: '同期を開始' }).click();

    await expect(page.getByText('実行中の同期があります')).toBeVisible();
    await expect(
      page.getByRole('button', { name: '強制的に失敗として閉じて再実行' }),
    ).toHaveCount(0);
  });

  test('閾値を超えた実行中ジョブは強制失効して再実行できる', async () => {
    const { page } = session;

    await stubLatest(page, { job: null, isStale: false });

    let forced = false;
    await page.route(SYNC_API, async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.fallback();

      const body = request.postDataJSON() as { force?: boolean };

      if (!body.force) {
        return route.fulfill({
          status: 409,
          json: {
            success: false,
            error: { code: 'CONFLICT', message: '実行中の同期があります' },
            data: { job: job(), isStale: true },
          },
        });
      }

      forced = true;
      await route.fulfill({
        status: 202,
        json: { success: true, data: { job: job() } },
      });
    });

    await page.route(JOB_API, async (route) => {
      await route.fulfill({
        status: 200,
        json: { success: true, data: { job: job(), isStale: false } },
      });
    });

    await openSyncPage(page);
    await page.getByLabel('年（授賞式の年）').fill('2024');
    await page.getByRole('button', { name: '同期を開始' }).click();

    // 走っている処理は止まらないことを明示している
    await expect(
      page.getByText('実行中の処理自体は止まりません'),
    ).toBeVisible();

    await page
      .getByRole('button', { name: '強制的に失敗として閉じて再実行' })
      .click();

    await expect.poll(() => forced).toBe(true);
    await expect(page.getByRole('status')).toContainText('実行中');
  });

  test('リロードしても実行中の進捗を復元する', async () => {
    const { page } = session;

    await stubLatest(page, { job: job(), isStale: false });
    await page.route(JOB_API, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          success: true,
          data: {
            job: job({
              status: 'succeeded',
              totalUpserted: 5,
              finishedAt: '2026-10-31T00:05:00.000Z',
            }),
            isStale: false,
          },
        },
      });
    });

    await openSyncPage(page);

    // 復元直後は実行中、ポーリングで完了に変わる
    await expect(page.getByRole('status')).toContainText('5件', {
      timeout: 30_000,
    });
  });

  test('キーボードのみで実行できる', async () => {
    const { page } = session;

    await stubLatest(page, { job: null, isStale: false });
    await page.route(SYNC_API, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        status: 202,
        json: { success: true, data: { job: job() } },
      });
    });
    await page.route(JOB_API, async (route) => {
      await route.fulfill({
        status: 200,
        json: { success: true, data: { job: job(), isStale: false } },
      });
    });

    await openSyncPage(page);
    await page.getByLabel('年（授賞式の年）').focus();
    await page.keyboard.type('2024');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('status')).toContainText('実行中');
  });

  test('PC のユーザーメニューから同期画面へ辿り着ける', async () => {
    const { page } = session;

    await stubLatest(page, { job: null, isStale: false });
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto('/');

    await page.getByRole('button', { name: /ユーザーメニュー/ }).click();
    await page.getByRole('menuitem', { name: /受賞作品の同期/ }).click();

    await expect(page).toHaveURL(/\/admin\/awards/);
    await expect(
      page.getByRole('heading', { name: '受賞作品の手動同期' }),
    ).toBeVisible();
  });

  test('SP のドロワーから同期画面へ辿り着ける', async () => {
    const { page } = session;

    await stubLatest(page, { job: null, isStale: false });
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/');

    await page
      .getByRole('button', { name: /メニュー/ })
      .first()
      .click();
    await page.getByRole('button', { name: /受賞作品の同期/ }).click();

    await expect(page).toHaveURL(/\/admin\/awards/);
    await expect(
      page.getByRole('heading', { name: '受賞作品の手動同期' }),
    ).toBeVisible();

    await page.setViewportSize(DESKTOP_VIEWPORT);
  });
});

test.describe('受賞作品の手動同期（未認証）', () => {
  // 既定の page は共有テストユーザーでログイン済みになるため、空にする
  test.use({ storageState: { cookies: [], origins: [] } });

  test('未認証はログインへ誘導され、戻り先が保持される', async ({ page }) => {
    await page.goto('/admin/awards');

    await expect(page).toHaveURL(/\/auth\/signin/);
    expect(page.url()).toContain('callbackUrl=%2Fadmin%2Fawards');
  });
});

test.describe('受賞作品の手動同期（権限）', () => {
  test('一般ユーザーは画面にもAPIにも到達できない', async ({ browser }) => {
    const session = await openDedicatedSession(browser, MEMBER);

    try {
      const { page } = session;

      // 画面は proxy がホームへ送り返す
      await page.goto('/admin/awards');
      await expect(page).not.toHaveURL(/\/admin\/awards/);

      // API は withAdminAuth が 403 を返す（proxy を素通りするため）
      const response = await page.request.post('/api/admin/awards/sync', {
        data: { awardName: 'cannes', year: 2024 },
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(403);
    } finally {
      await session.close();
    }
  });
});
