/**
 * 視聴済みにした作品の登録状況 E2Eテスト（#1145）
 *
 * ウォッチリストの登録済み判定は、長いあいだ react-query のキャッシュを
 * 総なめするだけだった。そのキャッシュを埋めているのはサイドバーのパネルで、
 * **公開日が近い未視聴の上位10件**（`limit: 10` / `excludeWatched: true`）しか
 * 読まない。そのため視聴済みにした作品はキャッシュから落ち、一覧や検索では
 * 登録済みなのに「＋」のまま表示されていた。押すと楽観的な成功トーストの直後に
 * 409 のエラートーストが重なる。
 *
 * ⚠️ **結合テストでは捕まえられない。** 原因は「どのクエリがキャッシュを
 * 埋めるか」という画面をまたいだ組み合わせにあり、フック単体では
 * パネルの取得条件を再現できない。視聴済みにする操作と、それを別画面で
 * 確認する操作の両方が要る。
 *
 * ⚠️ 共有の `TEST_USER` は使わない（#806）。ウォッチリストを削除しながら
 * 進めるため、同じユーザーを使う spec を並列実行時に壊す。
 */

import { test, expect, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import { cleanupWatchlistForUser } from '../helpers/api';
import { movieTiles, watchedToggles } from '../helpers/locators';
import { runScopedEmail } from '../helpers/runScope';
import { waitForWriteResponse } from '../helpers/writeResponse';

/** 専用ユーザーの作成（bcrypt）とログインを含むので既定の30秒では足りない */
test.describe.configure({ mode: 'serial', timeout: 90000 });

/** 本 spec 専用のユーザー（run 単位。理由は runScope.ts を参照／#793） */
const USER = {
  email: runScopedEmail('e2e-watchlist-watched-state'),
  password: 'WatchlistWatchedE2e1',
} as const;

/** ウォッチリストAPIの書き込みレスポンスを待つ */
function waitForWatchlistWrite(page: Page) {
  return waitForWriteResponse(page, {
    urlPart: '/api/watchlist',
    methods: ['POST', 'DELETE', 'PATCH'],
    label: 'ウォッチリスト書き込み',
  });
}

/**
 * 視聴済みにした直後に開く評価モーダルを閉じる
 *
 * `watchlistPage.tsx` の `handleWatchedToggle` は、視聴済みにしたときだけ
 * お気に入りモーダルを開く（観た作品の評価を促す導線）。
 *
 * ⚠️ **閉じないと以降のアサーションが全部落ちる。** Radix のダイアログは
 * 背景を `aria-hidden` にするため、`getByRole` から背後のボタンが見えなくなる。
 * 「視聴済みに変わったか」の確認すら取れない
 */
async function dismissRatingPrompt(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'お気に入りに追加' });
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await dialog.getByRole('button', { name: '閉じる' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10000 });
}

test.describe('視聴済みにした作品の登録状況', () => {
  /** ログインを1回で済ませるため、spec 全体で1つのページを使い回す */
  let session: DedicatedSession;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    // describe の timeout はテストにしか効かない
    testInfo.setTimeout(90000);

    session = await openDedicatedSession(browser, USER);
    page = session.page;
  });

  test.afterAll(async () => {
    await session.close();
  });

  test.beforeEach(async () => {
    await cleanupWatchlistForUser(session.userId);
  });

  test('視聴済みにしても一覧で「登録済み」のままになる', async () => {
    await page.goto('/movies/now-showing');
    await movieTiles(page).first().waitFor({ timeout: 30000 });

    // 作品名で引き直せるようにしておく。一覧の並びは TMDb 由来のデータで
    // 決まるため、位置（first）で決め打ちすると画面を往復した後に
    // 別の作品を指しうる
    const firstTile = movieTiles(page).first();
    const title = (
      await firstTile
        .locator('[class*="c_movie_tile__title_link"]')
        .first()
        .innerText()
    ).trim();
    expect(title.length).toBeGreaterThan(0);

    // --- 1. 一覧から追加する ---
    const added = waitForWatchlistWrite(page);
    await firstTile
      .getByRole('button', { name: 'ウォッチリストに追加' })
      .click();
    await added;
    await expect(
      firstTile.getByRole('button', { name: 'ウォッチリストから削除' }),
    ).toBeVisible({ timeout: 10000 });

    // --- 2. ウォッチリストで視聴済みにする ---
    await page.goto('/watchlist');
    const unwatchedToggle = watchedToggles(page, false).first();
    await expect(unwatchedToggle).toBeVisible({ timeout: 30000 });

    const watched = waitForWatchlistWrite(page);
    await unwatchedToggle.click();
    await watched;
    await dismissRatingPrompt(page);
    // 視聴済みへ変わったことを確かめてから次へ進む
    await expect(watchedToggles(page, true).first()).toBeVisible({
      timeout: 10000,
    });

    // --- 3. 一覧へ戻る（リロードしてキャッシュを捨てる） ---
    // ⚠️ ここが回帰の本体。サイドバーのパネルは視聴済みを除外して読むので、
    // キャッシュだけを見ていた頃はこの作品が「未登録」に落ちていた
    await page.goto('/movies/now-showing');
    await movieTiles(page).first().waitFor({ timeout: 30000 });

    const tile = movieTiles(page).filter({
      has: page.locator('[class*="c_movie_tile__title_link"]', {
        hasText: title,
      }),
    });
    await expect(tile).toHaveCount(1, { timeout: 15000 });

    await expect(
      tile.getByRole('button', { name: 'ウォッチリストから削除' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      tile.getByRole('button', { name: 'ウォッチリストに追加' }),
    ).toHaveCount(0);
  });

  /**
   * 誤表示されたボタンを押すと、楽観的な成功トーストの直後に
   * 追加APIが 409（ALREADY_EXISTS）を返してエラートーストが重なっていた。
   *
   * 「＋が出ない」ことは上のテストで見ているので、ここでは
   * **押したときに追加リクエストが飛ばない**ことを直接見る
   */
  test('視聴済みの作品を押しても追加リクエストが飛ばない', async () => {
    await page.goto('/movies/now-showing');
    await movieTiles(page).first().waitFor({ timeout: 30000 });

    const firstTile = movieTiles(page).first();
    const added = waitForWatchlistWrite(page);
    await firstTile
      .getByRole('button', { name: 'ウォッチリストに追加' })
      .click();
    await added;

    await page.goto('/watchlist');
    const unwatchedToggle = watchedToggles(page, false).first();
    await expect(unwatchedToggle).toBeVisible({ timeout: 30000 });
    const watched = waitForWatchlistWrite(page);
    await unwatchedToggle.click();
    await watched;
    await dismissRatingPrompt(page);

    await page.goto('/movies/now-showing');
    await movieTiles(page).first().waitFor({ timeout: 30000 });

    // 追加APIが飛んだら記録する
    const addRequests: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/watchlist'
      ) {
        addRequests.push(request.url());
      }
    });

    const removeButton = page
      .getByRole('button', { name: 'ウォッチリストから削除' })
      .first();
    await expect(removeButton).toBeVisible({ timeout: 15000 });
    await removeButton.click();

    // 削除は飛んでよい。飛んではいけないのは追加
    await page.waitForTimeout(2000);
    expect(addRequests).toEqual([]);

    // 409 のエラートーストも出ない
    await expect(
      page.getByText('ウォッチリストへの追加に失敗しました'),
    ).toHaveCount(0);
  });
});
