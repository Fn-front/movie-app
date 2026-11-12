/**
 * オーバーレイの履歴エントリ E2Eテスト（SP幅）
 *
 * `useOverlayHistory`（#1026）はオーバーレイを開くあいだ履歴エントリを1つ積む。
 * 閉じ方によってそのエントリが畳まれずに残ると、**戻るを押しても何も起きない
 * 「空振り」**になる（#1043）。
 *
 * 判定は「URL が変わらないこと」ではなく **「戻る1回で前のページへ出られること」**
 * で行う。前者は空振りエントリを検出できない（#1043 の「なぜ既存テストで
 * 検知できないか」を参照）。
 */

import type { Page } from '@playwright/test';

import { ARIA_LABELS } from '@/constants';
import { test, expect } from '../fixtures/auth';
import {
  clickOutsideDialog,
  expectEntryExists,
  waitForFold,
} from '../helpers/overlayHistory';

test.use({ viewport: { width: 375, height: 812 } });

/** 一覧タイルの実体（スケルトン・子要素を除く） */
const TILE_SELECTOR =
  '[class*="c_card"][class*="c_movie_tile"]:not([class*="c_movie_tile_skeleton"])';

/** 絞り込み中を示すバッジ */
const FILTER_BADGE_SELECTOR = '[class*="filter_count"]';

/** 一覧が描画されるまで待つ（データ0件でも先へ進む） */
const waitForList = (page: Page) =>
  page
    .locator(TILE_SELECTOR)
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false);

/** 積まれている履歴エントリ数 */
const historyLength = (page: Page) => page.evaluate(() => history.length);

/**
 * オーバーレイの開閉で履歴エントリが増えていないことを確かめる。
 *
 * URL だけ見ても空振りエントリは見つからない。残ったエントリは
 * オーバーレイを開いた時点と同じ URL だからで、戻っても URL は
 * 期待どおりに見える（#1043）。
 *
 * ⚠️ `history.length` は戻っても減らない（前方のエントリが残る）。
 * **まだ一度も戻っていない区間でだけ**使えること
 */
const expectNoGhostEntry = async (
  page: Page,
  before: number,
  expectedGrowth: number,
) => {
  // ドロワーの cleanup は遷移の後に走る。落ち着くまで待つ
  await expect.poll(() => historyLength(page)).toBe(before + expectedGrowth);
};

// 「畳み終わるまで待つ」「エントリの実在を固定する」「外側クリック」は
// `e2e/helpers/overlayHistory.ts` に置いている（同じ判定を使う spec が複数あるため）

test.describe('オーバーレイを閉じたあとの戻る', () => {
  test('ドロワーのナビリンクで遷移したあと、戻る1回で前のページへ出る', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/upcoming');
    await waitForList(page);
    const before = await historyLength(page);

    // ドロワーは pathname の変化で閉じるため Radix の onOpenChange を通らない。
    // 積んだエントリが残ると、ここで空振りが1回増える
    await page.getByRole('button', { name: ARIA_LABELS.OPEN_MENU }).click();
    await page.getByRole('link', { name: '公開中' }).click();
    await page.waitForURL(/\/movies\/now-showing/);

    // 増えてよいのは遷移の1つだけ
    await expectNoGhostEntry(page, before, 1);

    await page.goBack();

    await expect(page).toHaveURL(/\/movies\/upcoming/);
  });

  test('映画詳細を × で閉じたあと、戻る1回で前のページへ出る', async ({
    authenticatedPage: page,
  }) => {
    // 従来どおり畳まれる経路。回帰で壊さないことを固定する
    await page.goto('/movies/upcoming');
    await waitForList(page);
    await page.goto('/movies/now-showing');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    await page
      .locator('button[class*="movie_tile__title_button"]')
      .first()
      .click();

    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 15000 });

    await dialog.getByRole('button', { name: ARIA_LABELS.CLOSE }).click();
    await expect(dialog).not.toBeVisible();
    await waitForFold(page);

    await page.goBack();

    await expect(page).toHaveURL(/\/movies\/upcoming/);
  });

  /**
   * 外側クリックは Radix の `onPointerDownOutside` を通るので、× や Esc と
   * 同じく畳まれる側の経路。#1052 で畳む条件を「閉じ方」から
   * 「自分のエントリが最前面か」に変えたため、**従来どおり畳まれることを
   * 固定しておく**（#1043 の完了条件「×・Esc・外側クリックの挙動が従来どおり」）。
   *
   * リポジトリ全体で外側クリックを押す E2E はこれが最初の1本
   */
  test('フィルターを外側クリックで閉じたあと、戻る1回で前のページへ出る', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/upcoming');
    await waitForList(page);
    await page.goto('/movies/now-showing');
    await waitForList(page);

    await page.getByRole('button', { name: 'フィルター' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // 閉じる前に実在を固定する。無いまま進むと waitForFold が素通りする
    await expectEntryExists(page);

    await clickOutsideDialog(page, dialog);
    await expect(dialog).not.toBeVisible();
    await waitForFold(page);

    await page.goBack();

    await expect(page).toHaveURL(/\/movies\/upcoming/);
  });

  /**
   * ログイン誘導と同じ「閉じると同時に別のオーバーレイが開く」型。
   * こちらは Radix の外（zustand ではなく親の state）で開くので、
   * 引き継ぎが効くかを別途固定しておく
   */
  test('公開カレンダーが開いている状態で戻ると、カレンダーだけが閉じる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');
    await waitForList(page);

    await page.getByRole('button', { name: ARIA_LABELS.OPEN_MENU }).click();
    await page.getByRole('button', { name: ARIA_LABELS.OPEN_CALENDAR }).click();

    const calendar = page.getByRole('dialog').last();
    await expect(calendar).toBeVisible();
    await expectEntryExists(page);

    await page.goBack();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/movies\/now-showing/);
  });

  /**
   * フィルターの「適用」は閉じるのと同時に `router.replace` で URL を変える。
   * 畳む処理（非同期の `history.back()`）がその更新を打ち消さないこと。
   *
   * 戻ったときに URL と絞り込み状態が食い違う件（#1043 の手順④）は
   * `useMovieList` が URL 変更に追従しないという別の原因なので、
   * ここでは見ない
   */
  test('フィルターを適用しても URL の更新が取り消されない', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    await page.getByRole('button', { name: 'フィルター' }).click();

    const filterDialog = page.getByRole('dialog');
    await expect(filterDialog).toBeVisible();
    await filterDialog.getByText('アクション').first().click();
    await filterDialog.getByRole('button', { name: '適用' }).click();

    await expect(page).toHaveURL(/genre_ids=/);
    await expect(page.locator(FILTER_BADGE_SELECTOR)).toBeVisible();
  });
});

