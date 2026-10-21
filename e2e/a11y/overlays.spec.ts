/**
 * オーバーレイ展開時のアクセシビリティ回帰テスト
 *
 * ページを開いただけでは検査されない、モーダル・ドロワー等を
 * 展開した状態で axe-core を実行する。
 */

import { test, expect, type Page } from '@playwright/test';

import { THEMES, gotoWithTheme, expectNoA11yViolations } from './helpers';

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
  }
});

/**
 * 認証が要るオーバーレイ。
 * 公開カレンダーはログイン後しか開けないため、未認証の describe とは分ける。
 */
test.describe('アクセシビリティ（オーバーレイ・認証済み）', () => {
  test.describe.configure({ timeout: 60000 });

  /**
   * 月グリッドの日セル（gridcell）は「日付のラベル」と「その日の作品名」の両方を持つ。
   * axe の label-content-name-mismatch は可視テキストがアクセシブル名に
   * そのまま含まれることを求めるため、ラベル付きコンテナに任意の中身が入る
   * この構造では原理的に満たせない（FullCalendar の aria-labelledby を外して
   * 内容から名前を取らせても、文字列の連結が一致せず同じ結果になる）。
   *
   * このルールは音声入力で「見えている文字」を読み上げて操作する利用者向けだが、
   * セル内の各作品はそれぞれ独立したリンクとして名前を持っており、
   * セル自体を名前で呼び出す操作は想定されないため、ここでは除外する。
   */
  const CALENDAR_DISABLED_RULES = ['label-content-name-mismatch'] as const;

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
    test(`公開カレンダー - ${theme}`, async ({ page }) => {
      await gotoWithTheme(page, '/', theme);

      await page.getByRole('button', { name: '公開カレンダーを開く' }).click();

      const dialog = page.getByRole('dialog', { name: '公開カレンダー' });
      await expect(dialog).toBeVisible();
      await waitForCalendarReady(page);

      await expectNoA11yViolations(
        page,
        `公開カレンダー / ${theme}`,
        CALENDAR_DISABLED_RULES,
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
        CALENDAR_DISABLED_RULES,
      );
    });
  }
});
