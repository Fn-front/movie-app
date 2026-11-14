/**
 * `/watchlist` `/favorites` のグリッド／リスト表示切替 E2Eテスト（認証済み・SP幅）
 *
 * デスクトップ幅のプロジェクトでは SP の一覧性を検証できないため、
 * `e2e/mobile/` に置く（#1049 / #1050。共通コンポーネント側は
 * `movieViewMode.spec.ts`）。
 *
 * ⚠️ 共有の `TEST_USER` は使わない（#806）。この spec はウォッチリストと
 * お気に入りへ**件数ぶんシードする**ため、同じユーザーを使う spec と
 * 並列実行時に食い合う。専用ユーザーを作って完結させる。
 */

import { test, expect, type Page } from '@playwright/test';

import { ARIA_LABELS, STORAGE_KEYS } from '@/constants';
import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import {
  seedFavoritesForUser,
  seedWatchedRatedWatchlistItemForUser,
  seedWatchlistForUser,
} from '../helpers/api';
import { runScopedEmail } from '../helpers/runScope';
import { expectTapAreaAtLeast } from '../helpers/tapTarget';

// 専用ユーザーの作成（bcrypt）とログイン、シード投入を含むためタイムアウトを延長する
test.describe.configure({ mode: 'serial', timeout: 90000 });

/** 本 spec 専用のユーザー（run 単位。理由は runScope.ts を参照／#793） */
const USER = {
  email: runScopedEmail('e2e-list-view'),
  password: 'ListViewE2e1',
} as const;

/** SP 表示幅 */
const SP_VIEWPORT_WIDTH = 375;

/** SP 表示高さ（iPhone X 相当） */
const SP_VIEWPORT_HEIGHT = 812;

/** リスト表示で1画面に収めたい最低件数（#1049 / #1050 の完了条件） */
const MIN_VISIBLE_ROWS = 6;

/** シードする件数。1画面に収まるかを見るので最低件数より多く積む */
const SEED_COUNT = 8;

/**
 * ウォッチリストのタイル（カード直下だけを引く）
 *
 * `movieViewMode.spec.ts` と違いスケルトンの除外は要らない。読み込み中に
 * 出るのは共通の `MovieTileSkeleton`（`c_movie_tile_skeleton`）で、
 * `c_watchlist_tile` には当たらない
 */
const WATCHLIST_TILE = '[class*="c_card"][class*="c_watchlist_tile"]';

/** お気に入りのタイル */
const FAVORITE_TILE = '[class*="c_card"][class*="c_favorite_tile"]';

/** リスト表示のタイル */
const WATCHLIST_LIST_TILE = `${WATCHLIST_TILE}[class*="watchlist_tile--list"]`;
const FAVORITE_LIST_TILE = `${FAVORITE_TILE}[class*="favorite_tile--list"]`;

/** 視聴済み＋評価ありの行に付ける点数 */
const RATED_SCORE = 8;

let session: DedicatedSession;

/** 視聴済み＋評価ありでシードした作品のタイトル */
let watchedRatedTitle: string;

/** 表示切替のトグル */
const viewToggle = (page: Page) =>
  page.getByRole('button', { name: ARIA_LABELS.LIST_VIEW });

/**
 * ビューポート内に全体が収まっているタイルの数
 *
 * 「1画面に何件入るか」は高さの実測でしか分からない。件数ではなく矩形で数える
 */
const countFullyVisibleTiles = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const viewportHeight = window.innerHeight;
    return Array.from(document.querySelectorAll(sel)).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= viewportHeight;
    }).length;
  }, selector);

/**
 * 表示モードをグリッドへ戻す（テスト間で設定を持ち越さない）
 *
 * ⚠️ **遷移の前に呼ぶこと。** `useMovieViewMode` は localStorage を
 * `useSyncExternalStore` で購読しているが、`removeItem` は購読者へ通知を
 * 出さない。表示中のページで消しても描画は変わらない
 */
