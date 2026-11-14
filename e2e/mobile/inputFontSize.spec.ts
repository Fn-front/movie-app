/**
 * 入力欄の font-size E2Eテスト（#1113）
 *
 * iOS Safari / Chrome for iOS は、**フォーカスした入力欄の font-size が 16px
 * 未満のとき、文字が読める大きさになるまでページを自動的に拡大する**。
 * 拡大は入力後も戻らないため、ヘッダーも一覧もはみ出したまま操作が続く。
 *
 * ⚠️ **拡大そのものは Playwright では再現できない。** これは iOS の
 * ネイティブな挙動で、Chromium / WebKit のデスクトップビルドは行わない。
 * そのため**引き金になる条件（16px 未満）を直接測る**。
 *
 * ⚠️ `viewport` を絞るだけでは足りない。`--font-size-*` は md 未満で一部の段が
 * 下がるため（`src/styles/global/_theme.scss`）、**SP 幅での computed 値**を
 * 見ないと判定を誤る。デスクトップ幅で測ると SP の実態と違う値が出る。
 *
 * `e2e/a11y/` には SP 幅の describe もある（`publicPages.spec.ts` /
 * `authenticatedPages.spec.ts`）が、そちらへは入れない。**axe にこの観点の
 * ルールが無い**ので、axe を走らせる spec に混ぜても得るものが無い。
 */

import { expect, type Locator, type Page } from '@playwright/test';

import { ARIA_LABELS } from '@/constants';

import { test } from '../fixtures/auth';

/** SP 表示幅 */
const SP_VIEWPORT_WIDTH = 375;

/** 最狭幅（iPhone SE 相当）。横に溢れるかはここでしか出ない */
const NARROW_VIEWPORT_WIDTH = 320;

/**
 * iOS が自動ズームしない下限（px）
 *
 * `--font-size-base`（1.6rem = 16px）と対。この値を下回る入力欄を足さないこと
 */
const NO_AUTO_ZOOM_MIN_PX = 16;

test.use({
  viewport: { width: SP_VIEWPORT_WIDTH, height: 812 },
  // 認証状態に依存しない観点なので未認証で走らせる。
  // 共有テストユーザーの保存済み絞り込みを踏まない
  storageState: { cookies: [], origins: [] },
});

/**
 * computed font-size を px で読む
 *
 * SCSS の値ではなく**ブラウザが実際に採用した値**を見る。`font: inherit` を
 * 含む `input-reset` のように、後から上書きされうる書き方があるため
 */
const computedFontSizePx = (locator: Locator): Promise<number> =>
  locator.evaluate(
    (el) => Number.parseFloat(getComputedStyle(el).fontSize) || 0,
  );

/**
 * 入力欄が自動ズームの条件に当たらないことを検証する
 *
 * @param locator - 対象の入力欄
 * @param label - 失敗メッセージに出す要素名
 */
const expectNoAutoZoom = async (
  locator: Locator,
  label: string,
): Promise<void> => {
  await expect(locator).toBeVisible();
  expect(
    await computedFontSizePx(locator),
    `${label} の font-size が ${NO_AUTO_ZOOM_MIN_PX}px 未満。iOS がフォーカス時にページを拡大する`,
  ).toBeGreaterThanOrEqual(NO_AUTO_ZOOM_MIN_PX);
};

