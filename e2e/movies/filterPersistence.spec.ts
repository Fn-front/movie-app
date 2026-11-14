/**
 * フィルター条件の永続化 E2Eテスト
 *
 * - 認証済み: saved_filters によるリロード後の復元
 * - 未認証: URLクエリによるページ遷移後の復元（Issue #567）
 */

import type { Page } from '@playwright/test';

import { test, expect } from '../fixtures/auth';
import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import { resetFilters } from '../helpers/api';
import { filterButton, movieTiles } from '../helpers/locators';
import { runScopedEmail } from '../helpers/runScope';
import { waitForWriteResponse } from '../helpers/writeResponse';

/**
 * 本 describe 専用のユーザー
 *
 * ⚠️ **共有の TEST_USER を使わない。** このテストが待つ
 * `GET /api/filters` は `READ_USER_DATA`（200回/分・**ユーザー単位**）で
 * 制限され、そのカウンタを `watchlist` / `favorites/lookup` /
 * `user/settings` / `watchlist/calendar` など**7ルートで共有**している
 * （`src/constants/rateLimit.ts`）。
 *
 * シャードは `fullyParallel` で共有ユーザーのまま多数の画面を開くため、
 * 枠が尽きると GET が 429 になり、200 を待つここが 30 秒でタイムアウトする。
 * 実際に CI のトレースで `/api/filters` を含む6エンドポイントが同時に
 * 429 を返していた。専用ユーザーなら自分のカウンタだけを使う（#750 と同じ方針）
 */
const USER = {
  email: runScopedEmail('e2e-filter-persistence'),
  password: 'FilterPersistE2e1',
} as const;

