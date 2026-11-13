/**
 * 映画詳細のURL化 E2Eテスト（#1033）
 *
 * - 一覧からはモーダルで開く。状態は一覧のURLに `?movie_id=<id>` で持つので、
 *   **リロードしても一覧ごと復元される**し、戻るで閉じられる
 * - タイトルはリンクのままなので、Ctrl・中クリックで `/movies/<id>`
 *   （全画面ページ）が新しいタブに開く
 * - 共有ボタンが共有するのは、モーダルのURLではなく `/movies/<id>`
 *
 * 表示内容は /api/movies/:id をモックして TMDb 非依存にする。ただし
 * 全画面ページ（Server Component）の存在確認と `<title>` 生成だけは
 * サーバ側で TMDb を呼ぶため、実在が安定している MOVIE_ID を使う。
 */

import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';

import { ARIA_LABELS } from '@/constants';

import { movieTileDetailLinks, movieTiles } from '../helpers/locators';
import {
  MISSING_MOVIE_ID,
  MOVIE_ID,
  MOVIE_TITLE,
  mockMovieDetail,
} from '../helpers/movieDetail';

/**
 * 一覧が描画されるのを待つ（TMDb由来のデータが無い run ではスキップする）
 */
const waitForList = (page: Page) =>
  movieTiles(page)
    .first()
    .waitFor({ state: 'visible', timeout: 30000 })
    .then(() => true)
    .catch(() => false);

/** モーダルを開いている一覧のURL（/movies/now-showing?...movie_id=<数値>） */
const MODAL_URL = /\/movies\/now-showing\?.*movie_id=\d+/;

/** 全画面ページのURL（/movies/<数値>） */
const PAGE_URL = /\/movies\/\d+$/;

