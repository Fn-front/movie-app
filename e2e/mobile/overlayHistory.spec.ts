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
import { filterButton, movieTileDetailLinks } from '../helpers/locators';
import { mockMovieDetail } from '../helpers/movieDetail';
import {
  clickOutsideDialog,
  expectEntryExists,
  waitForFold,
} from '../helpers/overlayHistory';
import { PERSON_ID, mockPersonDetail } from '../helpers/person';

test.use({ viewport: { width: 375, height: 812 } });

/** キャストから人物ページへ出る経路を固定するためのモック */
const CAST_NAME = 'E2Eテスト俳優';

const CAST = [
  {
    id: PERSON_ID,
    name: CAST_NAME,
    character: 'E2E役',
    profile_path: null,
    order: 0,
  },
];

/** カレンダーに必ず1件出すための作品名 */
const CALENDAR_MOVIE_TITLE = 'E2Eカレンダー作品';

/**
 * 公開カレンダーに作品が1件ある状態をモックで作る。
 *
 * カレンダーが出すのは**利用者のウォッチリストのうち、その月に公開される作品**
 * （`/api/watchlist/calendar`）。実データに頼ると、共有テストユーザーの
 * ウォッチリストが空の run で**テストが黙って skip される**ため固定する
 */
async function mockCalendarWithOneMovie(page: Page): Promise<void> {
  await page.route('**/api/watchlist/calendar*', async (route) => {
    const month = new URL(route.request().url()).searchParams.get('month');
    // 月が未指定のときは当月。FullCalendar が開く月に必ず載せる
    const target = month ?? new Date().toISOString().slice(0, 7);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          month: target,
          movies_by_date: {
            [`${target}-15`]: [
              {
                id: 'e2e-calendar-1',
                tmdb_movie_id: 550,
                title: CALENDAR_MOVIE_TITLE,
                poster_path: null,
                release_date: `${target}-15`,
                added_at: `${target}-01T00:00:00Z`,
              },
            ],
          },
        },
      }),
    });
  });
}

/** 一覧タイルの実体（スケルトン・子要素を除く） */
const TILE_SELECTOR =
  '[class*="c_card"][class*="c_movie_tile"]:not([class*="c_movie_tile_skeleton"])';

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

  /**
   * 映画詳細は `/movies/[id]` というURLを持つルートになった（#1033）。
   * 履歴エントリを積むのは**遷移そのもの**で、`useOverlayHistory` は使わない。
   *
   * 二重に積んでいると × で2つ分戻って一覧を飛び越すため、
   * 「× の直後が一覧」「戻る1回で前のページ」の2点で固定する
   */
  test('映画詳細を × で閉じたあと、戻る1回で前のページへ出る', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/upcoming');
    await waitForList(page);
    await page.goto('/movies/now-showing');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    await movieTileDetailLinks(page).first().click();
    await expect(page).toHaveURL(/movie_id=\d+/);

    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 15000 });

    await dialog.getByRole('button', { name: ARIA_LABELS.CLOSE }).click();
    await expect(dialog).not.toBeVisible();
    // × は router.back()。movie_id が外れて一覧だけになる
    await expect(page).toHaveURL(/\/movies\/now-showing$/);

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
    await page.goto('/movies/now-showing');

    // このテストが要るのは履歴エントリとフィルターボタンだけ。
    // ツールバーは一覧データと関係なく描画されるので、タイルは待たない
    // （`waitForList` は15秒待つので、2回で30秒のテスト予算を使い切る）
    await filterButton(page).waitFor({ timeout: 15000 });
    await filterButton(page).click();

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
   * カレンダーで作品を選ぶ経路（`useCalendarDialog` の `selectMovie`）。
   *
   * `setIsOpen(false)` と `setSelectedMovieId()` を同時に呼ぶので、**閉じるのと
   * 同時に映画詳細が開く**。#1052 はここで畳まずに**エントリを引き継ぐ**作りに
   * している。引き継ぎが効かないと、畳むための非同期 `back()` が詳細モーダルの
   * エントリを巻き込み、1回目の戻るでページごと離脱する
   */
  test('カレンダーで作品を選んだあと、戻るで詳細だけが閉じる', async ({
    authenticatedPage: page,
  }) => {
    await mockCalendarWithOneMovie(page);
    await mockMovieDetail(page);

    await page.goto('/movies/upcoming');
    await page.goto('/movies/now-showing');

    await page.getByRole('button', { name: ARIA_LABELS.OPEN_MENU }).click();
    await page.getByRole('button', { name: ARIA_LABELS.OPEN_CALENDAR }).click();
    await expect(page.getByRole('dialog').last()).toBeVisible();
    await expectEntryExists(page);

    // モックで1件だけ載せているので、一覧のボタンは必ずこれ1つ
    const movieButton = page
      .locator('button[class*="calendarMovieList__button"]')
      .first();
    // aria-label を外したので、名前は可視テキスト（作品名 + 公開日 +
    // 公開までの日数）から作られる（#1085）
    await expect(movieButton).toHaveAccessibleName(
      new RegExp(CALENDAR_MOVIE_TITLE),
    );

    await movieButton.click();

    // カレンダーが閉じて詳細が開く。エントリは引き継がれて残る
    const detail = page.getByRole('dialog').last();
    await expect(detail).toBeVisible({ timeout: 15000 });
    await expectEntryExists(page);

    await page.goBack();

    // 1回目は詳細が閉じるだけ。ページからは出ない
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/movies\/now-showing/);
    await waitForFold(page);

    await page.goBack();

    await expect(page).toHaveURL(/\/movies\/upcoming/);
  });

  /**
   * 映画詳細のキャストから人物ページへ出る経路。
   *
   * 詳細モーダルは一覧の URL に `?movie_id=` を足して開く（#1033）。
   * 戻ると詳細の URL へ戻り、**モーダルが開き直る**のが期待動作。
   *
   * ここで見ている不具合は3つ。
   * - 閉じる指示と遷移が競合して**人物ページへ行けない**ことがないか
   *   （`onRequestClose` で `router.back()` していたときに実測で再現した）
   * - 遷移先にモーダルが被さったまま残らないか
   * - 空振りのエントリが残っていないか（戻る3回で `/movies/upcoming` まで出る）
   */
  test('詳細のキャストから人物ページへ出たあと、戻るが空振りしない', async ({
    authenticatedPage: page,
  }) => {
    await mockMovieDetail(page, { credits: { cast: CAST } });
    await mockPersonDetail(page);

    await page.goto('/movies/upcoming');
    await page.goto('/movies/now-showing');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    await movieTileDetailLinks(page).first().click();
    await expect(page).toHaveURL(/movie_id=\d+/);
    await expect(page.getByRole('dialog').first()).toBeVisible({
      timeout: 15000,
    });

    await page
      // aria-label を外したので、名前は可視テキスト（俳優名 + 役名）になる（#1085）
      .getByRole('link', { name: new RegExp(CAST_NAME) })
      .click();
    await page.waitForURL(`/person/${PERSON_ID}`);

    // 遷移先にモーダルが残らない
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.goBack();

    // 詳細の URL へ戻り、モーダルが開き直る
    await expect(page).toHaveURL(/movie_id=\d+/);
    await expect(page.getByRole('dialog').first()).toBeVisible({
      timeout: 15000,
    });

    await page.goBack();

    await expect(page).toHaveURL(/\/movies\/now-showing$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.goBack();

    await expect(page).toHaveURL(/\/movies\/upcoming/);
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

    await filterButton(page).click();

    const filterDialog = page.getByRole('dialog');
    await expect(filterDialog).toBeVisible();
    await filterDialog.getByText('アクション').first().click();
    await filterDialog.getByRole('button', { name: '適用' }).click();

    await expect(page).toHaveURL(/genre_ids=/);
    await expect(filterButton(page)).toHaveAccessibleDescription('絞り込み中');
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
    // 閉じる前に実在を固定する。無いまま進むと waitForFold が素通りする
    await expectEntryExists(page);

    // × や Esc では畳まれるのに「キャンセル」だけ残る、という非対称を潰す
    await prompt.getByRole('button', { name: 'キャンセル' }).click();
    await expect(prompt).not.toBeVisible();
    await waitForFold(page);

    await page.goBack();

    await expect(page).toHaveURL(/\/movies\/upcoming/);
  });
});

