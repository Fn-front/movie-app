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

import { test, expect, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import { seedRecommendationRefreshCooldown } from '../helpers/api';
import { runScopedEmail } from '../helpers/runScope';

/** 専用ユーザーの作成（bcrypt）とログインを含むので既定の30秒では足りない */
test.describe.configure({ mode: 'serial', timeout: 90000 });

/** 本 spec 専用のユーザー（run 単位。理由は runScope.ts を参照／#793） */
const USER = {
  email: runScopedEmail('e2e-refresh-cooldown'),
  password: 'E2eCooldownPass123!',
};

test.describe('レコメンド手動更新のクールダウン', () => {
  /** ログインを1回で済ませるため、spec 全体で1つのページを使い回す */
  let session: DedicatedSession;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    // describe の timeout はテストにしか効かない。ユーザー作成（bcrypt）と
    // ログイン（初回アクセスのコンパイル待ちを含む）は既定の30秒に収まらない
    testInfo.setTimeout(90000);

    session = await openDedicatedSession(browser, USER);
    page = session.page;

    // ログイン処理の後に仕込む（先に入れても消されはしないが順序を明示する）
    await seedRecommendationRefreshCooldown(session.userId);
  });

  test.afterAll(async () => {
    await session.close();
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