test.describe('フィルター条件がリロード後も保持される', () => {
  // goto×2＋フィルタ操作＋PUT/GET待ち＋reload と重く、並列負荷下で30秒予算を
  // 超過しうるためタイムアウトを延長する。ユーザー作成（bcrypt）も挟む
  test.describe.configure({ timeout: 120000 });

  let session: DedicatedSession;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(120000);
    session = await openDedicatedSession(browser, USER);
    page = session.page;
  });

  test.afterAll(async () => {
    await session.close();
  });

  test.beforeEach(async () => {
    // 専用ユーザーのセッションで消す。共有の `request` を使うと別人の
    // 行を消すうえ、共有カウンタも減らしてしまう
    await resetFilters(page.request);
  });

  test('リバイバル除外 → リロード → APIレスポンスと復元を確認', async () => {
    await page.goto('/movies/upcoming');
    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // フィルターモーダルを開いてリバイバル除外を設定
    await page.getByRole('button', { name: /フィルター/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByText('リバイバル除外').click();

    // 適用してPUTリクエストの内容を確認
    const putPromise = waitForWriteResponse(page, {
      urlPart: '/api/filters',
      methods: ['PUT'],
      label: 'フィルター保存',
    });
    await dialog.getByRole('button', { name: '適用' }).click();
    const putResponse = await putPromise;

    const putBody = putResponse.request().postDataJSON();

    // PUTにis_revival: falseが含まれていることを確認
    expect(putBody.is_revival).toBe(false);

    // リロードしてGETレスポンスを確認
    const getPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/filters') &&
        res.request().method() === 'GET' &&
        res.status() === 200,
      { timeout: 30000 },
    );
    await page.reload();
    const getResponse = await getPromise;
    const getBody = await getResponse.json();

    // GETにis_revival: falseが含まれていることを確認
    expect(getBody.data.filter_conditions.is_revival).toBe(false);

    // 映画読み込み待ち
    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // フィルターモーダルを開いてUIに反映されているか確認
    await page.getByRole('button', { name: /フィルター/ }).click();
    const dialogAfter = page.getByRole('dialog');
    await expect(dialogAfter).toBeVisible();
    await expect(
      dialogAfter.locator('input[name="revival"][value="false"]'),
    ).toBeChecked();
  });

  /**
   * saved_filters からの復元でも URL と一致する（#1062）
   *
   * ⚠️ **到達条件が狭い。** 認証済み かつ URL が空 かつ **localStorage も空**の
   * ときだけ saved_filters が効く。同じブラウザで一度でもフィルターを触ると
   * localStorage にも書かれてそちらが勝つため、明示的に消す必要がある
   * （`resetFilters` はサーバー側しか消さない）。
   * この経路は従来 E2E カバレッジがゼロだった
   */
  /**
   * 書き戻しがオーバーレイの履歴エントリを置き換えない（#1062 / #1026）
   *
   * ⚠️ **CI でだけ落ちた回帰。** 書き戻しは effect でしか打てないため、
   * 初期描画のあとに URL が変わる。`saved_filters` 由来の窓は
   * 「セッション解決 + GET /api/filters の往復」で、ローカルでは
   * クリックより先に着地してしまい再現しない。
   *
   * その間にオーバーレイを開くと `useOverlayHistory` が `pushState` で
   * 履歴を積む。そこへ `router.replace` が着地すると**ページではなく
   * オーバーレイのエントリ**を置き換え、`history.state.__overlayHistory` が
   * 消える。閉じる・進むの辻褄が崩れ、実測では閉じるボタンを押す瞬間に
   * モーダルが DOM から外れた（`element was detached from the DOM`）。
   *
   * ⚠️ **GET を遅らせないと窓が作れない。** 素直に書くと着地が先に終わる
   */
  // ⚠️ fixture の `page` を取らない（下の saved_filters テストと同じ理由）
  test('書き戻しはオーバーレイの履歴エントリを置き換えない', async () => {
    // 下準備: saved_filters に絞り込みを入れる
    await page.goto('/movies/now-showing');
    await movieTiles(page)
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    const put = waitForWriteResponse(page, {
      urlPart: '/api/filters',
      methods: ['PUT'],
      label: 'フィルター保存',
    });
    await filterButton(page).click();
    const setup = page.getByRole('dialog');
    await expect(setup).toBeVisible();
    await setup
      .locator('div[class*="c_filter__section"]')
      .filter({ has: page.getByRole('heading', { name: 'ジャンル' }) })
      .locator('label[class*="c_filter__tag"]')
      .first()
      .click();
    await setup.getByRole('button', { name: '適用' }).click();
    await put;
    await expect(setup).not.toBeVisible();

    // localStorage を消して saved_filters 経路へ寄せ、GET を遅らせる
    await page.evaluate(() => window.localStorage.clear());
    await page.route('**/api/filters**', async (route) => {
      if (route.request().method() === 'GET') {
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      await route.continue();
    });

    await page.goto('/movies/now-showing');
    await filterButton(page).waitFor({ timeout: 30000 });

    // 書き戻しが着地する前にオーバーレイを開く
    await filterButton(page).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // 開いたまま着地させる
    await page.waitForTimeout(3500);

    // オーバーレイのエントリが生きていること
    expect(
      await page.evaluate(
        () => window.history.state?.__overlayHistory !== undefined,
      ),
    ).toBe(true);

    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);

    // 進むで開き直せること（#1053 と同じ契約）
    await page.goForward();
    await expect(dialog).toBeVisible({ timeout: 15000 });
  });

  // ⚠️ fixture の `page` を取らない。この describe は専用ユーザーの
  // セッション（`beforeAll` で開いた `page`）を使い回す。fixture を取ると
  // 共有の TEST_USER になり、#1176 が避けた共有カウンタの枯渇に戻る
  test('saved_filters からの復元でもURLに反映される', async () => {
    await page.goto('/movies/now-showing');
    await movieTiles(page)
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // サーバーへ保存させる
    const put = waitForWriteResponse(page, {
      urlPart: '/api/filters',
      methods: ['PUT'],
      label: 'フィルター保存',
    });
    await filterButton(page).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const genreSection = dialog
      .locator('div[class*="c_filter__section"]')
      .filter({ has: page.getByRole('heading', { name: 'ジャンル' }) });
    await genreSection.locator('label[class*="c_filter__tag"]').first().click();
    await dialog.getByRole('button', { name: '適用' }).click();
    await expect(dialog).not.toBeVisible();
    await put;

    // localStorage を消し、クエリの無い URL で入り直す＝ saved_filters 経路
    await page.evaluate(() => window.localStorage.clear());
    await page.goto('/movies/now-showing');
    await movieTiles(page)
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    await expect(page).toHaveURL(/genre_ids=/);
    await expect(filterButton(page)).toHaveAccessibleDescription('絞り込み中');
  });
});

