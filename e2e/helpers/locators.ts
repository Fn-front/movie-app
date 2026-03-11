/**
 * E2E共通ロケータ
 * 2つ以上のspecファイルで使用するロケータを集約
 */

import type { Page } from '@playwright/test';

/** 映画タイルのボタンロケータを取得 */
export function movieTileButtons(page: Page) {
  return page.getByRole('button', { name: /の詳細を表示/ });
}
