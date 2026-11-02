/**
 * 配信開始された未視聴作品の優先表示 E2Eテスト（認証済み）
 *
 * movie_streaming_status に直接データを入れて検証する。
 * TMDb の実データに依存させると、配信状況の変化でテストが壊れるため。
 *
 * ⚠️ 共有の TEST_USER は使わない。ウォッチリストを全件削除しながら進めるため、
 * 同じユーザーを使う他の spec を並列実行時に壊す。
 */

import { test, expect, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import {
  cleanupStreamingStatus,
  cleanupWatchlistForUser,
  seedStreamingStatus,
} from '../helpers/api';
import { movieTiles } from '../helpers/locators';
import { runScopedEmail } from '../helpers/runScope';

test.describe.configure({ mode: 'serial', timeout: 120000 });

const USER = {
  email: runScopedEmail('e2e-watchlist-streaming'),
  password: 'WatchlistStreamingE2e1',
} as const;

/** U-NEXT のプロバイダーID */
const PROVIDER_UNEXT = 84;

/** 映画をウォッチリストに追加し、その tmdb_movie_id とタイトルを返す */
async function addMovieToWatchlist(
  page: Page,
): Promise<{ tmdbMovieId: number; title: string }> {
  await page.goto('/movies/now-showing');
  await movieTiles(page).first().waitFor({ timeout: 30000 });

  const firstTile = movieTiles(page).first();
  const addButton = firstTile.getByRole('button', {
    name: 'ウォッチリストに追加',
  });
  await expect(addButton).toBeVisible({ timeout: 15000 });

  const responsePromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/watchlist') &&
      res.request().method() === 'POST' &&
      res.status() === 201,
    { timeout: 30000 },
  );
  await addButton.click();
  const response = await responsePromise;
  const body = await response.json();

  return {
    tmdbMovieId: body.data.tmdb_movie_id,
    title: body.data.title,
  };
}

test.describe('配信開始の優先表示', () => {
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
    await session.close();
  });

  test('配信中の作品にバッジとサービスのロゴが出る', async () => {
    await cleanupWatchlistForUser(session.userId);
    const movie = await addMovieToWatchlist(page);
    seededMovieIds.push(movie.tmdbMovieId);

    await seedStreamingStatus({
      tmdbMovieId: movie.tmdbMovieId,
      flatrateProviderIds: [PROVIDER_UNEXT],
    });

    await page.goto('/watchlist');

    const main = page.getByRole('main');
    await expect(main.getByText('見放題')).toBeVisible({ timeout: 30000 });
    await expect(main.getByAltText('U-NEXT')).toBeVisible();

    await page.screenshot({
      path: 'docs/e2e-screenshots/watchlist-streaming-badge.png',
    });
  });

  test('サイドバーには配信バッジを出さない', async () => {
    await page.goto('/watchlist');

    // サイドバーは「公開日が近い映画」。配信中を先頭に送る並びは持ち込まない
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('見放題')).toHaveCount(0, {
      timeout: 15000,
    });
  });

  test('配信が無い作品にはバッジを出さない', async () => {
    await cleanupWatchlistForUser(session.userId);
    const movie = await addMovieToWatchlist(page);
    seededMovieIds.push(movie.tmdbMovieId);

    // 配信なしの状態を明示的に入れる
    await seedStreamingStatus({ tmdbMovieId: movie.tmdbMovieId });

    await page.goto('/watchlist');

    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: movie.title })).toBeVisible({
      timeout: 30000,
    });
    await expect(main.getByText('見放題')).toHaveCount(0);
    await expect(main.getByText('レンタル')).toHaveCount(0);
  });
});
