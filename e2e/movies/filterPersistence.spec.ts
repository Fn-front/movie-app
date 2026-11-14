/**
 * フィルター条件の永続化 E2Eテスト
 *
 * - 認証済み: saved_filters によるリロード後の復元
 * - 未認証: URLクエリによるページ遷移後の復元（Issue #567）
 */

import { test, expect } from '../fixtures/auth';
import { clearSavedFiltersForTestUser, resetFilters } from '../helpers/api';
import { filterButton, movieTiles } from '../helpers/locators';
import { waitForWriteResponse } from '../helpers/writeResponse';

test.describe('フィルター条件がリロード後も保持される', () => {
  // goto×2＋フィルタ操作＋PUT/GET待ち＋reload と重く、並列負荷下で30秒予算を
  // 超過しうるためタイムアウトを延長する
  test.describe.configure({ timeout: 60000 });

  test.beforeEach(async ({ request }) => {
    await resetFilters(request);
  });

  /**
   * 保存したフィルターを残さない。
   *
   * ⚠️ **この spec は共有の `TEST_USER` で `saved_filters` を書く。**
   * 片付けないと、後に走る spec が「保存済みフィルターを持つ利用者」として
   * 始まる。#1062 で復元結果を URL へ書き戻すようにしたため、それは
   * **一覧ページの URL にクエリが付く**という形で他 spec に現れる
   * （`movieDetailRoute.spec.ts` の `/\/movies\/now-showing$/` が落ちる）。
   *
   * `beforeEach` だけでは足りない。自分の開始時は綺麗にできても、
   * 他 spec の開始時は綺麗にならない
   */
  test.afterEach(async () => {
    await clearSavedFiltersForTestUser();
  });

  test('リバイバル除外 → リロード → APIレスポンスと復元を確認', async ({
    page,
  }) => {
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
  test('saved_filters からの復元でもURLに反映される', async ({ page }) => {
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