/**
 * 戻るで閉じたオーバーレイを「進む」で開き直す（#1053）
 *
 * 戻るで閉じても**履歴エントリは消えていない**。進むでそれが復活したとき、
 * 以前はエントリだけ戻ってオーバーレイは閉じたままになり、
 * **次の戻るが空振り**していた。
 *
 * ⚠️ **`goForward()` を使うテストはこれが最初**。進む方向は E2E に1本も
 * 無かったため、この空振りは誰も踏んでいなかった。
 *
 * ⚠️ 映画詳細モーダルはここでは見ない。#1033 で `movie_id` を持つ URL に
 * なり、進むで URL ごと戻るため**フックを通らずに開き直る**（実測で確認）。
 * フックが面倒を見ているのはフィルターモーダルのような URL を持たない
 * オーバーレイのほう。
 */
/** 一覧ツールバーのフィルターボタン */
const filterButton = (page: Page) =>
  page.getByRole('button', { name: 'フィルター' });

test.describe('閉じたオーバーレイを進むで開き直す', () => {
  test('戻るで閉じたフィルターが、進むで開き直り、次の戻るで閉じる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');
    await filterButton(page).waitFor({ timeout: 15000 });

    await filterButton(page).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // 閉じる前に実在を固定する。無いまま進むと以降の判定が素通りする
    await expectEntryExists(page);

    await page.goBack();
    await expect(dialog).not.toBeVisible();

    // #1053: ここでエントリだけ戻り、モーダルは閉じたままだった
    await page.goForward();
    await expect(dialog).toBeVisible();

    // 開き直したあとの戻るが空振りしないこと。
    // ⚠️ ここを「URL が変わらないこと」で見てはいけない。このオーバーレイは
    // URL を変えないので、空振りしていても URL は同じに見える
    await page.goBack();
    await expect(dialog).not.toBeVisible();
  });

  /**
   * × で閉じた場合も同じ
   *
   * ⚠️ Issue 本文は「× で閉じればエントリを畳むので進む先が無い」と
   * していたが、**`history.back()` は前方のエントリを消さない**。
   * 実測で、× の直後に進むとエントリが復活する。戻るで閉じた場合と
   * まったく同じ空振りが起きていた
   */
  test('× で閉じたフィルターも、進むで開き直る', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');
    await filterButton(page).waitFor({ timeout: 15000 });

    await filterButton(page).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expectEntryExists(page);

    await dialog.getByRole('button', { name: ARIA_LABELS.CLOSE }).click();
    await expect(dialog).not.toBeVisible();
    await waitForFold(page);

    await page.goForward();
    await expect(dialog).toBeVisible();

    await page.goBack();
    await expect(dialog).not.toBeVisible();
  });
});
