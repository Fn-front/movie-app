/**
 * シアター体験ページ E2Eテスト（認証済み）
 * クリティカルユーザージャーニーのみ:
 * 1. ページが表示される
 * 2. 座席選択→一人称切替→俯瞰に戻る
 * 3. ヒートマップ表示/非表示の切替
 */

import { test, expect } from '../fixtures/auth';
import type { Page } from '@playwright/test';

/**
 * WebGL2 初期化・データ取得完了の待機タイムアウト（ms）。
 * CIのヘッドレスChromiumでの初期化遅延を吸収しつつ、
 * expect のデフォルト（10秒）より長めに確保する。
 */
const READY_TIMEOUT_MS = 15000;

/**
 * WebGL2 が利用可能になるまで明示的に待機する。
 *
 * CIのヘッドレスChromiumではGPU無効化により WebGL2 初期化が遅延することがあり、
 * その状態でページのゲート（isWebGL2Support）に依存すると
 * UnsupportedBrowserNotice に落ちて期待要素が出ずタイムアウトする。
 * ここでブラウザの WebGL2 コンテキスト生成が成功することを先に確認し、
 * ソフトウェアレンダリング（SwiftShader）でも安定して true になることを保証する。
 */
async function waitForWebGL2(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      try {
        const canvas = document.createElement('canvas');
        return canvas.getContext('webgl2') !== null;
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: READY_TIMEOUT_MS },
  );
}

/**
 * useTheater（Supabaseフェッチ）のデータ取得完了を待機する。
 *
 * 座席一覧（SeatA11yList）はデータ取得後に描画されるため、
 * 座席ボタンの出現を待つことでデータ取得完了を明示的に保証する。
 * 併せて、読み込み中インジケータが消えていることも確認する。
 */
async function waitForTheaterReady(page: Page): Promise<void> {
  // 読み込み中表示が消えるまで待つ（useTheater / useWebGL2Support の判定完了）
  await expect(page.getByText('読み込み中...')).toHaveCount(0, {
    timeout: READY_TIMEOUT_MS,
  });
  // 座席一覧が描画される（= useTheater のデータ取得完了）
  await expect(page.getByRole('button', { name: /^A列1番、/ })).toBeVisible();
}

test.describe('シアター体験ページ', () => {
  test('俯瞰ビューが表示され、座席を選択すると一人称に切り替わり、俯瞰に戻れる', async ({
    page,
  }) => {
    await page.goto('/theater-experience');

    // WebGL2 初期化とデータ取得の完了を明示的に待つ（暗黙タイムアウト依存を解消）
    await waitForWebGL2(page);
    await waitForTheaterReady(page);

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

    // WebGL2 初期化とデータ取得の完了を明示的に待つ
    await waitForWebGL2(page);
    await waitForTheaterReady(page);

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
