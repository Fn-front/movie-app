/**
 * シアター体験ページ E2Eテスト（認証済み）
 * クリティカルユーザージャーニーのみ:
 * 1. ページが表示される
 * 2. 座席選択→一人称切替→俯瞰に戻る
 * 3. ヒートマップ表示/非表示の切替
 */

import { test, expect } from '../fixtures/auth';

test.describe('シアター体験ページ', () => {
  test('俯瞰ビューが表示され、座席を選択すると一人称に切り替わり、俯瞰に戻れる', async ({
    page,
  }) => {
    await page.goto('/theater-experience');

    // タイトルと劇場名が表示されること
    await expect(
      page.getByRole('heading', { name: 'シアター体験', level: 1 }),
    ).toBeVisible();

    // 「俯瞰に戻る」ボタンは未選択時は表示されない
    await expect(
      page.getByRole('button', { name: '← 俯瞰に戻る' }),
    ).not.toBeVisible();

    // 座席一覧の最前列 A列 1番を選択
    await page.getByRole('button', { name: /^A列1番、/ }).click();

    // 「俯瞰に戻る」ボタンが現れる（一人称ビューに切り替わった証拠）
    await expect(
      page.getByRole('button', { name: '← 俯瞰に戻る' }),
    ).toBeVisible();

    // 座席情報パネルに選択した席の見出しが出る
    await expect(
      page.getByRole('heading', { name: /A列\s*1番/ }),
    ).toBeVisible();

    // 俯瞰に戻る
    await page.getByRole('button', { name: '← 俯瞰に戻る' }).click();

    // ボタンが消え、未選択メッセージが出る
    await expect(
      page.getByRole('button', { name: '← 俯瞰に戻る' }),
    ).not.toBeVisible();
    await expect(page.getByText('座席を選択してください')).toBeVisible();
  });

  test('ヒートマップ表示/非表示を切り替えられる', async ({ page }) => {
    await page.goto('/theater-experience');

    const showRadio = page.getByRole('radio', { name: 'ヒートマップを表示' });
    const hideRadio = page.getByRole('radio', { name: 'ヒートマップを非表示' });

    // デフォルトは非表示
    await expect(hideRadio).toHaveAttribute('data-state', 'on');
    await expect(showRadio).toHaveAttribute('data-state', 'off');

    // 表示に切替
    await showRadio.click();
    await expect(showRadio).toHaveAttribute('data-state', 'on');
    await expect(hideRadio).toHaveAttribute('data-state', 'off');

    // 非表示に戻す
    await hideRadio.click();
    await expect(hideRadio).toHaveAttribute('data-state', 'on');
  });
});