test.describe('未認証でもフィルターがページ遷移後に保持される', () => {
  // 一覧の読み込み・遷移・復帰を含むため30秒予算を超過しうる
  test.describe.configure({ timeout: 60000 });

  // storageStateを空にして未認証状態にする
  test.use({ storageState: { cookies: [], origins: [] } });

  test('並び順を変更 → 他ページへ遷移 → ブラウザバックで復元される', async ({
    page,
  }) => {
    await page.goto('/movies/now-showing');
    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // 並び順を「人気順」に変更
    const sortSelect = page.getByRole('combobox');
    await sortSelect.click();
    await page.getByRole('option', { name: '人気順' }).click();

    // URLに反映される（未認証でも復元手段が残る）
    await expect(page).toHaveURL(/sort_by=popularity/);

    // 他ページへ遷移してからブラウザバック
    await page.getByRole('link', { name: '公開予定' }).first().click();
    await expect(page).toHaveURL(/\/movies\/upcoming/);

    await page.goBack();

    await expect(page).toHaveURL(/sort_by=popularity/);
    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // 初期レンダリングからデフォルト値を経由せず復元されている
    await expect(sortSelect).toContainText('人気順');
  });

  test('フィルター変更で履歴が積まれない（1回のバックで前ページへ戻る）', async ({
    page,
  }) => {
    await page.goto('/movies/upcoming');
    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    await page.getByRole('link', { name: '公開中' }).first().click();
    await expect(page).toHaveURL(/\/movies\/now-showing/);

    // 並び順を2回変更（pushなら履歴が2段積まれる）
    const sortSelect = page.getByRole('combobox');
    await sortSelect.click();
    await page.getByRole('option', { name: '人気順' }).click();
    await expect(page).toHaveURL(/sort_by=popularity/);

    await sortSelect.click();
    await page.getByRole('option', { name: '評価順' }).click();
    await expect(page).toHaveURL(/sort_by=vote_average/);

    // replace のため1回のバックで前ページへ戻る
    await page.goBack();
    await expect(page).toHaveURL(/\/movies\/upcoming/);
  });

  test('ナビリンク経由で戻ってもフィルターが保持される（localStorage）', async ({
    page,
  }) => {
    await page.goto('/movies/now-showing');
    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // 並び順を「人気順」に変更
    const sortSelect = page.getByRole('combobox');
    await sortSelect.click();
    await page.getByRole('option', { name: '人気順' }).click();
    await expect(page).toHaveURL(/sort_by=popularity/);

    // サイドナビのリンクで往復する（URLにクエリが付かない経路）
    await page.getByRole('link', { name: '公開予定' }).first().click();
    await expect(page).toHaveURL(/\/movies\/upcoming$/);

    await page.getByRole('link', { name: '公開中' }).first().click();
    await expect(page).toHaveURL(/\/movies\/now-showing$/);

    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // クエリは無いが localStorage から復元される
    //
    // ⚠️ ここで URL にクエリが付かないのは**意図どおり**（#1062）。
    // 書き戻すのは絞り込みが掛かっているときだけで、並び順は
    // `hasActiveFilterConditions` の数える条件に入らない。
    // 「絞り込み中」の印も出ないので、URL と画面の食い違いは生じない。
    // 絞り込みを伴う場合は下の「ナビリンク経由で戻ると…」を参照
    await expect(sortSelect).toContainText('人気順');
  });

  /**
   * #1062: 復元した絞り込みを URL にも書き戻す
   *
   * #1051 で「URL が正」にしたのは履歴操作（戻る／進む）の経路だけで、
   * マウント時の復元は URL と食い違ったまま残っていた。利用者から見ると
   * 「戻ると絞り込みが消えるのに、ナビリンクで往復すると戻ってくる」。
   *
   * ⚠️ **URL だけを見ても検出できない。** 「クエリが無い」状態は
   * 「絞り込まれていない」と「絞り込まれているのに URL に出ていない」の
   * 両方を含む。絞り込みの印（`aria-describedby`）と**対で**見る
   */
  test('ナビリンク経由で戻ると、絞り込みがURLにも復元される', async ({
    page,
  }) => {
    await page.goto('/movies/now-showing');
    await movieTiles(page)
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // ジャンルで絞り込む（並び順と違い「絞り込み」として数えられる条件）
    await filterButton(page).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // 入力は視覚的に隠してあり、利用者はラベルをクリックして切り替える
    const genreSection = dialog
      .locator('div[class*="c_filter__section"]')
      .filter({ has: page.getByRole('heading', { name: 'ジャンル' }) });
    await genreSection.locator('label[class*="c_filter__tag"]').first().click();
    await dialog.getByRole('button', { name: '適用' }).click();
    await expect(dialog).not.toBeVisible();

    await expect(page).toHaveURL(/genre_ids=/);
    await expect(filterButton(page)).toHaveAccessibleDescription('絞り込み中');

    // サイドナビのリンクで往復する（URLにクエリが付かない経路）
    await page.getByRole('link', { name: '公開予定' }).first().click();
    await expect(page).toHaveURL(/\/movies\/upcoming/);
    await movieTiles(page)
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // ⚠️ localStorage のキーは画面共通なので、**移動先の URL にも**書き戻される。
    // 一覧の絞り込み自体が以前から画面をまたいで復元されており、
    // 書き戻しはそれを URL に見えるようにするだけ（挙動は増えていない）
    await expect(page).toHaveURL(/genre_ids=/);
    await expect(filterButton(page)).toHaveAccessibleDescription('絞り込み中');

    await page.getByRole('link', { name: '公開中' }).first().click();
    await expect(page).toHaveURL(/\/movies\/now-showing/);
    await movieTiles(page)
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // URL と画面の両方が「絞り込み中」で一致していること
    await expect(page).toHaveURL(/genre_ids=/);
    await expect(filterButton(page)).toHaveAccessibleDescription('絞り込み中');
  });

  /**
   * タブ（`release_type`）も URL に出す（#1062）
   *
   * タブは一覧の中身を丸ごと差し替えるので、URL に無いと
   * **ストリーミングを見ている人が共有した URL を開いた相手に劇場公開が出る**。
   *
   * ⚠️ 「絞り込み中」の印は**出ない**（タブは絞り込みではない）。
   * URL と印で判定が分かれるのは意図どおりなので、ここでは印を見ない
   */
  test('ストリーミングタブもナビ往復後のURLに復元される', async ({ page }) => {
    await page.goto('/movies/now-showing');
    await movieTiles(page)
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    await page.getByRole('tab', { name: 'ストリーミング' }).click();
    await expect(page).toHaveURL(/release_type=streaming/);

    await page.getByRole('link', { name: '公開予定' }).first().click();
    await expect(page).toHaveURL(/\/movies\/upcoming/);
    await movieTiles(page)
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    await page.getByRole('link', { name: '公開中' }).first().click();
    await expect(page).toHaveURL(/\/movies\/now-showing/);
    await movieTiles(page)
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // URL と画面のタブが一致していること
    await expect(page).toHaveURL(/release_type=streaming/);
    await expect(
      page.getByRole('tab', { name: 'ストリーミング' }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  /**
   * 書き戻しは `router.replace` なので履歴を積まない。
   * `push` になっていると、戻るが空振りして同じページに留まる
   */
  test('書き戻しても戻るが空振りしない', async ({ page }) => {
    await page.goto('/movies/now-showing');
    await movieTiles(page)
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    await filterButton(page).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const genreSection = dialog
      .locator('div[class*="c_filter__section"]')
      .filter({ has: page.getByRole('heading', { name: 'ジャンル' }) });
    await genreSection.locator('label[class*="c_filter__tag"]').first().click();
    await dialog.getByRole('button', { name: '適用' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(/genre_ids=/);

    await page.getByRole('link', { name: '公開予定' }).first().click();
    await expect(page).toHaveURL(/\/movies\/upcoming/);
    await movieTiles(page)
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    await page.getByRole('link', { name: '公開中' }).first().click();
    await expect(page).toHaveURL(/\/movies\/now-showing\?.*genre_ids=/);

    // 1回の戻るで公開予定へ帰れること
    await page.goBack();
    await expect(page).toHaveURL(/\/movies\/upcoming/);
  });

  test('不正なクエリパラメータでもエラーにならずデフォルトで表示される', async ({
    page,
  }) => {
    await page.goto(
      '/movies/now-showing?sort_by=invalid&release_type=tv&genre_ids=abc&date_range_gte=2026%2F01%2F01&is_revival=maybe',
    );

    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // 不正値はフォールバックされ、既定の並び順が表示される
    await expect(page.getByRole('combobox')).toContainText('公開日順');
  });
});
