/**
 * オーバーレイ展開時のアクセシビリティ回帰テスト
 *
 * ページを開いただけでは検査されない、モーダル・ドロワー等を
 * 展開した状態で axe-core を実行する。
 */

import { test, expect, type Page } from '@playwright/test';

import { ARIA_LABELS, MENU_LABELS } from '@/constants';

import { movieTiles } from '../helpers/locators';
import { mockMovieDetail } from '../helpers/movieDetail';
import {
  THEMES,
  gotoWithTheme,
  expectNoA11yViolations,
  expectAxeEvaluated,
} from './helpers';

/** 詳細モーダルの検査で使うキャスト（リンクが描画される最小構成） */
const CAST_PRESENT = [
  { id: 1, name: '俳優A', character: '役A', profile_path: null, order: 0 },
];

/**
 * スクロール領域（`max-height: 300px`）を確実にはみ出させるあらすじ。
 *
 * 違反は「スクロール可能」かつ「フォーカス可能な子孫がゼロ」で成立する。
 * 既定のモック（短いあらすじ）では、はみ出すかどうかがテーマやフォント指標で
 * 揺れて検査が不安定になるため、長さで確定させる。
 */
const LONG_OVERVIEW = 'E2E用の長いあらすじテキストです。'.repeat(40);

test.describe('アクセシビリティ（オーバーレイ・未認証）', () => {
  test.describe.configure({ timeout: 60000 });

  test.use({ storageState: { cookies: [], origins: [] } });

  for (const theme of THEMES) {
    test(`ログイン誘導モーダル - ${theme}`, async ({ page }) => {
      await gotoWithTheme(page, '/movies/now-showing', theme);

      // 未認証で保護ルートのリンクを押すとログイン誘導が開く
      await page.getByRole('link', { name: 'お気に入り' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await expectNoA11yViolations(page, `ログイン誘導モーダル / ${theme}`);
    });

    test(`モバイルドロワー - ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await gotoWithTheme(page, '/movies/now-showing', theme);

      await page.getByRole('button', { name: 'メニュー' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await expectNoA11yViolations(page, `モバイルドロワー / ${theme}`);
    });

    test(`フィルターモーダル - ${theme}`, async ({ page }) => {
      await gotoWithTheme(page, '/movies/now-showing', theme);

      await page.getByRole('button', { name: /フィルター/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await expectNoA11yViolations(page, `フィルターモーダル / ${theme}`);
    });

    /**
     * 詳細モーダルのスクロール領域（あらすじ・詳細情報・キャスト）は
     * `max-height` 固定で、フォーカス可能な子孫がキャストのリンクだけだった。
     * キャスト情報を持たない作品でゼロになり、キーボードで到達できなくなる（#809）。
     * キャスト有無の両方を検査する。
     */
    for (const [label, cast] of [
      ['キャストあり', CAST_PRESENT],
      ['キャストなし', []],
    ] as const) {
      test(`映画詳細モーダル（${label}） - ${theme}`, async ({ page }) => {
        // TMDbのレート制限・一時障害に左右されないようモックする
        await mockMovieDetail(page, {
          overview: LONG_OVERVIEW,
          credits: { cast: [...cast], crew: [] },
        });
        await gotoWithTheme(page, '/movies/now-showing', theme);

        await movieTiles(page).first().waitFor({ timeout: 30000 });
        await movieTiles(page).first().click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 15000 });
        // 取得完了まで待つ（ローディング中に検査しない）
        await expect(dialog.getByText('詳細情報')).toBeVisible({
          timeout: 15000,
        });

        await expectNoA11yViolations(
          page,
          `映画詳細モーダル（${label}） / ${theme}`,
        );

        /*
          ⚠️ **ここが無いと、上の0件は「検査していない」と区別できない**（#1107）。

          キャストは `max-height: 300px` のスクロール領域の中で、
          `LONG_OVERVIEW` と「詳細情報」の後ろにある。axe の可視判定は
          `overflow` を持つ祖先の矩形との重なりを見るため、送らないと
          評価されない。実測（light / デスクトップ幅）:

            キャスト名の矩形 937–1038 / スクロール領域 323–623 → 範囲外
            送った後          522–623                        → 範囲内

          **`color-contrast` を指定するのが要点。** `link-name` のように
          可視判定を使わないルールは送らなくても評価されるので、
          ルールを指定しないと掃引が壊れても気づけない。実測で、送った後に
          だけ評価されるノードは9件あり、**全部 `color-contrast`** だった
          （キャスト名・役名・プレースホルダ・詳細情報の dt/dd ほか）。
        */
        if (cast.length > 0) {
          await expectAxeEvaluated(
            page,
            dialog.locator('[class*="c_movie_detail__cast_name"]').first(),
            `映画詳細モーダルのキャスト名 / ${theme}`,
            ['color-contrast'],
          );
        }
      });
    }
  }
});

/**
 * 認証が要るオーバーレイ。
 * 公開カレンダーはログイン後しか開けないため、未認証の describe とは分ける。
 */
test.describe('アクセシビリティ（オーバーレイ・認証済み）', () => {
  test.describe.configure({ timeout: 60000 });

  /**
   * incomplete（needs review）を許容するルール。いずれも FullCalendar が
   * 自前で描画する曜日見出し `<a class="fc-col-header-cell-cushion">日</a>` に対するもので、
   * アプリ側のマークアップではない。FullCalendar の更新は #780 で追っている。
   *
   * - `aria-prohibited-attr`:
   *   「role の無い `a` に aria-label は十分にサポートされていない」という指摘。
   *   FullCalendar が曜日の略称（日・月…）に完全な曜日名を付けるための属性で、
   *   主要ブラウザ・支援技術では読み上げられる。
   * - `color-contrast`:
   *   「要素の内容が短すぎてテキストかどうか判定できない」という指摘。
   *   1文字（日・月…）のため axe がコントラストを計算できないだけで、
   *   配色自体はテーマのトークンに従っている。
   */
  const CALENDAR_ALLOWED_INCOMPLETE = [
    'aria-prohibited-attr',
    'color-contrast',
  ] as const;

  /**
   * カレンダーの描画完了を待つ。
   *
   * モーダルは scale/opacity のアニメーションで開き、その完了後に
   * FullCalendar が幅を測り直して再描画する。途中で axe を走らせると
   * 不透明度の途中の色や、組み替え中のDOMを拾って結果が安定しない。
   */
  const waitForCalendarReady = async (page: Page) => {
    const dialog = page.getByRole('dialog', { name: '公開カレンダー' });
    await expect(dialog.getByText('読み込み中...')).not.toBeVisible({
      timeout: 10000,
    });
    await dialog.evaluate((el) =>
      Promise.all(el.getAnimations().map((animation) => animation.finished)),
    );
    // 幅の測り直しが終わり、グリッドがコンテナいっぱいに広がった状態
    await expect
      .poll(() =>
        dialog
          .locator('.fc-scrollgrid-sync-table')
          .first()
          .evaluate((table) => {
            const scroller = table.closest('.fc-scroller');
            return scroller
              ? scroller.clientWidth - table.getBoundingClientRect().width
              : -1;
          }),
      )
      .toBeLessThanOrEqual(1);
  };

  for (const theme of THEMES) {
    /**
     * 認証済みのモバイルドロワー（#1065）
     *
     * 未認証版（上の describe）とは中身が違う。認証済みだけに出るのは、
     * 利用者の情報（アバター／頭文字・表示名・メールアドレス）と、設定・
     * ログアウト・公開カレンダーのボタン（`mobileDrawer.tsx`）。
     * 未認証版はログインボタンしか持たないため、ここを足さないと
     * ドロワーの半分が検査されないまま残る。
     */
    test(`モバイルドロワー（認証済み） - ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await gotoWithTheme(page, '/movies/now-showing', theme);

      await page.getByRole('button', { name: 'メニュー' }).click();
      const drawer = page.getByRole('dialog');
      await expect(drawer).toBeVisible();

      // 認証済みでしか出ない領域が描かれてから検査する。
      // 未認証で走っていたらここで落ちる（ログインボタンしか無い）
      await expect(
        drawer.getByRole('button', { name: MENU_LABELS.SETTINGS }),
      ).toBeVisible();
      await expect(
        drawer.getByRole('button', { name: ARIA_LABELS.OPEN_CALENDAR }),
      ).toBeVisible();

      await expectNoA11yViolations(
        page,
        `モバイルドロワー（認証済み） / ${theme}`,
      );
    });

    test(`公開カレンダー - ${theme}`, async ({ page }) => {
      await gotoWithTheme(page, '/', theme);

      await page.getByRole('button', { name: '公開カレンダーを開く' }).click();

      const dialog = page.getByRole('dialog', { name: '公開カレンダー' });
      await expect(dialog).toBeVisible();
      await waitForCalendarReady(page);

      await expectNoA11yViolations(
        page,
        `公開カレンダー / ${theme}`,
        [],
        CALENDAR_ALLOWED_INCOMPLETE,
      );
    });

    test(`公開カレンダー（日付選択後） - ${theme}`, async ({ page }) => {
      await gotoWithTheme(page, '/', theme);

      await page.getByRole('button', { name: '公開カレンダーを開く' }).click();

      const dialog = page.getByRole('dialog', { name: '公開カレンダー' });
      await waitForCalendarReady(page);

      // 選択状態のリング・日別パネルを含めて検査する
      await dialog
        .locator('td.fc-daygrid-day:not(.fc-day-other)')
        .first()
        .click();
      await expect(dialog.locator('td.fc-day-selected')).toHaveCount(1);

      await expectNoA11yViolations(
        page,
        `公開カレンダー（日付選択後） / ${theme}`,
        [],
        CALENDAR_ALLOWED_INCOMPLETE,
      );
    });
  }
});
