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
  {
    name: 'ホーム',
    path: '/',
    // 横スクロールのカルーセルには、表示幅の右端で切れるカードが必ず1枚できる
    // （カード幅196pxに対し表示幅は1002px＝5.11枚分で、割り切れない）。
    // その切れたカードのタイトルが2行に折り返すと、axe は要素がクリップ境界を
    // またぐために背景色を決定できず color-contrast を incomplete に回す。
    // コントラスト自体は正常で、スクロールして全体が見える位置に来ると消える。
    // 右端にどの作品が来るかは TMDb のデータ次第なので、日によって出たり消えたりする。
    //
    // messageKey と対象セレクタの両方で絞っているため、カルーセル外（画像の上の
    // 文字など）の「背景色を決定できない」は従来どおり落ちる。
    allowedIncomplete: [
      {
        id: 'color-contrast',
        messageKey: 'elmPartiallyObscuring',
        targetIncludes: 'movie_list__item',
      },
    ],
  },
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
  // 同意UI（バナー・撤回トグル）は NEXT_PUBLIC_GA_ID 未設定の E2E では
  // 描画されないが、本文は描画されるので回帰を見る価値がある
  { name: 'プライバシーポリシー', path: '/privacy' },
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
