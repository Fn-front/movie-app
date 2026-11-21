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
import { test, expect } from '../fixtures/auth';

import { ARIA_LABELS } from '@/constants';

import { movieTileDetailLinks, movieTiles } from '../helpers/locators';
import { clearSavedFiltersForTestUser } from '../helpers/api';
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

/**
 * h1 が2件になる件の決着（#1333 → #1343 で調査）
 *
 * #1333 では「遷移中は Radix のタブパネルが新旧2つ並ぶ」と書いたが、
 * **これは誤り**だった。`Tabs`（`src/components/ui/tabs/tabs.tsx:112`）は
 * 選択中の1パネルしか描画しないので、タブ切替では増えない。
 *
 * ## 実際に何が2つあったか
 *
 * 報告された2要素の id は `radix-_r_0_-…` と `radix-_R_39bn5rhqbmlqlb_-…`。
 * React の `useId` は**サーバー生成が `_R_`、ハイドレーション後に
 * クライアントで生成したものが `_r_`** なので、
 * 「SSR されてハイドレートされたツリー」と「後からクライアントでマウント
 * されたツリー」が同居していた。タブではなくページツリーの二重化。
 *
 * ## それは dev でしか起きない
 *
 * 実測（本PRの調査）:
 *
 * | | SSR HTML の h1 | SSR HTML の radix id |
 * |---|---|---|
 * | `next dev` | 1件 | `radix-_R_39bn5rhqbmlqlb_-content-theatrical` |
 * | `next start`（本番ビルド） | **0件** | **無し** |
 *
 * 本番ビルドでは `/movies/now-showing` が静的プリレンダで、`page.tsx` の
 * `<Suspense>` が fallback に落ちる（一覧は `useSearchParams` を使うため）。
 * つまり**SSR 由来のツリーがそもそも存在せず**、id は `_r_` 系だけになる。
 * 報告された組み合わせは本番ビルドでは成立しない。
 *
 * 報告された class 名も dev 固有の形
 * （`movieListContent-module-scss-module__MbMQ1W__…`。本番は
 * `MbMQ1W_c_movie_list__title`）で、観測が `next dev` だったことと一致する。
 * #1339 のコミットメッセージにも「`next dev` で検証していたときは別の失敗が
 * 多発した」とある。
 *
 * ## 判断: 許容する
 *
 * CI は `npm start`（本番ビルド）なので構造的に起きない。本番ビルドで
 * 本 spec 全体を3周（CPU 6倍スロットリング + 毎フレーム採取 +
 * MutationObserver）流して、h1 が2件になる瞬間は**1度も観測できなかった**。
 * 利用者影響も確認できていない。
 *
 * ⚠️ ただし canary（`toHaveCount(1)`）は**外さない**。dev 側の二重化が
 * 本番へ波及したときに気づく口がここしか無い。
 */

