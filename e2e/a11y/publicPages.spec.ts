/**
 * 未認証で到達できるページのアクセシビリティ回帰テスト
 *
 * ライト／ダーク両テーマで axe-core を実行し、違反ゼロを維持する。
 */

import { test } from '@playwright/test';

import { THEMES, gotoWithTheme, expectNoA11yViolations } from './helpers';

/**
 * 未認証でも表示できるページ
 *
 * `allowedIncomplete` は「axe が判定できないだけで実害が無い」と確認できた
 * incomplete（needs review）のルール。理由を必ず添えること。
 */
const PUBLIC_PAGES = [
  { name: 'ホーム', path: '/' },
  { name: '公開中', path: '/movies/now-showing' },
  { name: '公開予定', path: '/movies/upcoming' },
  {
    name: '受賞作品',
    path: '/awards',
    // axe が h1 に対し「Unable to determine previous heading」を返す。
    // 見出し階層は h1（ページタイトル）→ h2（賞）→ h3（部門）で正しく、
    // 飛びも逆転も無い。直前の見出しを特定できないという axe 側の制約。
    allowedIncomplete: ['heading-order'],
  },
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
    for (const entry of PUBLIC_PAGES) {
      const { name, path } = entry;
      const allowedIncomplete =
        'allowedIncomplete' in entry ? entry.allowedIncomplete : [];

      test(`${name} - ${theme}`, async ({ page }) => {
        await gotoWithTheme(page, path, theme);
        await expectNoA11yViolations(
          page,
          `${name} / ${theme}`,
          [],
          allowedIncomplete,
        );
      });
    }
  }
});
