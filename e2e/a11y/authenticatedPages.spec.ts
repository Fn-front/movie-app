/**
 * 認証済みで到達できるページのアクセシビリティ回帰テスト（#1065）
 *
 * `publicPages.spec.ts` は `storageState` を空にして未認証に固定しているため、
 * **認証済みでしか描かれない要素が axe を一度も通らない**。代表はサイドバー
 * （`appLayout.tsx` の `Sidebar`。認証済みかつ lg 以上でしか出ない）。
 * ここは `storageState` を上書きしないことで `playwright.config.ts` の既定
 * （共有テストユーザーのセッション）をそのまま使う。
 *
 * ## このファイルが検査しないもの
 *
 * | 対象 | 理由 |
 * | --- | --- |
 * | `/watchlist` `/favorites` | #1060（タイルがクリック可能カードの中に操作ボタンを入れ子にしている / `nested-interactive` / serious）が未修正で、入れると必ず落ちる。#1033 Phase 2 でタイルを stretched Link に作り替えるときに一緒に足す |
 * | サイドバーの `WatchlistItem` | 同じ入れ子が #1064 にある。下の「サイドバー」を参照 |
 * | `/admin/accounts` `/admin/awards` | admin ロールの専用ユーザーが要る（`e2e/admin/` の前例）。#1065 に残す |
 * | `/theater-experience` | WebGL（three.js）の描画完了を待つ仕掛けが別途要る。#1065 に残す |
 * | `/person/[id]` | 未認証でも開けるので `publicPages.spec.ts` の担当。そちらも未対象のまま |
 * | オーバーレイ（ドロワー・カレンダー等） | `overlays.spec.ts` の担当。認証済みのモバイルドロワーはそちらに足した |
 *
 * ## サイドバー
 *
 * **ウォッチリストは空のまま検査している。** 共有テストユーザーのウォッチリストは
 * どの spec も書き換えないため（書き込む spec はすべて専用ユーザーを使う）、
 * ここでは必ず空状態（「公開予定から探す」リンク）になる。
 *
 * 1件以上入れた状態は検査できない。行を描く `WatchlistItem` が
 * `role="button"` の中に削除ボタンを入れ子にしており（#1064）、データを入れると
 * `nested-interactive` で必ず落ちるため。#1064 が直ったら、ここに
 * 「ウォッチリスト1件以上」のケースを足すこと。
 *
 * ## 本文（一覧）の描画は待っていない
 *
 * `gotoWithTheme()` は `h1` までしか待たず、`waitForSidebar()` もサイドバーの
 * 中しか見ない。一覧ページのタイルが描かれる前に axe が走ることがある。
 * **サイドバーという認証済み固有の領域は確実に検査できている**が、本文の一覧は
 * タイミング次第。`publicPages.spec.ts` も同じ性質で、一覧の描画待ちは
 * a11y spec 全体の課題として #1071 で扱う。
 */

import { expect, test, type Page } from '@playwright/test';

import { ARIA_LABELS } from '@/constants';

import {
  HOME_ALLOWED_INCOMPLETE,
  THEMES,
  gotoWithTheme,
  expectNoA11yViolations,
} from './helpers';

/**
 * デスクトップ幅の検査だけ除外するルール
 *
 * ⚠️ **これは実在する違反の一時的な除外であり、「問題が無い」という判断ではない。**
 *
 * サイドバーのユーザーメニュー（`userMenu.tsx`）が、アバター画像を持たない
 * 利用者に対して表示名の頭文字を span で描いている。その結果ボタンの可視テキストが
 * 「頭文字 + 表示名」になり、`aria-label`（「表示名 ユーザーメニュー」）に
 * 含まれなくなるため `label-content-name-mismatch`（serious / WCAG 2.5.3）が出る。
 *
 * サイドバーは共通レイアウトにあるので、**下のページ全部が同じ1件で落ちる**。
 * 製品コードの修正は #1069 の担当範囲。ここで除外しているのは、1件の既知の違反の
 * ために認証済みページの回帰検査をまるごと入れられない状態にしないため。
 *
 * **#1069 が直ったらこの定数ごと消すこと。**（#1069 の完了条件に入れてある）
 *
 * SP 幅はサイドバーが `display: none` で検査対象に入らないため、除外しない。
 */
const AUTHENTICATED_DISABLED_RULES = ['label-content-name-mismatch'] as const;

/**
 * 認証済みで表示するページ
 *
 * `allowedIncomplete` は「axe が判定できないだけで実害が無い」と確認できた
 * incomplete（needs review）のルール。理由を必ず添えること。
 */