/**
 * ログイン誘導は未認証でしか出ない。
 * chromium プロジェクトは既定で認証済みの storageState を当てているため、
 * ここだけ空にする
 */
test.describe('未認証のログイン誘導を閉じたあとの戻る', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /**
   * 「閉じるのと同時に別のオーバーレイが開く」経路。
   *
   * ドロワーを畳むための `history.back()` は非同期なので、素直に畳むと
   * **その後に積まれたログイン誘導のエントリが捨てられる**。戻ると
   * モーダルが閉じるのではなくページごと離脱し、#1026 が直した問題が
   * そのまま戻る（実測で確認）。
   *
   * 「閉じたあと戻る」だけを見ていると、エントリが消えていても
   * 期待どおりの URL に着いてしまい**気づけない**
   */
  test('ログイン誘導が開いている状態で戻ると、モーダルだけが閉じる', async ({
    page,
  }) => {
    await page.goto('/movies/upcoming');
    await waitForList(page);
    await page.goto('/movies/now-showing');
    await waitForList(page);

    await page.getByRole('button', { name: ARIA_LABELS.OPEN_MENU }).click();
    await page.getByRole('link', { name: 'ウォッチリスト' }).click();

    const prompt = page.getByRole('dialog').last();
    await expect(prompt).toBeVisible();
    // 引き継ぎが効いていないとエントリごと消える
    await expectEntryExists(page);

    await page.goBack();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/movies\/now-showing/);
  });

  /**
   * ログイン誘導から実際に遷移する経路。
   *
   * モーダルのエントリが無い状態で `router.replace` すると、置き換わるのは
   * **利用者の実ページ**で履歴が1つ失われる（旧実装で `/movies/upcoming`
   * まで飛ぶことを実測）
   */
  test('ログインへ進んで戻ると、誘導を出した画面へ戻る', async ({ page }) => {
    await page.goto('/movies/upcoming');
    await waitForList(page);
    await page.goto('/movies/now-showing');
    await waitForList(page);

    await page.getByRole('button', { name: ARIA_LABELS.OPEN_MENU }).click();
    await page.getByRole('link', { name: 'ウォッチリスト' }).click();

    const prompt = page.getByRole('dialog').last();
    await expect(prompt).toBeVisible();

    await prompt.getByRole('button', { name: 'ログイン' }).click();
    await page.waitForURL(/\/auth\/signin/);

    await page.goBack();

    await expect(page).toHaveURL(/\/movies\/now-showing/);
  });

  test('キャンセルで閉じたあと、戻る1回で前のページへ出る', async ({
    page,
  }) => {
    // 保護ルートを押すと遷移せずログイン誘導が出る。
    // このときドロワーとモーダルの2つがエントリを積む
    await page.goto('/movies/upcoming');
    await waitForList(page);
    await page.goto('/movies/now-showing');
    await waitForList(page);

    await page.getByRole('button', { name: ARIA_LABELS.OPEN_MENU }).click();
    await page.getByRole('link', { name: 'ウォッチリスト' }).click();

    const prompt = page.getByRole('dialog').last();
    await expect(prompt).toBeVisible();

    // × や Esc では畳まれるのに「キャンセル」だけ残る、という非対称を潰す
    await prompt.getByRole('button', { name: 'キャンセル' }).click();
    await expect(prompt).not.toBeVisible();
    await waitForFold(page);

    await page.goBack();

    await expect(page).toHaveURL(/\/movies\/upcoming/);
  });
});
