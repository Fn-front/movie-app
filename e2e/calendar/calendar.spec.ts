/**
 * カレンダー E2Eテスト（認証済み）
 * クリティカルユーザージャーニー
 * - サイドバーボタンクリック → カレンダーダイアログ表示
 * - 月切り替え → データ更新確認
 * - 「今日」で当月へ復帰
 * - 日付選択 → 日別パネルの切り替え
 * - モバイルドロワーからの導線
 * - ESCキーでダイアログ閉じる
 *
 * ウォッチリストの中身には依存させない。
 * `e2e/watchlist/watchlist.spec.ts` が共有テストユーザーのウォッチリストを
 * 消しながら進むため、ファイル間並列実行で中身を前提にすると不安定になる。
 */

import { test, expect } from '../fixtures/auth';

/** 当月の指定日を YYYY-MM-DD（ローカル基準）で返す */
function dayOfCurrentMonth(day: number): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${String(day).padStart(2, '0')}`;
}

/** 当月の指定日の見出し表記（例: 3月15日(日)）を返す */
function headingOfCurrentMonth(day: number): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), day);
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日(${weekday})`;
}

test.describe('カレンダー', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('button', { name: '公開カレンダーを開く' })
      .waitFor({ timeout: 30000 });
  });

  test('サイドバーのカレンダーボタンクリックでダイアログが表示される', async ({
    page,
  }) => {
    // サイドバーのカレンダーボタンをクリック
    const calendarButton = page.getByRole('button', {
      name: '公開カレンダーを開く',
    });
    await calendarButton.click();

    // ダイアログが表示される
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('公開カレンダー')).toBeVisible();
  });

  test('月切り替えが動作する', async ({ page }) => {
    // カレンダーを開く
    await page.getByRole('button', { name: '公開カレンダーを開く' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // ローディングが終わるのを待つ
    await expect(dialog.getByText('読み込み中...')).not.toBeVisible({
      timeout: 10000,
    });

    // カスタムヘッダーのタイトル（月名）を取得
    const nextButton = dialog.getByRole('button', { name: '次月' });
    const prevButton = dialog.getByRole('button', { name: '前月' });

    // 次月・前月ボタンの間にあるタイトルテキストを取得
    const initialTitle = await nextButton
      .locator('..')
      .locator('span')
      .first()
      .textContent();

    // 次月ボタンをクリック
    await nextButton.click();

    // タイトルが変わることを確認
    await expect(
      nextButton.locator('..').locator('span').first(),
    ).not.toHaveText(initialTitle ?? '');

    // 前月ボタンをクリック
    await prevButton.click();

    // 元のタイトルに戻ることを確認
    await expect(nextButton.locator('..').locator('span').first()).toHaveText(
      initialTitle ?? '',
    );
  });

  test('「今日」ボタンで当月に戻る', async ({ page }) => {
    await page.getByRole('button', { name: '公開カレンダーを開く' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('読み込み中...')).not.toBeVisible({
      timeout: 10000,
    });

    const nextButton = dialog.getByRole('button', { name: '次月' });
    const title = nextButton.locator('..').locator('span').first();
    const initialTitle = await title.textContent();

    // 2か月先まで進めてから「今日」で戻れることを確認する
    await nextButton.click();
    await nextButton.click();
    await expect(title).not.toHaveText(initialTitle ?? '');

    await dialog.getByRole('button', { name: '今日' }).click();

    await expect(title).toHaveText(initialTitle ?? '');
  });

  test('日付を選ぶと日別パネルがその日に切り替わる', async ({ page }) => {
    await page.getByRole('button', { name: '公開カレンダーを開く' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('読み込み中...')).not.toBeVisible({
      timeout: 10000,
    });

    // 当月の15日を選ぶ（どの月にも必ず存在する）
    const cell = dialog.locator(`[data-date="${dayOfCurrentMonth(15)}"]`);
    await cell.click();

    // 見出しが選択日に変わる（件数の有無は問わない）
    await expect(
      dialog.getByRole('heading', {
        name: new RegExp(
          `^${headingOfCurrentMonth(15).replace(/[()]/g, '\\$&')}`,
        ),
      }),
    ).toBeVisible();

    // セルに選択状態が付く
    await expect(cell).toHaveClass(/fc-day-selected/);
  });

  test('公開予定がない日を選ぶと空メッセージが表示される', async ({ page }) => {
    await page.getByRole('button', { name: '公開カレンダーを開く' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('読み込み中...')).not.toBeVisible({
      timeout: 10000,
    });

    // 公開予定がある日は fc-day-has-events が付く。付いていない日を選ぶ
    const emptyCell = dialog
      .locator('td.fc-daygrid-day:not(.fc-day-has-events):not(.fc-day-other)')
      .first();
    await emptyCell.click();

    await expect(
      dialog.getByText('この日に公開予定の映画はありません'),
    ).toBeVisible();
  });

  test('月グリッドがコンテナいっぱいに広がる', async ({ page }) => {
    // モーダルは scale(0.96) から開く。FullCalendar がその最中に幅を測ると
    // 「実幅 × 0.96」がテーブルに焼き込まれ、土曜カラムの右に余白が残る
    await page.getByRole('button', { name: '公開カレンダーを開く' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('読み込み中...')).not.toBeVisible({
      timeout: 10000,
    });

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
  });

  test('ESCキーでダイアログが閉じる', async ({ page }) => {
    // カレンダーを開く
    await page.getByRole('button', { name: '公開カレンダーを開く' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // ESCキーで閉じる
    await page.keyboard.press('Escape');

    await expect(dialog).not.toBeVisible();
  });
});

test.describe('カレンダー（モバイル）', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('ドロワーから公開カレンダーを開ける', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'メニューを開く' }).click();

    // Radix が Dialog.Title を aria-labelledby で紐づけるため、
    // ドロワーのアクセシブル名は aria-label ではなくタイトルの「メニュー」になる
    const drawer = page.getByRole('dialog', { name: 'メニュー' });
    const calendarButton = drawer.getByRole('button', {
      name: '公開カレンダーを開く',
    });
    await expect(calendarButton).toBeVisible();

    await calendarButton.click();

    // ドロワーが閉じ、カレンダーが開く
    await expect(drawer).not.toBeVisible();
    const calendarDialog = page.getByRole('dialog', { name: '公開カレンダー' });
    await expect(calendarDialog).toBeVisible();
  });
});
