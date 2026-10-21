/**
 * レコメンド利用イベント計測 E2Eテスト
 *
 * 1イベント＝1リクエストで送っていたため、ホーム画面を数回開くだけで
 * レート制限（429）に到達していた（#757）。バッチ送信と送信済みの永続化が
 * 効いていることを、実際に飛んだリクエストを数えて確認する。
 *
 * 共有テストユーザーではなく専用ユーザーを使う。おすすめ・お気に入りを
 * 作り替えるテストを共有ユーザーで回すと、並列実行中のお気に入り/おすすめの
 * spec が「自分が作ったデータだけがある」前提を壊されて落ちる。
 */

import type { Page, Request, Response } from '@playwright/test';

import { RECOMMENDATIONS_MAX_COUNT } from '../../src/constants/recommendations';
import { test, expect, performLogin } from '../fixtures/auth';
import { seedRecommendationsForUser } from '../helpers/api';
import {
  cleanupLoginIpRateLimits,
  cleanupRateLimitsForUser,
  createVerifiedUser,
  deleteUserByEmail,
} from '../helpers/dedicatedUser';
import { runScopedEmail } from '../helpers/runScope';

/**
 * 1つのページをログイン済みのまま使い回すため直列で回す。
 * 専用ユーザーの作成（bcrypt）とログインを含むので既定の30秒では足りない。
 */
test.describe.configure({ mode: 'serial', timeout: 90000 });

/** 本 spec 専用のユーザー（run 単位。理由は runScope.ts を参照／#793） */
const USER = {
  email: runScopedEmail('e2e-recommendation-events'),
  password: 'E2eEventsPass123!',
};

const EVENTS_ENDPOINT = '/api/recommendations/events';

/** バッチ窓（500ms）が閉じて送信が終わるまでの余裕 */
const FLUSH_WAIT_MS = 1500;

/**
 * レコメンドを画面内に入れ、計測リクエストが飛び切るまで待つ
 *
 * 表示イベントは可視率 0.5 の交差で発火するため、セクションを
 * ビューポートに入れないと1件も送られない。
 */
async function showRecommendations(page: Page): Promise<void> {
  const section = page.getByRole('region', { name: 'あなたへのおすすめ' });
  await expect(section).toBeVisible({ timeout: 15000 });
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(FLUSH_WAIT_MS);
}

/** 計測APIへのPOSTを記録する。`stop()` を呼ぶまで監視し続ける */
function trackEventRequests(page: Page) {
  /** POST 1本ごとに、そこへ詰められたイベント件数 */
  const batches: number[] = [];
  const statuses: number[] = [];

  const onRequest = (request: Request) => {
    if (
      request.url().includes(EVENTS_ENDPOINT) &&
      request.method() === 'POST'
    ) {
      const body = request.postDataJSON() as { events?: unknown[] } | null;
      batches.push(body?.events?.length ?? 0);
    }
  };

  const onResponse = (response: Response) => {
    if (response.url().includes(EVENTS_ENDPOINT)) {
      statuses.push(response.status());
    }
  };

  page.on('request', onRequest);
  page.on('response', onResponse);

  return {
    batches,
    statuses,
    stop: () => {
      page.off('request', onRequest);
      page.off('response', onResponse);
    },
  };
}

test.describe('レコメンド利用イベントの計測', () => {
  /** ログインを1回で済ませるため、spec 全体で1つのページを使い回す */
  let page: Page;
  let userId: string;

  test.beforeAll(async ({ browser }, testInfo) => {
    // describe の timeout はテストにしか効かない。ユーザー作成（bcrypt）と
    // ログイン（初回アクセスのコンパイル待ちを含む）は既定の30秒に収まらない
    testInfo.setTimeout(90000);

    userId = await createVerifiedUser(USER);
    // 1件ずつ送っていた頃は1ページ表示で最大10リクエストが飛んでいた。
    // 当時の条件を再現するため、表示上限まで埋める。
    await seedRecommendationsForUser(userId, RECOMMENDATIONS_MAX_COUNT);

    // 送信元IP単位のログイン上限は全 spec で共有される
    await cleanupLoginIpRateLimits();

    // browser.newContext は config の use を引き継ぐ（baseURL はそれでよいが、
    // storageState まで入ると共有テストユーザーでログイン済みになってしまう）
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    page = await context.newPage();
    await performLogin(page, USER);
  });

  test.afterAll(async () => {
    await page.context().close();
    // rate_limits は user_id を持たず連鎖削除されないため個別に消す
    await cleanupRateLimitsForUser(userId);
    // お気に入り・おすすめ・計測イベントは ON DELETE CASCADE で連鎖削除される
    await deleteUserByEmail(USER.email);
  });

  test('ホーム画面を5回開いてもイベント記録が429を返さない', async () => {
    const tracker = trackEventRequests(page);

    try {
      await page.goto('/');
      await showRecommendations(page);

      for (let i = 0; i < 4; i += 1) {
        await page.reload();
        await showRecommendations(page);
      }
    } finally {
      tracker.stop();
    }

    expect(tracker.statuses.length).toBeGreaterThan(0);
    expect(tracker.statuses).not.toContain(429);
  });

  test('1ページ表示あたりの記録リクエストは1本に収まる', async () => {
    // 前のテストで送信済みになったキーを捨て、初回表示の状態に戻す
    await page.evaluate(() => window.sessionStorage.clear());

    const tracker = trackEventRequests(page);

    try {
      await page.reload();
      await showRecommendations(page);
    } finally {
      tracker.stop();
    }

    // 表示されたレコメンドの件数によらず、まとめて1本で送る
    // （1件ずつ送っていた頃は可視になったタイルの数だけ飛んでいた）
    expect(tracker.batches).toHaveLength(1);
    // 1本にまとまっていることを件数でも確かめる。1件しか入っていなければ
    // 「たまたま1タイルしか可視でなかった」だけでバッチ化の検証にならない
    expect(tracker.batches[0]).toBeGreaterThan(1);
  });

  test('リロードしても送信済みの表示イベントを送り直さない', async () => {
    const tracker = trackEventRequests(page);

    try {
      await page.reload();
      await showRecommendations(page);
    } finally {
      tracker.stop();
    }

    // 送信済みキーは sessionStorage に残る。再送はサーバーの一意制約により
    // DB上 no-op で、レート制限の枠だけを消費していた
    expect(tracker.batches).toHaveLength(0);
  });
});
