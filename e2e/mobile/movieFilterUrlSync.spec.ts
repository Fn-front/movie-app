/**
 * 一覧フィルターと URL の同期 E2Eテスト（SP幅）
 *
 * #1026 でフィルターモーダルが履歴エントリを積むようになってから、
 * 「適用」の `router.replace` が**ページではなくモーダルのエントリ**を
 * 置き換えるようになった。絞り込み前の URL が履歴に残るため、戻ると
 * **URL からクエリが消えるのに一覧は絞り込まれたまま**になっていた（#1051）。
 *
 * ⚠️ **URL だけを見ても検出できない。** 戻った先の URL は期待どおりに
 * 見えるからで、食い違っているのは画面側。URL のクエリの有無と
 * 絞り込みバッジの有無を**必ず対で**確かめること。
 *
 * SP 幅で起票された事象であり、`playwright.config.ts` のプロジェクトは
 * すべて Desktop デバイスのため `e2e/mobile/` に置く。
 */

import type { Locator, Page } from '@playwright/test';

import { MOVIE_FILTER_QUERY_PARAMS } from '@/constants';
import { test, expect } from '../fixtures/auth';

/**
 * 未認証で動かす。
 *
 * 認証済みだと共有テストユーザーの `saved_filters` を書き換えてしまい、
 * 同じユーザーを使う他のテストの初期状態を壊す。この spec が見たいのは
 * URL と画面の一致であって、サーバー保存の復元ではない
 */
test.use({
  viewport: { width: 375, height: 812 },
  storageState: { cookies: [], origins: [] },
});

/** 一覧タイルの実体（スケルトン・子要素を除く） */
const TILE_SELECTOR =
  '[class*="c_card"][class*="c_movie_tile"]:not([class*="c_movie_tile_skeleton"])';

/** 絞り込み中を示すバッジ */
const FILTER_BADGE_SELECTOR = '[class*="filter_count"]';

/** 絞り込みに使うジャンル。どのページの一覧にも含まれる */
const GENRE_NAME = 'アクション';

/** URL と画面が「絞り込みあり」で揃っている状態 */
const FILTERED = 'URL:クエリあり / バッジ:あり';

/** URL と画面が「絞り込みなし」で揃っている状態 */
const UNFILTERED = 'URL:クエリなし / バッジ:なし';

/** 一覧が描画されるまで待つ（データ0件なら false） */
const waitForList = (page: Page) =>
  page
    .locator(TILE_SELECTOR)
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false);

/**
 * URL のクエリ有無と絞り込みバッジ有無を1つの文字列にまとめて読む。
 *
 * 2つを別々に assert すると、**両方とも「絞り込みなし」に見える一瞬**で
 * たまたま通ってしまう。対にして `FILTERED` / `UNFILTERED` と突き合わせれば、
 * 一致していることと、どちらの状態であるかを同時に固定できる。
 * 落ちたときにどちら側が食い違ったかもメッセージに出る
 */
const readFilterState = async (page: Page) => {
  const hasQuery = new URL(page.url()).searchParams.has(
    MOVIE_FILTER_QUERY_PARAMS.GENRE_IDS,
  );
  const hasBadge = (await page.locator(FILTER_BADGE_SELECTOR).count()) > 0;

  return [
    hasQuery ? 'URL:クエリあり' : 'URL:クエリなし',
    hasBadge ? 'バッジ:あり' : 'バッジ:なし',
  ].join(' / ');
};

/** フィルターモーダルを開く */
const openFilterModal = async (page: Page) => {
  await page.getByRole('button', { name: 'フィルター' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
};

/**
 * ジャンルのチェックボックス。
 *
 * 入力は視覚的に隠してあり（`c_filter__tag_input`）クリックできないため、
 * 操作はラベル、状態の確認はこちらを使う
 */
const genreCheckbox = (dialog: Locator) =>
  dialog.getByRole('checkbox', { name: GENRE_NAME, exact: true });

/** フィルターモーダルからジャンルを1つ選んで適用する */
const applyGenreFilter = async (page: Page) => {
  const dialog = await openFilterModal(page);

  await dialog.getByText(GENRE_NAME, { exact: true }).first().click();
  await expect(genreCheckbox(dialog)).toBeChecked();

  await dialog.getByRole('button', { name: '適用' }).click();
  await expect(dialog).not.toBeVisible();
};

test.describe('フィルター適用後の戻る／進む', () => {
  // 一覧の読み込み・モーダル操作・履歴の往復を含むため30秒予算を超過しうる
  test.describe.configure({ timeout: 60000 });

  test('公開中: 戻ると URL も一覧の絞り込みも解除される', async ({ page }) => {
    await page.goto('/movies/now-showing');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    await expect.poll(() => readFilterState(page)).toBe(UNFILTERED);

    await applyGenreFilter(page);
    await expect.poll(() => readFilterState(page)).toBe(FILTERED);

    await page.goBack();

    // #1051: ここで URL だけクエリが消え、バッジは残っていた
    await expect.poll(() => readFilterState(page)).toBe(UNFILTERED);

    // バッジは絞り込み条件の一部しか見ていない。条件そのものが
    // 戻っていることをモーダルの選択状態でも固定する
    const dialog = await openFilterModal(page);
    await expect(genreCheckbox(dialog)).not.toBeChecked();
  });

  test('公開中: 進むと絞り込みが戻る', async ({ page }) => {
    await page.goto('/movies/now-showing');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    await applyGenreFilter(page);
    await expect.poll(() => readFilterState(page)).toBe(FILTERED);

    await page.goBack();
    await expect.poll(() => readFilterState(page)).toBe(UNFILTERED);

    // URL が正なら、進むでも URL と画面が揃って戻る
    await page.goForward();
    await expect.poll(() => readFilterState(page)).toBe(FILTERED);
  });

  test('公開予定: 戻ると URL も一覧の絞り込みも解除される', async ({
    page,
  }) => {
    await page.goto('/movies/upcoming');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    await expect.poll(() => readFilterState(page)).toBe(UNFILTERED);

    await applyGenreFilter(page);
    await expect.poll(() => readFilterState(page)).toBe(FILTERED);

    await page.goBack();

    await expect.poll(() => readFilterState(page)).toBe(UNFILTERED);
  });
});

/**
 * ソートの Select はモーダルを介さないため履歴エントリが積まれず、
 * `router.replace` はページのエントリを置き換える。#1051 の修正で
 * URL 追従を足したあとも、この経路の挙動は変わってはいけない
 */
test.describe('ソートの Select（モーダルを介さない経路）', () => {
  test.describe.configure({ timeout: 60000 });

  test('並び順の変更は履歴を積まず、表示も URL と揃ったまま', async ({
    page,
  }) => {
    await page.goto('/movies/upcoming');
    await waitForList(page);

    await page.goto('/movies/now-showing');
    await waitForList(page);

    const sortSelect = page.getByRole('combobox');
    await sortSelect.click();
    await page.getByRole('option', { name: '人気順' }).click();

    // URL と Select の表示が食い違わない
    await expect(page).toHaveURL(/sort_by=popularity/);
    await expect(sortSelect).toContainText('人気順');

    // replace なので、戻ると前のページへ出る（絞り込み前の同じページではない）
    await page.goBack();
    await expect(page).toHaveURL(/\/movies\/upcoming/);
  });
});
