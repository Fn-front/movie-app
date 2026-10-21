/**
 * ウォッチリストページ E2Eテスト（認証済み）
 * クリティカルユーザージャーニーのみ
 * - ウォッチリストページ表示 → 映画詳細モーダル
 * - サイドバー「すべて見る」→ ウォッチリストページ遷移
 * - 視聴済みへの切り替えと解除
 * beforeEachで全件クリーンアップしてから1件積むため、テスト内で「元に戻す」操作は不要
 *
 * ⚠️ 共有の `TEST_USER` は使わない（#806）。ウォッチリストを全件削除しながら
 * 進めるため、同じユーザーを使う `watchlistButton.spec.ts` などを並列実行時に壊す。
 * `describe.configure({ mode: 'serial' })` はファイル内の直列化しかせず、
 * ファイル間の並列は防げない。専用ユーザーを作って完結させる。
 */

import { test, expect, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import { cleanupWatchlistForUser } from '../helpers/api';
import { movieTiles } from '../helpers/locators';
import { mockMovieDetail } from '../helpers/movieDetail';
import { runScopedEmail } from '../helpers/runScope';
import { waitForWriteResponse } from '../helpers/writeResponse';

// 専用ユーザーの作成（bcrypt）とログインに加え、並列負荷下でも goto＋タイル待ち＋
// API応答（前準備の beforeEach 含む）が予算切れしないよう、テストタイムアウトを延長する
test.describe.configure({ mode: 'serial', timeout: 90000 });

/** 本 spec 専用のユーザー（run 単位。理由は runScope.ts を参照／#793） */
const USER = {
  email: runScopedEmail('e2e-watchlist-page'),
  password: 'WatchlistPageE2e1',
} as const;

/** ウォッチリストAPIレスポンスを待つ */
function waitForWatchlistResponse(page: Page) {
  return waitForWriteResponse(page, {
    urlPart: '/api/watchlist',
    methods: ['POST', 'DELETE'],
    label: 'ウォッチリスト書き込み',
  });
}

/**
 * 視聴済みトグル（PATCH）のレスポンスを待つ
 *
 * PATCH は POST / DELETE と同じ `WRITE_WATCHLIST` カウンタを共有するため、
 * こちらも 429 になりうる。
 */
function waitForWatchedPatchResponse(page: Page) {
  return waitForWriteResponse(page, {
    urlPart: '/api/watchlist/',
    methods: ['PATCH'],
    label: '視聴済みの切り替え',
  });
}

/** 映画をウォッチリストに追加する（前準備用） */
async function addMovieToWatchlist(page: Page) {
  await page.goto('/movies/now-showing');
  await movieTiles(page).first().waitFor({ timeout: 30000 });

  const firstTile = movieTiles(page).first();
  const addButton = firstTile.getByRole('button', {
    name: 'ウォッチリストに追加',
  });
  const removeButton = firstTile.getByRole('button', {
    name: 'ウォッチリストから削除',
  });

  // ボタンがレンダリングされるまで待機
  await expect(addButton.or(removeButton)).toBeVisible({ timeout: 10000 });

  // 既に追加済みの場合はスキップ
  const isAddVisible = await addButton.isVisible().catch(() => false);
  if (isAddVisible) {
    const responsePromise = waitForWatchlistResponse(page);
    await addButton.click();
    await responsePromise;
    // 追加完了を確認
    await expect(removeButton).toBeVisible({ timeout: 10000 });
  }
}

/** ウォッチリストページを開き、取得完了まで待つ */
async function gotoWatchlistPage(page: Page) {
  const dataPromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/watchlist') &&
      res.request().method() === 'GET' &&
      res.status() === 200,
    { timeout: 30000 },
  );
  await page.goto('/watchlist');
  await dataPromise;
  await expect(
    page.getByRole('heading', { name: 'ウォッチリスト' }),
  ).toBeVisible({ timeout: 15000 });
}

/**
 * お気に入りの評価モーダル。
 * 未登録なら「お気に入りに追加」、登録済みなら「お気に入りを編集」で開くため、
 * どちらにも当たる形で取る
 */
function favoriteRatingModal(page: Page) {
  return page.getByRole('dialog', { name: /お気に入り(に追加|を編集)/ });
}

/** 一覧の先頭を視聴済みにし、開いた評価モーダルを閉じる。対象のタイトルを返す */
async function markFirstAsWatched(page: Page): Promise<string> {
  const watchedButton = page
    .getByRole('button', { name: /を視聴済みにする$/ })
    .first();
  await expect(watchedButton).toBeVisible({ timeout: 30000 });

  const label = await watchedButton.getAttribute('aria-label');
  const title = (label ?? '').replace(/を視聴済みにする$/, '');

  const patchResponse = waitForWatchedPatchResponse(page);
  await watchedButton.click();
  await patchResponse;

  // 視聴済みにするとお気に入りの評価モーダルが開く。登録せずに閉じる
  const ratingModal = favoriteRatingModal(page);
  await expect(ratingModal).toBeVisible({ timeout: 15000 });
  await ratingModal.getByRole('button', { name: 'キャンセル' }).click();
  await expect(ratingModal).not.toBeVisible();

  return title;
}