test.describe('映画詳細のURL化', () => {
  test.beforeEach(async ({ page }) => {
    await mockMovieDetail(page);
  });

  test('一覧から開くとモーダルが出て、URLに movie_id が付く', async ({
    page,
  }) => {
    await page.goto('/movies/now-showing');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    const before = await page.evaluate(() => history.length);

    await movieTileDetailLinks(page).first().click();

    // 一覧のページから出ない（上に重なるだけ）
    await expect(page).toHaveURL(MODAL_URL);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('dialog').getByText('詳細情報')).toBeVisible({
      timeout: 15000,
    });
    // 一覧は残っている（Radix が背景を aria-hidden にするので CSS で見る）
    await expect(page.locator('h1')).toHaveText('公開中の映画');

    // 増えてよいのは history.pushState の1つだけ。`Modal` が `useOverlayHistory` で
    // 自前のエントリも積むと2つ伸びる。戻る／進む／× の見え方は二重でも
    // 正しいままなので、ここで数えないと気づけない（#1033）
    await expect
      .poll(() => page.evaluate(() => history.length))
      .toBe(before + 1);
  });

  /**
   * この設計の主目的。状態をコンポーネントに持っていた頃は、リロードで
   * モーダルが消えて一覧だけになっていた
   */
  test('モーダル表示中にリロードすると一覧ごと復元される', async ({ page }) => {
    await page.goto('/movies/now-showing');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    await movieTileDetailLinks(page).first().click();
    await expect(page).toHaveURL(MODAL_URL);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });

    await page.reload();

    await expect(page).toHaveURL(MODAL_URL);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('h1')).toHaveText('公開中の映画');
  });

  test('戻るでモーダルが閉じ、進むで再び開く', async ({ page }) => {
    await page.goto('/movies/now-showing');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    await movieTileDetailLinks(page).first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });

    await page.goBack();

    await expect(page).toHaveURL(/\/movies\/now-showing$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.goForward();

    await expect(page).toHaveURL(MODAL_URL);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
  });

  /**
   * 自分で開いた場合は × も `back` で閉じる（#1079）
   *
   * 閉じ方が2通りに分かれたので、`back` 側が生きていることを実ブラウザで見る。
   * **決め手は `goForward`。** 目印が読めずに `replace` へ落ちると
   * モーダルは同じように閉じるが、履歴が消えて「進む」が空振りする。
   * URL と見た目だけでは区別できないので、ここを見ないと
   * サイレントに劣化する
   */
  test('一覧から開いたモーダルは × で閉じても進むで開き直せる', async ({
    page,
  }) => {
    await page.goto('/movies/now-showing');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    await movieTileDetailLinks(page).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    await dialog.getByRole('button', { name: '閉じる' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/movies\/now-showing$/);

    await page.goForward();

    await expect(page).toHaveURL(MODAL_URL);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
  });

  /**
   * モーダルで開く都合でリンクを捨てると、新しいタブで開けなくなる。
   * 左クリックだけを横取りしていることを実際の操作で固定する
   */
  test('Ctrl+クリックで全画面ページが新しいタブに開く', async ({ page }) => {
    await page.goto('/movies/now-showing');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    const [newPage] = await Promise.all([
      page.context().waitForEvent('page'),
      movieTileDetailLinks(page)
        .first()
        .click({ modifiers: ['ControlOrMeta'] }),
    ]);

    await expect(newPage).toHaveURL(PAGE_URL);
    // 元のタブは一覧のまま（モーダルも開かない）
    await expect(page).toHaveURL(/\/movies\/now-showing$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await newPage.close();
  });

  /**
   * 共有するのは全画面ページのURL。モーダルのURL（一覧＋クエリ）を渡すと、
   * 受け取った人に一覧の絞り込みごと共有してしまう
   */
  test('共有ボタンが全画面ページのURLをコピーする', async ({ page }) => {
    // 共有シートが無い環境（PCのブラウザ）に揃え、コピー先を観測可能にする
    await page.addInitScript(() => {
      // @ts-expect-error 共有シートが無い環境を再現する
      delete window.navigator.share;
      Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (text: string) => {
            (window as unknown as { __copied?: string }).__copied = text;
            return Promise.resolve();
          },
        },
      });
    });

    await page.goto('/movies/now-showing');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    await movieTileDetailLinks(page).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    await dialog.getByRole('button', { name: /を共有$/ }).click();

    // Radix のトーストは読み上げ用の複製を同時に出すため2件一致する。
    // 既存の E2E（recommendationDismiss / changePassword ほか）と同じく first() で絞る
    await expect(
      page.getByText('リンクをコピーしました').first(),
    ).toBeVisible();

    const copied = await page.evaluate(
      () => (window as unknown as { __copied?: string }).__copied,
    );
    expect(copied).toMatch(/\/movies\/\d+$/);
    expect(copied).not.toContain('movie_id');
    expect(copied).not.toContain('now-showing');
  });

  test('/movies/<id> を直接開くと専用ページが全画面で表示される', async ({
    page,
  }) => {
    await page.goto(`/movies/${MOVIE_ID}`);

    await expect(page.getByRole('dialog')).toHaveCount(0);
    // 作品名が h1。モーダルでは h3 なので、器が切り替わったことまで見える
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 20000,
    });
    // ヘッダーを持つ通常のアプリ画面として出る
    await expect(page.getByRole('banner')).toBeVisible();
  });

  /**
   * ⚠️ 接尾辞（`/\| Movie App$/`）では検証にならない。アプリのどのページも
   * その形なので、存在しないIDに差し替えても通ってしまう。完全一致で見る
   */
  test('直接アクセスでは作品名がタイトルになる', async ({ page }) => {
    await page.goto(`/movies/${MOVIE_ID}`);

    await expect(page).toHaveTitle(`${MOVIE_TITLE} | Movie App`);
  });

  test('存在しない映画IDは404ページになる', async ({ page }) => {
    const response = await page.goto(`/movies/${MISSING_MOVIE_ID}`);

    expect(response?.status()).toBe(404);
  });

  test('書式が不正な映画IDは404ページになる', async ({ page }) => {
    const response = await page.goto('/movies/abc');

    expect(response?.status()).toBe(404);
  });

  /**
   * `/movies/[id]` は `/movies/now-showing` の兄弟になる。ページ解決では
   * 静的セグメントが優先されるので、一覧は一覧のまま出る
   */
  test('一覧ページは動的セグメントに食われない', async ({ page }) => {
    for (const path of ['/movies/now-showing', '/movies/upcoming']) {
      const response = await page.goto(path);

      expect(response?.status()).toBe(200);
      await expect(page.getByRole('tab', { name: '劇場公開' })).toBeVisible({
        timeout: 20000,
      });
    }
  });

  test('一覧ページどうしをリンクで行き来しても中身が入れ替わる', async ({
    page,
  }) => {
    await page.goto('/movies/now-showing');
    await expect(
      page.getByRole('heading', { level: 1, name: '公開中の映画' }),
    ).toBeVisible({ timeout: 20000 });

    await page.getByRole('link', { name: '公開予定' }).first().click();

    await expect(page).toHaveURL(/\/movies\/upcoming$/);
    await expect(
      page.getByRole('heading', { level: 1, name: '公開予定の映画' }),
    ).toBeVisible({ timeout: 20000 });

    await page.getByRole('link', { name: '公開中' }).first().click();

    await expect(page).toHaveURL(/\/movies\/now-showing$/);
    await expect(
      page.getByRole('heading', { level: 1, name: '公開中の映画' }),
    ).toBeVisible({ timeout: 20000 });
  });

  /**
   * 絞り込みとモーダルは別の関心事。`movie_id` の増減でフィルターが
   * 作り直されると、条件は同じでも配列の実体が差し替わって再描画が広がる
   * （#1051 / #1059 の作りと噛み合わせる必要がある）
   */
  test('絞り込んだままモーダルを開いても絞り込みが消えない', async ({
    page,
  }) => {
    await page.goto('/movies/now-showing');
    const hasTile = await waitForList(page);
    test.skip(!hasTile, '映画データが無いためスキップ');

    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: '人気順' }).click();
    await expect(page).toHaveURL(/sort_by=popularity/);

    await movieTileDetailLinks(page).first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });

    // 並び順はURLにもUIにも残る（背景は aria-hidden なので CSS で見る）
    await expect(page).toHaveURL(/sort_by=popularity/);
    await expect(page).toHaveURL(/movie_id=\d+/);
    await expect(page.locator('[role="combobox"]')).toContainText('人気順');

    await page.goBack();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('combobox')).toContainText('人気順');
  });

  /**
   * 直接着地したモーダル（#1079）
   *
   * 閉じる処理が `router.back()` だけだと、**自分で開いていないエントリ**に
   * 着地したときに出口が無くなる。`open` は URL から導出しているので、
   * `back()` が効かない／アプリの外へ出る、のどちらかになる。
   *
   * ⚠️ **「履歴が1つも無いタブ」は Playwright では再現できない。**
   * `about:blank` から `goto` するので必ず `history.length >= 2` になる。
   * そちらは `useMovieDetailQuery.test.ts` が固定している。
   * ここで見られるのは「戻る先がアプリの外」のケース。
   */
  test.describe('直接着地したモーダル', () => {
    /** アプリの外から `?movie_id=` 付きのURLへ着地した状態を作る */
    const landFromOutside = async (page: Page) => {
      // 1つ前のエントリをアプリ外にする。about:blank はナビゲーションとして
      // 履歴に積まれるので、ここから goto すれば「外から来た」形になる
      await page.goto('about:blank');
      await page.goto(`/movies/now-showing?movie_id=${MOVIE_ID}`);

      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20000 });
    };

    test('閉じてもアプリの外へ出ず、一覧が残る', async ({ page }) => {
      await landFromOutside(page);

      await page
        .getByRole('dialog')
        .getByRole('button', { name: '閉じる' })
        .click();

      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).toHaveURL(/\/movies\/now-showing$/);
      await expect(page.locator('h1')).toHaveText('公開中の映画');
    });

    test('Esc でも閉じる', async ({ page }) => {
      await landFromOutside(page);

      await page.keyboard.press('Escape');

      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).toHaveURL(/\/movies\/now-showing$/);
    });

    // 閉じるのは `replace` なので履歴は増えない。`push` で閉じると
    // 「戻る」でモーダルが開き直してしまう
    test('閉じても履歴が増えない', async ({ page }) => {
      await landFromOutside(page);

      const before = await page.evaluate(() => history.length);

      await page
        .getByRole('dialog')
        .getByRole('button', { name: '閉じる' })
        .click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await expect.poll(() => page.evaluate(() => history.length)).toBe(before);
    });

    /**
     * 入れ子のダイアログ（予告編）を開閉したあとでも閉じられること
     *
     * 予告編ダイアログは `useOverlayHistory` で**自分のエントリを積む**。
     * そのとき `{...window.history.state, …}` と前のエントリの state を
     * 引き継ぐので、こちらの目印も一緒にコピーされる。閉じると畳まれて
     * 元の位置に戻るため、そのあとの × が空振りしないことを見る。
     */
    test('予告編を開閉したあとでも閉じられる', async ({ page }) => {
      // 予告編ボタンは背景画像の上に出るので backdrop_path も要る
      await mockMovieDetail(page, {
        backdrop_path: '/e2e-backdrop.jpg',
        videos: {
          results: [
            {
              id: 'v1',
              iso_639_1: 'ja',
              iso_3166_1: 'JP',
              key: 'dQw4w9WgXcQ',
              name: 'E2E予告編',
              site: 'YouTube',
              size: 1080,
              type: 'Trailer',
              official: true,
              published_at: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      });

      await landFromOutside(page);
      const dialog = page.getByRole('dialog');

      await dialog
        .getByRole('button', { name: ARIA_LABELS.PLAY_TRAILER })
        .click();
      const videoDialog = page.getByRole('dialog', { name: /の予告動画$/ });
      await expect(videoDialog).toBeVisible({ timeout: 15000 });

      /*
        ⚠️ **Escape では閉じない。** 予告編ダイアログは YouTube の iframe を
        埋め込んでおり、プレイヤーがフォーカスを取ると keydown は別オリジンの
        iframe の document に入る。Radix の escape 検知は本体側の document で
        待っているので届かない。

        実測（ローカル）: フォーカスが閉じるボタンにある間は Escape で閉じるが、
        iframe にフォーカスを移すと閉じない。CI ではプレイヤーの読み込み時間
        次第でどちらにもなり、このテストが断続的に落ちていた
        （`14 × locator resolved to 1 element` / #1086 で混入）。

        ここで確かめたいのは「入れ子を開閉したあとに詳細を閉じられるか」なので、
        閉じ方は確実なボタンにする。Escape が効かないこと自体は製品側の
        課題として #1092 に切り出した。
      */

      // CI で落ちていた状態（プレイヤーにフォーカスがある）を**こちらから作る**。
      // 環境任せにすると、ローカルでは常に閉じるボタンにフォーカスが残って
      // 再現せず、CI でだけ落ちる
      await videoDialog
        .locator('iframe')
        .first()
        .evaluate((el) => (el as HTMLIFrameElement).focus());

      await videoDialog.getByRole('button', { name: '閉じる' }).click();
      await expect(videoDialog).toHaveCount(0);
      // 詳細はまだ開いている
      await expect(page).toHaveURL(/movie_id=/);

      await dialog.getByRole('button', { name: '閉じる' }).click();

      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).toHaveURL(/\/movies\/now-showing$/);
    });

    // 他のクエリまで落とすと、絞り込んだ一覧が初期状態に戻ってしまう
    test('他のクエリは残したまま movie_id だけ落とす', async ({ page }) => {
      await page.goto('about:blank');
      await page.goto(
        `/movies/now-showing?sort_by=popularity&movie_id=${MOVIE_ID}`,
      );
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20000 });

      await page
        .getByRole('dialog')
        .getByRole('button', { name: '閉じる' })
        .click();

      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).toHaveURL(/sort_by=popularity/);
      await expect(page).not.toHaveURL(/movie_id=/);
    });
  });
});
