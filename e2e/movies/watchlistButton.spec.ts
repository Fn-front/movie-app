/**
 * ウォッチリストボタン E2Eテスト（認証済み）
 * クリティカルユーザージャーニーのみ（ボタン表示・aria-label確認は結合テストに移行済み）
 * API呼び出し→状態更新→UI反映、モーダル↔タイル間の状態同期を検証
 * afterEachで全件クリーンアップするため、テスト内で「元に戻す」操作は不要
 *
 * ⚠️ 共有の `TEST_USER` は使わない（#806）。ウォッチリストを全件削除しながら
 * 進めるため、同じユーザーを使う `watchlist.spec.ts` などを並列実行時に壊す。
 * `describe.configure({ mode: 'serial' })` はファイル内の直列化しかせず、
 * ファイル間の並列は防げない。専用ユーザーを作って完結させる。
 */

import { test, expect, type Locator, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import { cleanupWatchlistForUser } from '../helpers/api';
import { movieTiles } from '../helpers/locators';
import { mockMovieDetail } from '../helpers/movieDetail';
import { runScopedEmail } from '../helpers/runScope';

/** 専用ユーザーの作成（bcrypt）とログインを含むので既定の30秒では足りない */
test.describe.configure({ mode: 'serial', timeout: 90000 });

/** 本 spec 専用のユーザー（run 単位。理由は runScope.ts を参照／#793） */
const USER = {
  email: runScopedEmail('e2e-watchlist-button'),
  password: 'WatchlistButtonE2e1',
} as const;

/**
 * ウォッチリストAPIレスポンスを待つ
 *
 * 待機条件にステータスを含めない。`status() < 500` で待つと 429（レート制限）や
 * 409（重複）が「成功」として解決し、UIが変わらないまま後続の要素待ちが
 * `element(s) not found` で落ちて原因が読めなくなる。5xx は述語に一致せず
 * タイムアウトになり、これも原因を指さない。
 * 解決後に `ok()` を検証して、失敗はステータス付きで落とす。
 */
async function waitForWatchlistResponse(page: Page) {
  const res = await page.waitForResponse(
    (r) =>
      r.url().includes('/api/watchlist') &&
      (r.request().method() === 'POST' || r.request().method() === 'DELETE'),
    { timeout: 30000 },
  );

  expect(
    res.ok(),
    `ウォッチリスト書き込みが失敗した（${res.status()} ${res.request().method()}）`,
  ).toBe(true);

  return res;
}

/**
 * ウォッチリストボタンをトグルし、ラベルが入れ替わることを確認する
 *
 * 専用ユーザーは毎回0件から始まるため「追加」側から始まるが、
 * 片方向だけを書くと将来の前提変更に気づけないため両方向を扱う。
 *
 * @param scope - ボタンを探す範囲（タイル or モーダル）
 */
async function toggleAndExpectLabelSwap(
  page: Page,
  scope: Locator,
): Promise<void> {
  const addButton = scope.getByRole('button', { name: 'ウォッチリストに追加' });
  const removeButton = scope.getByRole('button', {
    name: 'ウォッチリストから削除',
  });

  // ボタンがレンダリングされるまで待機
  await expect(addButton.or(removeButton)).toBeVisible({ timeout: 10000 });
  const wasAdded = await addButton.isVisible().catch(() => false);

  const responsePromise = waitForWatchlistResponse(page);
  await (wasAdded ? addButton : removeButton).click();
  await responsePromise;

  await expect(wasAdded ? removeButton : addButton).toBeVisible({
    timeout: 10000,
  });
}

test.describe('ウォッチリストボタン', () => {
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
    await page.goto('/movies/now-showing');
    await movieTiles(page).first().waitFor({ timeout: 30000 });
  });

  test('ウォッチリストボタンクリックでラベルが切り替わる', async () => {
    await toggleAndExpectLabelSwap(page, movieTiles(page).first());
  });

  test('モーダル内ウォッチリストボタンクリックでラベルが切り替わる', async () => {
    await movieTiles(page).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByText('詳細情報')).toBeVisible({ timeout: 15000 });

    await toggleAndExpectLabelSwap(page, dialog);
  });

  test('モーダルでウォッチリスト操作後、タイル側のボタンも同期される', async () => {
    const firstTile = movieTiles(page).first();

    const tileAddButton = firstTile.getByRole('button', {
      name: 'ウォッチリストに追加',
    });
    const tileRemoveButton = firstTile.getByRole('button', {
      name: 'ウォッチリストから削除',
    });
    // ボタンがレンダリングされるまで待機
    await expect(tileAddButton.or(tileRemoveButton)).toBeVisible({
      timeout: 10000,
    });
    const wasAdded = await tileAddButton.isVisible().catch(() => false);

    // モーダルを開く
    await firstTile.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByText('詳細情報')).toBeVisible({ timeout: 15000 });

    // モーダル内でトグル
    const modalButton = dialog.getByRole('button', {
      name: /ウォッチリスト/,
    });
    await expect(modalButton).toBeVisible({ timeout: 10000 });
    const responsePromise = waitForWatchlistResponse(page);
    await modalButton.click();
    await responsePromise;

    // モーダルを閉じる
    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog).not.toBeVisible();

    // タイル側のラベルが切り替わっていることを確認
    await expect(wasAdded ? tileRemoveButton : tileAddButton).toBeVisible({
      timeout: 10000,
    });
  });
});
