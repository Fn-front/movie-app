/**
 * 配信開始のお知らせ設定 E2Eテスト（認証済み）
 *
 * 設定の保存と、ウォッチリスト側の並びへの反映を確認する。
 *
 * ⚠️ 共有の TEST_USER は使わない。設定を書き換えるため、
 * 同じユーザーを使う他の spec を並列実行時に壊す。
 */

import { test, expect, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import {
  cleanupStreamingStatus,
  cleanupUserSettings,
  cleanupWatchlistForUser,
  seedStreamingStatus,
} from '../helpers/api';
import { movieTiles } from '../helpers/locators';
import { runScopedEmail } from '../helpers/runScope';

test.describe.configure({ mode: 'serial', timeout: 120000 });

const USER = {
  email: runScopedEmail('e2e-streaming-scope'),
  password: 'StreamingScopeE2e1',
} as const;

/** Amazon Video のプロバイダーID（レンタル側） */
const PROVIDER_AMAZON_VIDEO = 10;

/** 映画をウォッチリストに追加し、その tmdb_movie_id とタイトルを返す */
async function addMovieToWatchlist(
  page: Page,
): Promise<{ tmdbMovieId: number; title: string }> {
  await page.goto('/movies/now-showing');
  await movieTiles(page).first().waitFor({ timeout: 30000 });

  const addButton = movieTiles(page)
    .first()
    .getByRole('button', { name: 'ウォッチリストに追加' });
  await expect(addButton).toBeVisible({ timeout: 15000 });

  const responsePromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/watchlist') &&
      res.request().method() === 'POST' &&
      res.status() === 201,
    { timeout: 30000 },
  );
  await addButton.click();
  const body = await (await responsePromise).json();

  return { tmdbMovieId: body.data.tmdb_movie_id, title: body.data.title };
}

test.describe('配信開始のお知らせ設定', () => {
  let session: DedicatedSession;
  let page: Page;
  const seededMovieIds: number[] = [];

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(120000);
    session = await openDedicatedSession(browser, USER);
    page = session.page;
  });

  test.afterAll(async () => {
    await cleanupStreamingStatus(seededMovieIds);
    await cleanupUserSettings(session.userId);
    await session.close();
  });

  test('設定ページで切り替えると保存される', async () => {
    await cleanupUserSettings(session.userId);
    await page.goto('/settings');

    const flatrateOption = page.getByRole('radio', {
      name: '見放題になったときだけ',
    });
    await expect(flatrateOption).toBeVisible({ timeout: 30000 });

    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/user/settings') &&
        res.request().method() === 'PUT' &&
        res.status() === 200,
      { timeout: 30000 },
    );
    await flatrateOption.click();
    await responsePromise;

    // リロードしても保たれる
    await page.reload();
    await expect(
      page.getByRole('radio', { name: '見放題になったときだけ' }),
    ).toBeChecked({ timeout: 30000 });

    await page.screenshot({
      path: 'docs/e2e-screenshots/settings-streaming-scope.png',
    });
  });

  test('ウォッチリストのヒントが設定を反映する', async () => {
    await page.goto('/watchlist');

    const trigger = page.getByRole('link', {
      name: '並び順について。設定を開く',
    });
    await expect(trigger).toBeVisible({ timeout: 30000 });
    await trigger.focus();

    // 直前のテストで flatrate にしてある
    await expect(page.getByText(/見放題のみが対象です/)).toBeVisible({
      timeout: 15000,
    });

    await page.screenshot({
      path: 'docs/e2e-screenshots/watchlist-streaming-hint.png',
    });
  });

  test('ⓘをキーボードで辿って設定ページへ遷移できる', async () => {
    await page.goto('/watchlist');

    const trigger = page.getByRole('link', {
      name: '並び順について。設定を開く',
    });
    await expect(trigger).toBeVisible({ timeout: 30000 });

    // マウスを使わず、Tabだけでⓘにフォーカスを合わせる
    // （手前にナビゲーション等のリンクがあるため、何回か送る）
    const MAX_TAB_PRESSES = 20;
    let reached = false;
    for (let i = 0; i < MAX_TAB_PRESSES; i += 1) {
      await page.keyboard.press('Tab');
      reached = await trigger.evaluate((el) => el === document.activeElement);
      if (reached) break;
    }
    expect(reached).toBe(true);
    await expect(trigger).toBeFocused();

    // フォーカスした状態で説明が読めること（キーボードユーザーにも見える）
    await expect(page.getByText(/見放題のみが対象です/)).toBeVisible({
      timeout: 15000,
    });

    // Enterキーだけで設定ページへ遷移できること
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/settings$/);
  });

  test('見放題のみの設定でもレンタルのバッジは残る', async () => {
    await cleanupWatchlistForUser(session.userId);
    const movie = await addMovieToWatchlist(page);
    seededMovieIds.push(movie.tmdbMovieId);

    // レンタルだけで観られる状態にする
    await seedStreamingStatus({
      tmdbMovieId: movie.tmdbMovieId,
      paidProviderIds: [PROVIDER_AMAZON_VIDEO],
    });

    await page.goto('/watchlist');

    // 先頭には来ないが、バッジ自体は出る。
    // 設定は「何を先頭に出すか」であって「何を隠すか」ではない
    const main = page.getByRole('main');
    await expect(main.getByText('レンタル')).toBeVisible({ timeout: 30000 });
  });
});