const resetViewMode = (page: Page) =>
  page.evaluate(
    (key) => window.localStorage.removeItem(key),
    STORAGE_KEYS.MOVIE_VIEW_MODE,
  );

test.beforeAll(async ({ browser }, testInfo) => {
  testInfo.setTimeout(180000);

  session = await openDedicatedSession(browser, USER);
  await session.page.setViewportSize({
    width: SP_VIEWPORT_WIDTH,
    height: SP_VIEWPORT_HEIGHT,
  });

  await seedWatchlistForUser(session.userId, SEED_COUNT);
  await seedFavoritesForUser(session.userId, SEED_COUNT);
  // 評価が入った行は横幅がいちばん厳しい。素の行だけだと潰れを検知できない
  watchedRatedTitle = await seedWatchedRatedWatchlistItemForUser(
    session.userId,
    RATED_SCORE,
  );
});

test.afterAll(async () => {
  await session?.close();
});

test.describe('ウォッチリストの表示モード切替', () => {
  test.beforeEach(async () => {
    await resetViewMode(session.page);
    await session.page.goto('/watchlist');
    await expect(session.page.locator(WATCHLIST_TILE).first()).toBeVisible({
      timeout: 30000,
    });
  });

  test('グリッドとリストを行き来できる', async () => {
    const { page } = session;

    await expect(page.locator(WATCHLIST_LIST_TILE)).toHaveCount(0);
    await expect(viewToggle(page)).toHaveAttribute('aria-pressed', 'false');

    await viewToggle(page).click();

    await expect(page.locator(WATCHLIST_LIST_TILE).first()).toBeVisible();
    await expect(viewToggle(page)).toHaveAttribute('aria-pressed', 'true');

    // 戻せないと片道トグルになる
    await viewToggle(page).click();

    await expect(page.locator(WATCHLIST_LIST_TILE)).toHaveCount(0);
    await expect(viewToggle(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('リスト表示では1画面に6件以上が収まる', async () => {
    const { page } = session;

    await viewToggle(page).click();
    await expect(page.locator(WATCHLIST_LIST_TILE).first()).toBeVisible();

    // グリッドは1画面に2件しか入らない。リストで6件以上入ることが目的そのもの。
    // ツールバーに要素を足すと足りなくなるので、そのときはこのテストを見ること
    expect(
      await countFullyVisibleTiles(page, WATCHLIST_LIST_TILE),
    ).toBeGreaterThanOrEqual(MIN_VISIBLE_ROWS);
  });

  /**
   * 管理画面なので、行にしても操作が落ちてはいけない（#1049 の完了条件）。
   * 削除は破壊的操作なので、押せること自体は最後のテストで確かめる
   */
  test('リスト行でも視聴済みと削除のボタンが残る', async () => {
    const { page } = session;

    await viewToggle(page).click();

    const firstRow = page.locator(WATCHLIST_LIST_TILE).first();
    await expect(firstRow).toBeVisible();

    await expect(
      firstRow.getByRole('button', { name: /を視聴済みにする$/ }),
    ).toBeVisible();
    await expect(
      firstRow.getByRole('button', { name: /をウォッチリストから削除$/ }),
    ).toBeVisible();
  });

  test('リスト行は視覚の並びどおりにタブ移動できる', async () => {
    const { page } = session;

    await viewToggle(page).click();

    const firstRow = page.locator(WATCHLIST_LIST_TILE).first();
    await expect(firstRow).toBeVisible();

    // DOM 順（＝タブ順）が視覚の左右と食い違うと、1行ごとに
    // 右端のボタンから左のタイトルへ逆走する（WCAG 1.3.2 / 2.4.3）。
    //
    // ⚠️ **タイトルのリンク（`<a>`）を必ず含めること。** button だけを見ると、
    // 操作列を `__info` の前へ移しても2つのボタンは左→右のままなので、
    // 守りたい逆走そのものを検知できない
    const lefts = await firstRow.evaluate((tile) =>
      Array.from(tile.querySelectorAll('a, button')).map(
        (el) => el.getBoundingClientRect().left,
      ),
    );

    expect(lefts.length).toBeGreaterThan(2);
    for (let i = 1; i < lefts.length; i += 1) {
      expect(lefts[i]).toBeGreaterThanOrEqual(lefts[i - 1]);
    }
  });

  /**
   * 削除は破壊的操作なので、タップ領域（44×44）と隣接間隔を
   * ポスター重ねのときと同じ基準で保つ（#1017 / #1049 の完了条件）。
   *
   * ⚠️ 大きさは `boundingBox()` では測れない。`tap-target` mixin は
   * `::after` で広げるので、見た目の 28px しか返らない
   */
  test('リスト行の操作ボタンはタップ領域44×44があり、16px以上空く', async () => {
    const { page } = session;

    await viewToggle(page).click();

    const firstRow = page.locator(WATCHLIST_LIST_TILE).first();
    await expect(firstRow).toBeVisible();

    await expectTapAreaAtLeast(
      firstRow.getByRole('button', { name: /を視聴済みにする$/ }),
      'リスト行の視聴済みトグル',
    );
    await expectTapAreaAtLeast(
      firstRow.getByRole('button', { name: /をウォッチリストから削除$/ }),
      'リスト行の削除ボタン',
    );

    const gaps = await firstRow.evaluate((tile) => {
      const buttons = Array.from(tile.querySelectorAll('button'))
        .map((el) => el.getBoundingClientRect())
        // タイトルのリンクはカード全面の当たり判定なので除く（#719）
        .filter((rect) => rect.width > 0 && rect.width <= 44)
        .sort((a, b) => a.left - b.left);

      return buttons
        .slice(1)
        .map((rect, index) => rect.left - buttons[index].right);
    });

    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      // 44px のヒット領域は見た目 28px の左右へ 8px ずつはみ出す。
      // 16px 空けないと領域が重なり、DOM で後ろの削除が視聴済みを食う
      expect(gap).toBeGreaterThanOrEqual(44 - 28);
    }
  });

  /**
   * 評価は視聴済みの行にだけ出る。10段階のチップ（`sm` でも 258px）をそのまま
   * 置くと、情報欄（375px 幅で 213px）に収まらず**公開日が 0px まで潰れた**。
   * リストでは点数1つに畳んである（#1049）
   */
  test('評価のある行でも公開日が消えない', async () => {
    const { page } = session;

    await viewToggle(page).click();

    const ratedRow = page
      .locator(WATCHLIST_LIST_TILE)
      .filter({ hasText: watchedRatedTitle });
    await expect(ratedRow).toHaveCount(1);
    await expect(
      ratedRow.getByRole('img', { name: `評価: ${RATED_SCORE}/10` }),
    ).toBeVisible();

    const measured = await ratedRow.evaluate((row) => {
      const date = row.querySelector('[class*="c_watchlist_tile__date"]');
      const chips = Array.from(
        row.querySelectorAll('[class*="c_rating_indicator__item"]'),
      ).map((el) => el.getBoundingClientRect());

      return {
        dateWidth: date?.getBoundingClientRect().width ?? 0,
        dateText: date?.textContent ?? '',
        chips: chips.map((r) => ({ w: r.width, h: r.height })),
      };
    });

    expect(measured.dateText).not.toBe('');
    expect(measured.dateWidth).toBeGreaterThan(0);
    // 10個のままだと幅だけ縮んで非正方形に潰れる（実測 24 → 21.5px）
    expect(measured.chips).toHaveLength(1);
    expect(measured.chips[0].w).toBe(measured.chips[0].h);
  });

  // 破壊的操作なので、このブロックの最後に置く（以降の件数が1件減る）
  test('リスト行から削除できる', async () => {
    const { page } = session;

    await viewToggle(page).click();

    const rows = page.locator(WATCHLIST_LIST_TILE);
    const before = await rows.count();

    const deleted = page.waitForResponse(
      (response) =>
        response.url().includes('/api/watchlist/') &&
        response.request().method() === 'DELETE',
    );
    await rows
      .first()
      .getByRole('button', { name: /をウォッチリストから削除$/ })
      .click();
    await deleted;

    await expect(rows).toHaveCount(before - 1);
  });
});

test.describe('お気に入りの表示モード切替', () => {
  test.beforeEach(async () => {
    await resetViewMode(session.page);
    await session.page.goto('/favorites');
    await expect(session.page.locator(FAVORITE_TILE).first()).toBeVisible({
      timeout: 30000,
    });
  });

  test('グリッドとリストを行き来できる', async () => {
    const { page } = session;

    await expect(page.locator(FAVORITE_LIST_TILE)).toHaveCount(0);
    await expect(viewToggle(page)).toHaveAttribute('aria-pressed', 'false');

    await viewToggle(page).click();

    await expect(page.locator(FAVORITE_LIST_TILE).first()).toBeVisible();
    await expect(viewToggle(page)).toHaveAttribute('aria-pressed', 'true');

    await viewToggle(page).click();

    await expect(page.locator(FAVORITE_LIST_TILE)).toHaveCount(0);
    await expect(viewToggle(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('リスト表示では1画面に6件以上が収まる', async () => {
    const { page } = session;

    await viewToggle(page).click();
    await expect(page.locator(FAVORITE_LIST_TILE).first()).toBeVisible();

    expect(
      await countFullyVisibleTiles(page, FAVORITE_LIST_TILE),
    ).toBeGreaterThanOrEqual(MIN_VISIBLE_ROWS);
  });

  // #1050 の完了条件「リスト行でも評価の表示と編集が維持される」
  test('リスト行でも評価が見えて編集モーダルを開ける', async () => {
    const { page } = session;

    await viewToggle(page).click();

    const firstRow = page.locator(FAVORITE_LIST_TILE).first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.getByRole('img', { name: /評価:/ })).toBeVisible();

    // 10段階のチップのままだと、情報欄に収まらず幅だけ縮んで潰れる
    // （実測 24 → 21.5px、320px では 16px）。リストは点数1つに畳む（#1050）
    const chips = await firstRow.evaluate((row) =>
      Array.from(
        row.querySelectorAll('[class*="c_rating_indicator__item"]'),
      ).map((el) => {
        const rect = el.getBoundingClientRect();
        return { w: rect.width, h: rect.height };
      }),
    );
    expect(chips).toHaveLength(1);
    expect(chips[0].w).toBe(chips[0].h);

    await firstRow.getByRole('button', { name: 'お気に入りを編集' }).click();

    // 畳んでも編集導線は残る（評価の変更は常にモーダルが担う）
    await expect(
      page.getByRole('dialog', { name: 'お気に入りを編集' }),
    ).toBeVisible();
  });
});

/**
 * 設定は localStorage に1つだけ持つ。この2画面を足したことで
 * 「全画面共通」が成立する（#1049 / #1050 の分割前の動機）
 */
test.describe('表示モードは画面をまたいで共通に効く', () => {
  test('映画一覧でリストにすると、ウォッチリストとお気に入りもリストになる', async () => {
    const { page } = session;

    await resetViewMode(page);
    await page.goto('/movies/now-showing');
    await expect(viewToggle(page)).toBeVisible({ timeout: 30000 });

    await viewToggle(page).click();
    await expect(viewToggle(page)).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/watchlist');
    await expect(page.locator(WATCHLIST_LIST_TILE).first()).toBeVisible({
      timeout: 30000,
    });

    await page.goto('/favorites');
    await expect(page.locator(FAVORITE_LIST_TILE).first()).toBeVisible({
      timeout: 30000,
    });
  });
});
