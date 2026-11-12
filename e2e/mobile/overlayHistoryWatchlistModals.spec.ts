/**
 * アプリ側が `open` を直接 false にするオーバーレイの履歴エントリ E2Eテスト（SP幅）
 *
 * #1052 で畳む条件を「Radix の閉じ方を通ったか」から「自分のエントリが
 * 最前面か」に変えたため、`setIsOpen(false)` / `closeModal()` のような
 * アプリ側の閉じ方も畳まれるようになった。**その代表2つを固定する**（#1043 の残件）。
 *
 * | オーバーレイ | 閉じ方 | 実装 |
 * | --- | --- | --- |
 * | 評価モーダル | 登録・削除 | `useFavoriteToggle` の `closeModal()` |
 * | 整理モーダル | キャンセル・削除完了 | `watchlistCleanupModal` の `onOpenChange(false)` |
 *
 * 判定は「URL が変わらないこと」ではなく **「戻る1回で前のページへ出られること」**
 * で行う。畳まれなかったエントリは開いた時点と同じ URL なので、URL だけ見ても
 * 空振りは見つからない（#1043）。
 *
 * ⚠️ 共有の `TEST_USER` は使わない。ウォッチリストとお気に入りを全件削除しながら
 * 進めるため、同じユーザーを使う他の spec を並列実行時に壊す
 * （watchlistCleanup.spec.ts と同じ理由）。
 */

