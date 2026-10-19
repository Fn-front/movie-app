/**
 * レコメンド手動更新のクールダウン E2Eテスト
 *
 * rate_limits.last_attempt_at が naive TIMESTAMP だったため、PostgREST が
 * オフセット無しで返す値を JS がローカル時刻として解釈していた。JST の
 * アプリサーバーでは経過時間が実際より9時間長く見え、クールダウンが
 * 一度も発動しなかった（#759）。
 *
 * ローカル開発機（JST）で実行したときに素通りしないことを確認する。
 * 本番/CI は UTC のため、この経路では元々顕在化しない。
 *
 * 専用ユーザーを使う。共有テストユーザーの rate_limits は他の spec が
 * テスト毎に全消しするため、仕込んだクールダウンが並列実行中に消える。
 */

import type { Page } from '@playwright/test';

import { test, expect, performLogin } from '../fixtures/auth';
import { seedRecommendationRefreshCooldown } from '../helpers/api';
import {
  cleanupLoginIpRateLimits,
  cleanupRateLimitsForUser,
  createVerifiedUser,
  deleteUserByEmail,
} from '../helpers/dedicatedUser';

/** 専用ユーザーの作成（bcrypt）とログインを含むので既定の30秒では足りない */
test.describe.configure({ mode: 'serial', timeout: 90000 });

const USER = {
  email: 'e2e-refresh-cooldown@example.com',
  password: 'E2eCooldownPass123!',
};

test.describe('レコメンド手動更新のクールダウン', () => {
  let page: Page;
  let userId: string;

  test.beforeAll(async ({ browser }, testInfo) => {
    // describe の timeout はテストにしか効かない。ユーザー作成（bcrypt）と
    // ログイン（初回アクセスのコンパイル待ちを含む）は既定の30秒に収まらない
    testInfo.setTimeout(90000);

    userId = await createVerifiedUser(USER);

    // 送信元IP単位のログイン上限は全 spec で共有される
    await cleanupLoginIpRateLimits();

    // browser.newContext は config の use を引き継ぐ（baseURL はそれでよいが、
    // storageState まで入ると共有テストユーザーでログイン済みになってしまう）
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    page = await context.newPage();
    await performLogin(page, USER);

    // ログイン処理の後に仕込む（先に入れても消されはしないが順序を明示する）
    await seedRecommendationRefreshCooldown(userId);
  });

  test.afterAll(async () => {
    await page.context().close();
    // rate_limits は user_id を持たず連鎖削除されないため個別に消す
    await cleanupRateLimitsForUser(userId);
    await deleteUserByEmail(USER.email);
  });

  test('直前に更新していればクールダウンで弾かれる', async () => {
    const response = await page.request.post('/api/recommendations/refresh');

    expect(response.status()).toBe(429);

    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('REFRESH_COOLDOWN');
  });

  // 「クールダウンが明ければ通る」側はここでは検証しない。
  // 実際に通すとAI生成が走り、月あたりの更新上限も1回消費するため。
  // 境界値（満了ちょうど／1ms手前）は rateLimit.test.ts でカバーしている。
});