test.describe('映画詳細のURL化', () => {
  /**
   * 保存済みフィルターを持ち越さない（#1062）。
   *
   * ⚠️ この spec は URL を `/\/movies\/now-showing$/` と**末尾まで**見る。
   * 共有の `TEST_USER` に別 spec の `saved_filters` が残っていると、復元結果が
   * URL へ書き戻されてクエリが付き、ここが落ちる。漏らす側の片付けだけに
   * 頼らず、**見る側でも**開始時に消す
   */
  test.beforeEach(async () => {
    await clearSavedFiltersForTestUser();
  });
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
    // ⚠️ `.first()` を外さないこと（#1333 / #1343）。dev では SSR 由来の
    // ツリーとクライアントでマウントされたツリーが一瞬同居し、同じ文言の
    // h1 が2件になって strict mode violation で落ちる。原因と「許容する」
    // 判断はファイル先頭のコメントを参照。
    //
    // ⛔ `getByRole('heading', ...)` に置き換えない。モーダルを開いている間は
    //   背後が `aria-hidden` になるため role では拾えず、element not found で
    //   必ず落ちる（置き換えて実測した）。CSS ロケータのまま先頭を見る
    // 一瞬の重複は許容しつつ、**恒常的な重複は落とす**。
    // toHaveCount はリトライされるため、strict mode violation
    // （リトライされず数ミリ秒の重複でも落ちる）より正確な canary になる
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1').first()).toHaveText('公開中の映画');

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
    // ⚠️ `.first()` を外さないこと（#1333 / #1343）。dev では SSR 由来の
    // ツリーとクライアントでマウントされたツリーが一瞬同居し、同じ文言の
    // h1 が2件になって strict mode violation で落ちる。原因と「許容する」
    // 判断はファイル先頭のコメントを参照。
    //
    // ⛔ `getByRole('heading', ...)` に置き換えない。モーダルを開いている間は
    //   背後が `aria-hidden` になるため role では拾えず、element not found で
    //   必ず落ちる（置き換えて実測した）。CSS ロケータのまま先頭を見る
    // 一瞬の重複は許容しつつ、**恒常的な重複は落とす**。
    // toHaveCount はリトライされるため、strict mode violation
    // （リトライされず数ミリ秒の重複でも落ちる）より正確な canary になる
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1').first()).toHaveText('公開中の映画');
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
   * スマホ幅ではモーダルのスクロールが1本（#1109）
   *
   * 以前は「あらすじ以降」だけが `max-height: 300px` で別にスクロールし、
   * ポスター・配信アイコン側は伸びるに任せていた。モーダルは `overflow: hidden`
   * の高さ上限つきなので、配信が3行揃う作品では**上が伸びた分だけ下が
   * クリップ**され、スクロール領域が細い隙間になっていた。
   *
   * ⚠️ **md 以上は従来のまま**なので、デスクトップ幅で測ると落ちない（#1200）。
   * ビューポートは必ずスマホ幅にすること。
   *
   * ⚠️ **`clientHeight` を見ても検出できない。** クリップしているのは祖先の
   * `overflow: hidden` なので、潰れた側の `clientHeight` は `max-height` の
   * 300px を返し続ける。実際に見えている高さ（祖先との重なり）で判定する。
   *
   * ⚠️ 単体テストでは検出できない（jsdom は CSS もメディアクエリも解釈しない）。
   */
  test('スマホ幅では配信が3行でもスクロール領域が潰れない', async ({
    page,
  }) => {
    // ⚠️ **高さを上げると検出力が落ちる。** 症状の重さは幅ではなく**高さ**で
    //    決まり、画面が高いほど修正前の可視高さも広がる（高さにほぼ比例し、
    //    900 まで上げると 300px 近くになる）。下の閾値はそこまで見込んで
    //    置いてあるが、さらに高くすると「修正前でも通る」側へ寄っていく。
    //    幅は md（768px）未満であればよい
    await page.setViewportSize({ width: 390, height: 740 });

    // 配信・レンタル・購入が全部揃う作品（Issue の再現条件）
    const providers = (ids: number[]) =>
      ids.map((id) => ({
        provider_id: id,
        provider_name: `E2E配信${id}`,
        logo_path: '/e2e-provider-logo.jpg',
        display_priority: id,
      }));

    await mockMovieDetail(page, {
      // 既定のモックは中身が足りず、このテストが成り立たない。実在作品（アメリ）に
      // 寄せて埋める。どれが何を支えているかは実測で切り分けてある（修正前のコードで
      // 1つずつ外して可視高さを測った）。
      //
      // - `backdrop_path` を外す → 299px。上を押し下げる要素が消え**通ってしまう**
      // - `watch/providers` を外す → 260px。配信3行ぶん縮み**通ってしまう**
      // - `overview` / `credits` を外す → そもそもスクロールが起きず `count` が 0 になる
      //   （このときは可視高さではなく `toBe(1)` の側で落ちる）
      // - `poster_path` は外しても 145px のまま。**可視高さには効いていない**が、
      //   実作品に近い見た目で測るために残している
      backdrop_path: '/e2e-backdrop.jpg',
      poster_path: '/e2e-poster.jpg',
      overview: 'あ'.repeat(400),
      credits: {
        // 描画されるのは `DISPLAY_LIMITS.CAST_MAX`（10件）まで。
        // 上限に当たっていることを込みで測りたいので多めに渡す
        cast: Array.from({ length: 12 }, (_, i) => ({
          id: 1000 + i,
          name: `E2E俳優${i}`,
          character: `E2E役${i}`,
          profile_path: null,
          order: i,
        })),
      },
      'watch/providers': {
        results: {
          JP: {
            link: 'https://example.com',
            flatrate: providers([1, 2, 3]),
            rent: providers([4, 5, 6]),
            buy: providers([7, 8]),
          },
        },
      },
    });

    await page.goto(`/movies/now-showing?movie_id=${MOVIE_ID}`);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(dialog.getByText('詳細情報')).toBeVisible({ timeout: 15000 });

    const scroll = await page.evaluate(() => {
      const root = document.querySelector('[role="dialog"]');
      if (!root) return null;

      const scrollers = [...root.querySelectorAll('*')].filter((el) => {
        const overflowY = getComputedStyle(el).overflowY;
        const scrolls = overflowY === 'auto' || overflowY === 'scroll';
        return scrolls && el.scrollHeight > el.clientHeight + 1;
      });

      const dialogBox = root.getBoundingClientRect();
      const visibleHeights = scrollers.map((el) => {
        const box = el.getBoundingClientRect();
        return Math.round(
          Math.max(
            0,
            Math.min(box.bottom, dialogBox.bottom) -
              Math.max(box.top, dialogBox.top),
          ),
        );
      });

      return { count: scrollers.length, visibleHeights };
    });

    // null と「スクロール要素ゼロ」を取り違えないよう先に切り分ける
    expect(scroll).not.toBeNull();

    // スクロールするのは本文の1箇所だけ。2つあるとホイールが内側に吸われ、
    // 外側へ抜けられなくなる（入れ子スクロール）
    expect(scroll?.count).toBe(1);

    // クリップされていないことを見る。本番ビルドでの実測（390x740）は
    // 修正前 145px → 修正後 465px。
    //
    // 閾値 350 は両側に余裕を取ってある。修正後はいちばん低い想定
    // （高さ667）でも 402px で通り、修正前は高さ900 まで上げても 300px 前後で
    // 捕まる。⚠️ dev サーバーだと数十px 大きく出るので、測り直すときは
    // 本番ビルド（`npm run build && npm start`）で揃えること
    expect(scroll?.visibleHeights[0]).toBeGreaterThan(350);
  });

  /**
   * 全画面ページ（`/movies/[id]`）は内部スクロールを持たない（#1023 / #1109）
   *
   * モーダルの高さ上限のための仕組みなので、ページでは本文のスクロールと
   * 二重になるだけ。スクロールする要素が幅で入れ替わる（md 未満は `__body`、
   * md 以上は `__scrollable`）ため、`--page` では**両方**外している。
   * 片方を外し忘れても見た目には出にくく、スクロールが二重になって初めて気づく
   */
  test('全画面ページは詳細の中に内部スクロールを作らない', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });

    await page.goto(`/movies/${MOVIE_ID}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 20000,
    });

    const innerScrollers = await page.evaluate(() =>
      [...document.querySelectorAll('[class*="c_movie_detail"]')]
        .filter((el) => {
          const overflowY = getComputedStyle(el).overflowY;
          const scrolls = overflowY === 'auto' || overflowY === 'scroll';
          return scrolls && el.scrollHeight > el.clientHeight + 1;
        })
        .map((el) => el.className.toString()),
    );

    expect(innerScrollers).toEqual([]);
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

    /**
     * Esc が効く状態になるまで待ってから押す（#1122）
     *
     * Radix の Esc は `document` へのネイティブ `keydown` リスナを
     * `useEffect` の中で登録する（`react-use-escape-keydown` →
     * `react-dismissable-layer`）。`toBeVisible()` は DOM の可視性しか
     * 保証せず、**effect が走ったことは保証しない**。
     *
     * Playwright 側も非対称で、`click()` はアクショナビリティ待ちを
     * タイムアウトまで再試行するが **`keyboard.press()` は待たない**。
     * そのため Esc だけが隙間に落ちる。
     *
     * ⚠️ フォーカス位置は関係ない（document 上の capture リスナ）。
     * 待つべきは「レイヤーが dismissable として登録済みか」なので、
     * 閉じるまで Esc を再試行する
     */
    const pressEscapeUntilClosed = async (page: Page) => {
      await expect(async () => {
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0, {
          timeout: 1000,
        });
      }).toPass({ timeout: 15000 });
    };

    test('閉じてもアプリの外へ出ず、一覧が残る', async ({ page }) => {
      await landFromOutside(page);

      await page
        .getByRole('dialog')
        .getByRole('button', { name: '閉じる' })
        .click();

      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).toHaveURL(/\/movies\/now-showing$/);
      // ⚠️ `.first()` を外さないこと（#1333）。遷移中は Radix のタブパネルが
      // 新旧2つ並ぶ瞬間があり、同じ文言の h1 が2件になって strict mode
      // violation で落ちる（実測で3回に1回ほど）。
      //
      // ⛔ `getByRole('heading', ...)` に置き換えない。モーダルを開いている間は
      //   背後が `aria-hidden` になるため role では拾えず、element not found で
      //   必ず落ちる（置き換えて実測した）。CSS ロケータのまま先頭を見る
      // 一瞬の重複は許容しつつ、**恒常的な重複は落とす**。
      // toHaveCount はリトライされるため、strict mode violation
      // （リトライされず数ミリ秒の重複でも落ちる）より正確な canary になる
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1').first()).toHaveText('公開中の映画');
    });

    test('Esc でも閉じる', async ({ page }) => {
      await landFromOutside(page);

      await pressEscapeUntilClosed(page);

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