import { test, expect, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import {
  cleanupFavoritesForUser,
  cleanupWatchlistForUser,
} from '../helpers/api';
import { expectEntryExists, waitForFold } from '../helpers/overlayHistory';
import { runScopedEmail } from '../helpers/runScope';
import {
  addMovieToWatchlist,
  cleanupModal,
  markWatched,
  ratingModal,
  registerFavoriteFromRatingModal,
} from '../helpers/watchlistFlows';
import { waitForWriteResponse } from '../helpers/writeResponse';

test.describe.configure({ mode: 'serial', timeout: 120000 });

const USER = {
  email: runScopedEmail('e2e-overlay-history-modals'),
  password: 'OverlayHistoryModals1',
} as const;

/** 専用セッションは browser.newContext で開くため、幅は明示的に当てる */
const SP_VIEWPORT = { width: 375, height: 812 } as const;

/** 「戻る1回で出られること」を見るための1つ前のページ */
const PREVIOUS_PAGE = '/movies/upcoming';

/**
 * 1つ前のページを積んでから対象ページを開く。
 *
 * 前準備でオーバーレイを開け閉てしていても、ここで積み直すので
 * 「戻る1回で `PREVIOUS_PAGE` へ出る」が前準備の履歴に影響されない。
 *
 * ⚠️ `page.goto` は**同一 URL だと push ではなく replace** になる。
 * 既に `PREVIOUS_PAGE` にいると1つ前が積まれず、各テストの最後の
 * `goBack()` が別のエントリへ着いてしまうので、前提として弾く
 */
async function openWithPreviousPage(page: Page, path: string): Promise<void> {
  expect(
    new URL(page.url()).pathname,
    `${PREVIOUS_PAGE} にいる状態では1つ前を積めません`,
  ).not.toBe(PREVIOUS_PAGE);

  await page.goto(PREVIOUS_PAGE);
  await page.goto(path);
}

/**
 * 視聴済みの作品が1件だけある状態にする（評価モーダルは閉じた状態）
 *
 * 前準備で開いたモーダルの畳みは**非同期**なので、終わるまで待ってから返す。
 * 待たずに次の `goto` を出すと、畳みが途中のまま履歴が動いて偽の失敗になる
 */
async function prepareWatchedMovie(session: DedicatedSession): Promise<void> {
  const { page } = session;

  await cleanupWatchlistForUser(session.userId);
  await cleanupFavoritesForUser(session.userId);
  await addMovieToWatchlist(page);

  await page.goto('/watchlist');
  await markWatched(page);
  await ratingModal(page).getByRole('button', { name: 'キャンセル' }).click();
  await expect(ratingModal(page)).not.toBeVisible();
  await waitForFold(page);
}

test.describe('アプリ側で閉じるオーバーレイの戻る', () => {
  let session: DedicatedSession;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(120000);
    session = await openDedicatedSession(browser, USER);
    page = session.page;
    await page.setViewportSize(SP_VIEWPORT);
  });

  test.afterAll(async () => {
    await session.close();
  });

  /** `useFavoriteToggle` の `handleModalSubmit` → `closeModal()` */
  test('評価モーダルを「登録」で閉じたあと、戻る1回で前のページへ出る', async () => {
    await cleanupWatchlistForUser(session.userId);
    await cleanupFavoritesForUser(session.userId);
    await addMovieToWatchlist(page);

    await openWithPreviousPage(page, '/watchlist');
    await markWatched(page);

    const modal = ratingModal(page);
    // 閉じる前に実在を固定する。無いまま進むと waitForFold が素通りする
    await expectEntryExists(page);

    await registerFavoriteFromRatingModal(page);
    await expect(modal).not.toBeVisible();
    await waitForFold(page);

    await page.goBack();

    await expect(page).toHaveURL(/\/movies\/upcoming/);
  });

  /** `useFavoriteToggle` の `handleDelete` → `closeModal()` */
  test('評価モーダルを「削除」で閉じたあと、戻る1回で前のページへ出る', async () => {
    await cleanupWatchlistForUser(session.userId);
    await cleanupFavoritesForUser(session.userId);
    await addMovieToWatchlist(page);

    // 削除ボタンは登録済み（編集モード）のときだけ出る
    await page.goto('/watchlist');
    await markWatched(page);
    await registerFavoriteFromRatingModal(page);
    await waitForFold(page);

    await openWithPreviousPage(page, '/favorites');

    await page
      .getByRole('button', { name: 'お気に入りを編集' })
      .first()
      .click();

    const modal = ratingModal(page);
    await expect(modal).toBeVisible({ timeout: 15000 });
    await expectEntryExists(page);

    const removed = waitForWriteResponse(page, {
      urlPart: '/api/favorites',
      methods: ['DELETE'],
      label: 'お気に入り削除',
    });
    await modal.getByRole('button', { name: '削除' }).click();
    await removed;

    await expect(modal).not.toBeVisible();
    await waitForFold(page);

    await page.goBack();

    await expect(page).toHaveURL(/\/movies\/upcoming/);
  });

  /** `watchlistCleanupModal` の `handleCancel` → `onOpenChange(false)` */
  test('整理モーダルを「キャンセル」で閉じたあと、戻る1回で前のページへ出る', async () => {
    await prepareWatchedMovie(session);

    await openWithPreviousPage(page, '/watchlist');
    await page.getByRole('button', { name: '視聴済みを整理' }).click();

    const modal = cleanupModal(page);
    await expect(modal).toBeVisible({ timeout: 15000 });
    // 視聴済みが1件も無いとフッター（キャンセル）が描画されない
    await expect(modal.getByRole('button', { name: 'キャンセル' })).toBeVisible(
      { timeout: 15000 },
    );
    await expectEntryExists(page);

    await modal.getByRole('button', { name: 'キャンセル' }).click();

    await expect(modal).not.toBeVisible();
    await waitForFold(page);

    await page.goBack();

    await expect(page).toHaveURL(/\/movies\/upcoming/);
  });

  /** `watchlistCleanupModal` の `handleDeleted` → `onOpenChange(false)` */
  test('整理モーダルで削除を完了したあと、戻る1回で前のページへ出る', async () => {
    await prepareWatchedMovie(session);

    await openWithPreviousPage(page, '/watchlist');
    await page.getByRole('button', { name: '視聴済みを整理' }).click();

    const modal = cleanupModal(page);
    await expect(modal).toBeVisible({ timeout: 15000 });

    const deleteButton = modal.getByRole('button', { name: /件を削除する$/ });
    await expect(deleteButton).toBeEnabled({ timeout: 15000 });
    await expectEntryExists(page);

    const deleted = waitForWriteResponse(page, {
      urlPart: '/api/watchlist/bulk-delete',
      methods: ['POST'],
      label: '一括削除',
    });
    await deleteButton.click();
    await deleted;

    await expect(modal).not.toBeVisible({ timeout: 15000 });
    await waitForFold(page);

    await page.goBack();

    await expect(page).toHaveURL(/\/movies\/upcoming/);
  });
});