test.describe('ウォッチリスト', () => {
  /** ログインを1回で済ませるため、spec 全体で1つのページを使い回す */
  let session: DedicatedSession;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    // describe の timeout はテストにしか効かない
    testInfo.setTimeout(90000);

    session = await openDedicatedSession(browser, USER);
    page = session.page;

    // ページを使い回すため、詳細モーダルのモックは1度だけ登録する
    // （beforeEach で呼ぶとハンドラが積み上がる）
    await mockMovieDetail(page);
  });

  test.afterAll(async () => {
    await session.close();
  });

  test.beforeEach(async () => {
    await cleanupWatchlistForUser(session.userId);
    await addMovieToWatchlist(page);
  });

  test('ウォッチリストページに映画が表示され、クリックで詳細モーダルが開く', async () => {
    await gotoWatchlistPage(page);

    // ウォッチリストに映画が表示されている
    const detailButton = page
      .locator('[class*="c_watchlist_tile"][role="button"]')
      .first();
    await expect(detailButton).toBeVisible({ timeout: 10000 });

    // タイルクリックで詳細モーダルが開く
    await detailButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByText('詳細情報')).toBeVisible({ timeout: 15000 });

    // モーダルを閉じる
    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('ウォッチリストページで削除すると映画が消える', async () => {
    await gotoWatchlistPage(page);

    // 削除ボタンをクリック
    const deleteButton = page
      .getByRole('button', { name: /をウォッチリストから削除/ })
      .first();
    await expect(deleteButton).toBeVisible({ timeout: 10000 });

    const responsePromise = waitForWatchlistResponse(page);
    await deleteButton.click();
    await responsePromise;

    // 空状態メッセージが表示される
    await expect(
      page.getByText('ウォッチリストに映画を追加しましょう'),
    ).toBeVisible({ timeout: 10000 });
  });

  test('サイドバーの「すべて見る」クリックでウォッチリストページに遷移する', async () => {
    // サイドバーが表示されるページに遷移
    await page.goto('/movies/now-showing');
    await movieTiles(page).first().waitFor({ timeout: 30000 });

    // サイドバーに「すべて見る」リンクが表示される
    const showAllLink = page.getByRole('link', { name: 'すべて見る' });
    await expect(showAllLink).toBeVisible({ timeout: 15000 });

    // クリックでウォッチリストページに遷移
    await showAllLink.click();
    await page.waitForURL('/watchlist');

    // ウォッチリストページが表示される
    await expect(
      page.getByRole('heading', { name: 'ウォッチリスト' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('視聴済みにすると評価モーダルが開き、閉じても視聴済みが残る', async () => {
    await page.goto('/watchlist');
    await markFirstAsWatched(page);

    await expect(page.getByText('視聴済み')).toBeVisible({ timeout: 15000 });

    // リロードしても維持される
    await page.reload();
    await expect(page.getByText('視聴済み')).toBeVisible({ timeout: 30000 });
  });

  test('視聴済みはサイドバーと公開カレンダーから消える', async () => {
    await page.goto('/watchlist');
    const title = await markFirstAsWatched(page);

    // サイドバーの「公開日が近い映画」から消える
    const sidebar = page.getByRole('complementary');
    await expect(
      sidebar.getByRole('button', { name: title, exact: true }),
    ).toHaveCount(0, { timeout: 15000 });

    // 公開カレンダーからも消える
    await page.getByRole('button', { name: '公開カレンダーを開く' }).click();
    const calendar = page.getByRole('dialog', { name: '公開カレンダー' });
    await expect(calendar.getByText('読み込み中...')).not.toBeVisible({
      timeout: 15000,
    });
    await expect(calendar.getByText(title, { exact: true })).toHaveCount(0);
  });

  test('視聴済みを解除すると元に戻る', async () => {
    await page.goto('/watchlist');
    await markFirstAsWatched(page);

    const unmarkButton = page
      .getByRole('button', { name: /を未視聴に戻す$/ })
      .first();
    await expect(unmarkButton).toBeVisible({ timeout: 15000 });

    const unmarkResponse = waitForWatchedPatchResponse(page);
    await unmarkButton.click();
    await unmarkResponse;

    // バッジが消え、視聴済みボタンに戻る
    await expect(page.getByText('視聴済み')).toHaveCount(0, { timeout: 15000 });
    await expect(
      page.getByRole('button', { name: /を視聴済みにする$/ }).first(),
    ).toBeVisible();
  });
});