/** 一覧の絞り込みモーダルを開く */
const openFilterModal = async (page: Page): Promise<Locator> => {
  await page.getByRole('button', { name: 'フィルター' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
};

test.describe('iOS の自動ズームを招く入力欄が無い', () => {
  test('ヘッダーの検索入力欄（展開時）', async ({ page }) => {
    await page.goto('/movies/now-showing');

    await page
      .getByRole('button', { name: ARIA_LABELS.OPEN_SEARCH })
      .first()
      .click();

    // 本文版（variant='inline'）と同じ aria-label を持つので、
    // ヘッダーの展開済みフォームに絞ってから引く
    const expandedForm = page.locator('form[class*="form--expanded"]');
    await expect(expandedForm).toBeVisible();

    await expectNoAutoZoom(
      expandedForm.getByRole('textbox', {
        name: ARIA_LABELS.SEARCH_MOVIES,
      }),
      'ヘッダーの検索入力欄',
    );
  });

  test('一覧の絞り込みモーダルの公開日（開始／終了）', async ({ page }) => {
    await page.goto('/movies/now-showing');
    const dialog = await openFilterModal(page);

    const dateInputs = dialog.locator('input[type="date"]');
    await expect(dateInputs).toHaveCount(2);

    await expectNoAutoZoom(
      dateInputs.nth(0),
      '絞り込みモーダルの公開日（開始）',
    );
    await expectNoAutoZoom(
      dateInputs.nth(1),
      '絞り込みモーダルの公開日（終了）',
    );
  });

  test('検索ページの絞り込みの公開期間（開始／終了）', async ({ page }) => {
    await page.goto('/search?query=a');

    // SP では絞り込みが畳まれている
    await page.getByRole('button', { name: 'フィルター' }).click();

    const filter = page.locator('#search-filter');
    const dateInputs = filter.locator('input[type="date"]');
    await expect(dateInputs).toHaveCount(2);

    await expectNoAutoZoom(dateInputs.nth(0), '検索ページの公開期間（開始）');
    await expectNoAutoZoom(dateInputs.nth(1), '検索ページの公開期間（終了）');
  });
});

/**
 * font-size を上げたことで連鎖する2箇所。
 *
 * どちらも**16px 化そのものでは落ちない**ので、上の3本とは別に押さえる
 */
test.describe('16px 化に追従すべき箇所', () => {
  /**
   * 展開オーバーレイとフォームの当たり判定
   *
   * 以前はオーバーレイの `top` をフォームの下端（決め打ち63px）に合わせており、
   * 入力欄の行が伸びると**ずれたまま誰も気づかなかった**。#1113 で
   * その結合を外した（`inset: 0` のみ）。
   *
   * ⚠️ **矩形の一致ではなく挙動を見る。** 結合を外した以上、上端が
   * どこにあるかは仕様ではない。利用者にとっての事実は
   * 「入力欄をタップしても閉じない」「フォームの下をタップすると閉じる」の2つで、
   * これは `top` をどう書こうが満たされていなければならない。
   */
  test('展開中、入力欄のタップでは閉じず、フォームの下をタップすると閉じる', async ({
    page,
  }) => {
    await page.goto('/movies/now-showing');

    await page
      .getByRole('button', { name: ARIA_LABELS.OPEN_SEARCH })
      .first()
      .click();

    const form = page.locator('form[class*="form--expanded"]');
    await expect(form).toBeVisible();

    // オーバーレイは閉じるボタンと同じ aria-label を持つので、
    // `tabIndex=-1` を足したクラス名側で引く
    await expect(
      page.locator('[class*="c_search_bar__overlay"]'),
    ).toBeVisible();

    /*
      ⚠️ **スライドインが終わるまで押さない。** フォームは
      `searchBarSlideDown`（translateY(-100%) → 0）で降りてくるので、
      `toBeVisible()` の直後はまだ画面の上にはみ出している（実測 y = -53）。
      その位置で座標クリックすると、狙いと違うものを押す
    */
    await expect
      .poll(() => form.evaluate((el) => el.getBoundingClientRect().top), {
        message: 'フォームのスライドインが終わらない',
      })
      .toBeCloseTo(0, 0);

    // 1. 入力欄をタップしても閉じない（オーバーレイが手前に被っていない）
    const input = form.getByRole('textbox', {
      name: ARIA_LABELS.SEARCH_MOVIES,
    });
    await input.click();
    await expect(input).toBeFocused();
    await expect(form).toBeVisible();

    // 2. フォームの下をタップすると閉じる（オーバーレイが受け取る）
    const formBox = await form.boundingBox();
    expect(formBox, 'フォームの矩形が取れない').not.toBeNull();

    await page.mouse.click(
      SP_VIEWPORT_WIDTH / 2,
      formBox!.y + formBox!.height + 40,
    );
    await expect(form).not.toBeVisible();
  });

  /**
   * `<input type="date">` の intrinsic width は font-size に比例する。
   * 絞り込みモーダルの日付欄は2つ横並びで、flex アイテムの `min-width` は
   * 既定が `auto`（＝min-content 幅が下限）なので、`min-width: 0` が無いと
   * 縮まずに溢れる。
   *
   * ⚠️ **375px では落ちない。** 実測で 375px は収まり、**320px で
   * scrollWidth 314 / clientWidth 280 と 34px 溢れた**。最狭幅で測ること
   */
  test.describe('最狭幅（320px）', () => {
    test.use({ viewport: { width: NARROW_VIEWPORT_WIDTH, height: 812 } });

    test('絞り込みモーダルの日付欄2つが溢れない', async ({ page }) => {
      await page.goto('/movies/now-showing');
      const dialog = await openFilterModal(page);

      const dateRange = dialog.locator('[class*="c_filter__date_range"]');
      await expect(dateRange).toBeVisible();

      const overflow = await dateRange.evaluate(
        (el) => el.scrollWidth - el.clientWidth,
      );
      expect(overflow, '日付欄の行が横に溢れている').toBeLessThanOrEqual(0);
    });
  });
});
