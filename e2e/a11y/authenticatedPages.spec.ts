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
 * | `/watchlist` `/favorites` の**タイル** | ページ自体は検査対象に入れたが、共有テストユーザーのデータが**必ず空**なのでタイルは1枚も描かれない。下の「データが空であること」を参照 |
 * | サイドバーの `WatchlistItem` | 同じ理由。行が1つも描かれない。下の「サイドバー」を参照 |
 * | `/admin/accounts` `/admin/awards` | admin ロールの専用ユーザーが要る（`e2e/admin/` の前例）。#1065 に残す |
 * | `/theater-experience` | WebGL（three.js）の描画完了を待つ仕掛けが別途要る。#1065 に残す |
 * | `/person/[id]` | 未認証でも開けるので `publicPages.spec.ts` の担当。そちらも未対象のまま |
 * | オーバーレイ（ドロワー・カレンダー等） | `overlays.spec.ts` の担当。認証済みのモバイルドロワーはそちらに足した |
 *
 * ## データが空であること（サイドバー・`/watchlist`・`/favorites`）
 *
 * 共有テストユーザーの**ウォッチリストは必ず空**。書き込む spec はすべて
 * 専用ユーザー（`openDedicatedSession`）を使うため。
 * **お気に入りもほぼ必ず空**で、共有ユーザーを使う `favorites.spec.ts` が
 * before/afterEach で `cleanupFavorites()` を回す（`fullyParallel` なので
 * その spec の実行中だけ一時的に1件入りうる）。
 *
 * つまり**この3箇所はいずれも「空状態の画面」しか検査していない**。
 * `WatchlistTile` / `FavoriteTile` / `WatchlistItem` に axe が当たることはない。
 * #1033 Phase 2 で `nested-interactive`（#1060 / #1064）を直したが、
 * **その回帰をここで止めることはできない。**
 *
 * さらに `waitForSidebar()` は空状態の導線（「公開予定から探す」）が出るまで待つ。
 * サイドバーに1件でも入っていればこの待ちがタイムアウトして落ちるので、
 * **データを入れるなら待ち方も一緒に直すこと**。
 *
 * 1件以上の状態を検査するにはシード付きの専用ユーザーが要る（#1056 の範囲）。
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
  // #1033 Phase 2 でタイルを stretched Link に作り替え、#1060 の
  // nested-interactive が解消したので検査対象に入れる。
  // ⚠️ ただし共有テストユーザーのデータは**必ず空**なので、ここで検査できるのは
  //    空状態の画面（見出し・ツールバー・空メッセージ）だけ。タイルには
  //    axe が当たらない。理由と直し方は冒頭の「データが空であること」を参照
  { name: 'ウォッチリスト', path: '/watchlist' },
  { name: 'お気に入り', path: '/favorites' },
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
          [],
          allowedIncomplete,
        );
      });
    }
  }

  /**
   * ユーザーメニューの頭文字（#1069）
   *
   * `label-content-name-mismatch` を避けるため、頭文字は DOM のテキストではなく
   * `userMenu.module.scss` の `::before { content: attr(data-initial) }` で描いている。
   *
   * **この CSS を消しても他のどのテストも落ちない。** jest は `next/jest` で
   * CSS Modules をプロキシに差し替えるので SCSS を評価せず、axe は
   * 「文字が無い」ことを違反としない。つまり画面から頭文字だけが黙って消える。
   * ここだけが実ブラウザの computed style を見てそれを止める。
   */
  test('ユーザーメニューの頭文字が ::before で描かれている', async ({
    page,
  }) => {
    await gotoWithTheme(page, '/', 'light');
    await waitForSidebar(page);

    const sidebar = page.getByRole('complementary', { name: 'サイドバー' });
    const avatar = sidebar.locator('[data-initial]');

    // アバター画像を持つ利用者では頭文字そのものが描かれない。
    // 共有テストユーザーは画像なしなので、居ないなら前提が崩れている
    await expect(avatar).toHaveCount(1);

    const initial = await avatar.getAttribute('data-initial');
    expect(initial).toBeTruthy();

    const content = await avatar.evaluate(
      (el) => window.getComputedStyle(el, '::before').content,
    );
    expect(content).toBe(`"${initial}"`);
  });

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