const AUTHENTICATED_PAGES = [
  {
    name: 'ホーム',
    path: '/',
    allowedIncomplete: HOME_ALLOWED_INCOMPLETE,
  },
  { name: '公開中', path: '/movies/now-showing' },
  { name: '公開予定', path: '/movies/upcoming' },
  { name: '設定', path: '/settings' },
  // クエリのキーは `query`（`ROUTES.SEARCH` のコメント／`useSearch.ts`）。
  // `q` だと検索が走らず、クエリなしの画面を検査することになる
  { name: '検索（結果あり）', path: '/search?query=inception' },
  {
    name: '受賞作品',
    path: '/awards',
    // axe が h1 に対し「Unable to determine previous heading」を返す。
    // 見出し階層は h1（ページタイトル）→ h2（賞）→ h3（部門）で正しく、
    // 飛びも逆転も無い。直前の見出しを特定できないという axe 側の制約
    // （`publicPages.spec.ts` の未認証版と同じ）。
    allowedIncomplete: ['heading-order'],
  },
] as const;

/**
 * ウォッチリストの取得待ち
 *
 * サイドバーは即座に描かれるが、`WatchlistPanel` は取得が終わるまでスピナーを
 * 出す。本番ビルドでも数秒かかることがあり、並列実行時はさらに伸びる。
 */
const WATCHLIST_FETCH_TIMEOUT = 30000;

/**
 * サイドバーが描き終わるまで待つ
 *
 * 2つの役割がある。
 *
 * 1. **未認証で走っていないことの確認。** `storageState` の生成に失敗しても
 *    テストはそこで落ちず、未認証ページを検査して通ってしまう。
 *    「認証済みを見ている」というこのファイルの前提が黙って崩れるので、
 *    認証済みでしか描かれない要素（サイドバー・公開カレンダーのボタン）を見る
 * 2. **読み込み中を検査しないこと。** 空状態の導線（「公開予定から探す」）まで
 *    待てばウォッチリストの取得は完了している。ここが空振りすると、
 *    中身の無いスピナーに axe を当てるだけになる
 */
const waitForSidebar = async (page: Page): Promise<void> => {
  const sidebar = page.getByRole('complementary', { name: 'サイドバー' });
  await expect(sidebar).toBeVisible();

  // 未認証では `undefined` が渡って描画されない（`appLayout.tsx`）
  await expect(
    sidebar.getByRole('button', { name: ARIA_LABELS.OPEN_CALENDAR }),
  ).toBeVisible();

  await expect(
    sidebar.getByRole('link', { name: '公開予定から探す' }),
  ).toBeVisible({ timeout: WATCHLIST_FETCH_TIMEOUT });
};

test.describe('アクセシビリティ（認証済みページ）', () => {
  // 一覧ページは画像が多く、既定の30秒を超えることがある
  test.describe.configure({ timeout: 60000 });

  for (const theme of THEMES) {
    for (const entry of AUTHENTICATED_PAGES) {
      const { name, path } = entry;
      const allowedIncomplete =
        'allowedIncomplete' in entry ? entry.allowedIncomplete : [];

      test(`${name} - ${theme}`, async ({ page }) => {
        await gotoWithTheme(page, path, theme);
        await waitForSidebar(page);

        await expectNoA11yViolations(
          page,
          `${name} / ${theme}`,
          AUTHENTICATED_DISABLED_RULES,
          allowedIncomplete,
        );
      });
    }
  }

  /**
   * SP 幅（#1065 のコメント）
   *
   * 上のケースは `playwright.config.ts` の Desktop Chrome（1280×720）で走る。
   * 幅を変えると DOM ではなく CSS の都合で検査対象が入れ替わるため、別に回す。
   *
   * - 出るもの: ボトムナビ・ハンバーガーボタン
   * - 消えるもの: サイドバー（lg 未満は `display: none`）
   *
   * 未認証の SP は `publicPages.spec.ts` が見ている。**認証済みを分けて見る理由は
   * ボトムナビの項目数が変わること**で、保護対象（ウォッチリスト・お気に入り）が
   * 加わって 2件 → 4件になる（`bottomNav.tsx`）。幅が狭いまま項目が増えるため、
   * 文字の折り返し・当たり判定・コントラストは未認証と同じにならない。
   */
  test.describe('SP 幅', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    for (const theme of THEMES) {
      test(`ホーム（SP） - ${theme}`, async ({ page }) => {
        await gotoWithTheme(page, '/', theme);

        // 認証済みのボトムナビ（4件）が描かれてから検査する。
        // 件数まで見ているのは、未認証で走ると2件になり、SP を足した意味が
        // 無くなるため（未認証の2件は publicPages.spec.ts が見ている）
        const bottomNav = page.getByRole('navigation', {
          name: ARIA_LABELS.PRIMARY_NAV,
        });
        await expect(bottomNav).toBeVisible();
        await expect(bottomNav.getByRole('link')).toHaveCount(4);

        // ハンバーガーボタン（lg 未満でのみ描画）
        await expect(
          page.getByRole('button', { name: ARIA_LABELS.OPEN_MENU }),
        ).toBeVisible();

        await expectNoA11yViolations(
          page,
          `ホーム（SP） / ${theme}`,
          [],
          HOME_ALLOWED_INCOMPLETE,
        );
      });
    }
  });
});
