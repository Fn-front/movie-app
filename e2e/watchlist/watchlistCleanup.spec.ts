/**
 * 視聴済みの一括削除 E2Eテスト（認証済み）
 * - 追加年を指定してまとめて削除 → 一覧から消える
 * - 視聴済みが1件も無いときの空状態
 *
 * ⚠️ 共有の `TEST_USER` は使わない。ウォッチリストを全件削除しながら進めるため、
 * 同じユーザーを使う他の spec を並列実行時に壊す（watchlist.spec.ts と同じ理由）。
 *
 * PR 用の証跡として docs/e2e-screenshots/ に撮る。ファイル名はシナリオ単位で
 * 固定しており、再実行時は上書きされる（.claude/CLAUDE.md の運用）。
 */

import { test, expect, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import { cleanupWatchlistForUser } from '../helpers/api';
import { movieTiles } from '../helpers/locators';
import { runScopedEmail } from '../helpers/runScope';
import { waitForWriteResponse } from '../helpers/writeResponse';

test.describe.configure({ mode: 'serial', timeout: 120000 });

const USER = {
  email: runScopedEmail('e2e-watchlist-cleanup'),
  password: 'WatchlistCleanupE2e1',
} as const;

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

  await expect(addButton.or(removeButton)).toBeVisible({ timeout: 10000 });

  const isAddVisible = await addButton.isVisible().catch(() => false);
  if (isAddVisible) {
    const responsePromise = waitForWriteResponse(page, {
      urlPart: '/api/watchlist',
      methods: ['POST'],
      label: 'ウォッチリスト追加',
    });
    await addButton.click();
    await responsePromise;
    await expect(removeButton).toBeVisible({ timeout: 10000 });
  }
}

test.describe('視聴済みの一括削除', () => {
  let session: DedicatedSession;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(120000);
    session = await openDedicatedSession(browser, USER);
    page = session.page;
  });

  test.afterAll(async () => {
    await session.close();
  });

  test('年を指定して視聴済みをまとめて削除できる', async () => {
    await cleanupWatchlistForUser(session.userId);
    await addMovieToWatchlist(page);

    // 視聴済みにする
    await page.goto('/watchlist');
    const watchButton = page
      .getByRole('button', { name: /を視聴済みにする$/ })
      .first();
    await expect(watchButton).toBeVisible({ timeout: 30000 });

    const patchResponse = waitForWriteResponse(page, {
      urlPart: '/api/watchlist/',
      methods: ['PATCH'],
      label: '視聴済みの切り替え',
    });
    await watchButton.click();
    await patchResponse;

    // 評価モーダルを閉じる
    const ratingModal = page.getByRole('dialog', {
      name: /お気に入り(に追加|を編集)/,
    });
    await expect(ratingModal).toBeVisible({ timeout: 15000 });
    await ratingModal.getByRole('button', { name: 'キャンセル' }).click();
    await expect(ratingModal).not.toBeVisible();

    await page.screenshot({
      path: 'docs/e2e-screenshots/watchlist-cleanup-toolbar.png',
    });

    // 整理モーダルを開く
    await page.getByRole('button', { name: '視聴済みを整理' }).click();

    const dialog = page.getByRole('dialog', {
      name: '視聴済みをまとめて削除',
    });
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // 年セレクトと削除ボタン（件数入り）が出る
    await expect(
      dialog.getByRole('combobox', { name: '追加年' }),
    ).toBeVisible();
    const deleteButton = dialog.getByRole('button', { name: /件を削除する$/ });
    await expect(deleteButton).toBeVisible();
    await expect(deleteButton).toBeEnabled();

    // 対象リストの行が描画されるまで待つ（読み込み中のまま撮らない）
    const rowCheckbox = dialog.getByRole('checkbox', {
      name: /を削除対象にする$/,
    });
    await expect(rowCheckbox).toHaveCount(1, { timeout: 15000 });

    // 削除対象のタイトルを控える（削除後に一覧から消えたことを見るため）
    const rowLabel = await rowCheckbox.first().getAttribute('aria-label');
    const targetTitle = (rowLabel ?? '').replace(/を削除対象にする$/, '');

    await page.screenshot({
      path: 'docs/e2e-screenshots/watchlist-cleanup-modal.png',
    });

    // 削除する
    const deleteResponse = waitForWriteResponse(page, {
      urlPart: '/api/watchlist/bulk-delete',
      methods: ['POST'],
      label: '一括削除',
    });
    await deleteButton.click();
    await deleteResponse;

    // モーダルが閉じ、一覧（main）から当該作品が消える。
    // サイドバーにも同じ空状態の文言があるため、main に限定して見る
    await expect(dialog).not.toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole('main').getByRole('heading', { name: targetTitle }),
    ).toHaveCount(0, { timeout: 15000 });

    await page.screenshot({
      path: 'docs/e2e-screenshots/watchlist-cleanup-after.png',
    });
  });

  test('視聴済みが無いときは空状態を出す', async () => {
    await cleanupWatchlistForUser(session.userId);
    await addMovieToWatchlist(page);
    await page.goto('/watchlist');

    await page.getByRole('button', { name: '視聴済みを整理' }).click();

    const dialog = page.getByRole('dialog', {
      name: '視聴済みをまとめて削除',
    });
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(
      dialog.getByText('整理できる視聴済みの作品がありません'),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      dialog.getByRole('button', { name: /件を削除する$/ }),
    ).toHaveCount(0);

    await page.screenshot({
      path: 'docs/e2e-screenshots/watchlist-cleanup-empty.png',
    });
  });
});
