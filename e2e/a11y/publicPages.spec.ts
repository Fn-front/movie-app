/**
 * 未認証で到達できるページのアクセシビリティ回帰テスト
 *
 * ライト／ダーク両テーマで axe-core を実行し、違反ゼロを維持する。
 */

import { test } from '@playwright/test';

import { THEMES, gotoWithTheme, expectNoA11yViolations } from './helpers';

/** 未認証でも表示できるページ */
const PUBLIC_PAGES = [
  { name: 'ホーム', path: '/' },
  { name: '公開中', path: '/movies/now-showing' },
  { name: '公開予定', path: '/movies/upcoming' },
  { name: '受賞作品', path: '/awards' },
  { name: '検索（結果あり）', path: '/search?q=inception' },
  { name: '検索（0件）', path: '/search?q=zzzzzzqqqq' },
  { name: '検索（クエリなし）', path: '/search' },
  { name: 'ログイン', path: '/auth/signin' },
  { name: '新規登録', path: '/auth/signup' },
  { name: 'パスワードを忘れた', path: '/auth/forgot-password' },
] as const;

test.describe('アクセシビリティ（未認証ページ）', () => {
  // 一覧ページは画像が多く、既定の30秒を超えることがある
  test.describe.configure({ timeout: 60000 });

  // 認証状態に依存しないことを明示するため storageState を空にする
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const theme of THEMES) {
    for (const { name, path } of PUBLIC_PAGES) {
      test(`${name} - ${theme}`, async ({ page }) => {
        await gotoWithTheme(page, path, theme);
        await expectNoA11yViolations(page, `${name} / ${theme}`);
      });
    }
  }
});
