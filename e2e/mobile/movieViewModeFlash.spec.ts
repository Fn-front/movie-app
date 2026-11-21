/**
 * リスト設定でリロードしたとき、グリッドの並びが一度も出ないこと（#1048）
 *
 * ⛔ **最終状態だけ見ても検出できない。** 最後はどちらもリストになるので、
 * 「途中でグリッドのコンテナが現れたか」を `MutationObserver` ＋
 * 毎フレーム採取で記録してから判定する。
 *
 * ## なぜ起きうるのか
 *
 * `useMovieViewMode` は `useSyncExternalStore` を使っており、
 * `getServerSnapshot`（`src/hooks/useMovieViewMode.ts`）は常に既定の
 * `'grid'` を返す。React がこれを使うのは **SSR と、ハイドレーション時の
 * 初回レンダー**。つまり**ハイドレーションされるツリー**では、保存値が
 * `'list'` でも1度グリッドで描かれる。
 *
 * ⛔ `getServerSnapshot` を保存値に変えてはいけない。サーバー出力と
 * 食い違って hydration mismatch になる（`useMovieViewMode.test.ts` に
 * 回帰テストがある）。
 *
 * ## 安全な理由はルートごとに違う（実測）
 *
 * ⚠️ **ひとまとめに「`useSearchParams` の CSR bailout」と書かない。**
 * この機序を持つのは `/movies/now-showing` だけで、他は loader の
 * `ssr: false` が理由。混ぜると、前提が消える条件を取り違える。
 *
 * | ルート | ハイドレーションされない理由 | `next dev` | `next start` |
 * |---|---|---|---|
 * | `/movies/now-showing` | `page.tsx` の `<Suspense>` ＋ 一覧の `useSearchParams`（CSR bailout） | **`G--` あり** | 無し |
 * | `/movies/upcoming` | `loader.tsx` の `dynamic(..., { ssr: false })` | 無し | 無し |
 * | `/search` | 同上 | 無し | 無し |
 *
 * （`G` = グリッドのコンテナ / `L` = リストのコンテナ / `T` = リストのタイル）
 *
 * `/movies/now-showing` だけ dev で `G--` が出るのは、dev の on-demand SSR では
 * Suspense の CSR 退避が起きずハイドレーション対象になるから。
 * `ssr: false` の2つは dev でもクライアントで新規マウントされるので出ない。
 *
 * ⚠️ **つまり #1048 の「影響範囲: `/movies/now-showing` と `/movies/upcoming` の
 * 2画面」も誤り。** 実際に起きうるのは `/movies/now-showing` だけ。
 * `/movies/upcoming` のケースは「別の理由で安全」の確認として残している。
 *
 * CPU 6倍スロットリングで3周しても本番ビルドでは `G` が1度も現れなかった。
 *
 * ## 前提が消える条件
 *
 * ⚠️ ルートごとに違う。
 *
 * - `/movies/now-showing`: PPR / Cache Components 有効化、`force-dynamic`、
 *   一覧から `useSearchParams` を外す、`page.tsx` の `<Suspense>` を動かす
 * - `/movies/upcoming` `/search`: **loader の `ssr: false` を外す**
 *
 * どれかで前提が消えると、このテストが落ちる。
 *
 * ⚠️ **dev では落ちる。** on-demand SSR でハイドレーションされるため、
 * 上の表のとおり1度グリッドになる。利用者が触るのは本番ビルドだけなので、
 * ここは CI（＝`npm start`）に限って見る。手元で確かめるなら `CI=true` を
 * 付けること（`.claude/rules/testing.md` の本番ビルド手順と同じ）。
 *
 * ⚠️ **CSS Modules のクラス名に依存している。** 表示モードは DOM 構造ごと
 * 変わる（グリッドとリストで別コンテナ）ため、生成の途中経過を見るには
 * これしか手が無い（`e2e/mobile/movieViewMode.spec.ts` も同じ依存）。
 * `c_movie_grid_container__grid` / `__list` を改名したら**ここも直すこと**。
 * 直し忘れると、落ちずに「検出しなくなる」形で壊れる。
 */

import { test, expect, type Page } from '@playwright/test';

import { STORAGE_KEYS } from '@/constants';

/** SP 表示（#1014 と同じ。リスト表示は SP の機能） */
test.use({ viewport: { width: 375, height: 812 } });

/**
 * 一覧が出るまでの待ち時間
 *
 * CPU 6倍スロットリングを掛けたうえで、`/movies/*` は react-query の
 * 取得を待つ。既定の 10 秒では足りない。
 *
 * ⚠️ テスト全体の上限（`playwright.config.ts` の `timeout: 30000`）より
 * 短くする。同値だと expect が使い切る前にテストが死に、
 * 「Test timeout of 30000ms exceeded」という情報量の無い失敗になる。
 */
const LIST_VISIBLE_TIMEOUT_MS = 20_000;

/** 記録を止めるフラグ名（観測そのものが負荷にならないよう、読む前に止める） */
const STOP_FLAG = '__viewModeStop';

/**
 * 「どのコンテナが居たか」を1文字ずつ記録する
 *
 * ⚠️ `MutationObserver` だけでは足りない。コールバックはバッチ後の
 * マイクロタスクで走るため、同じコミットで消えた相を取りこぼす。
 * 毎フレームも見る。
 *
 * ⚠️ `document.documentElement` は init script の時点ではまだ無い。
 * 先に rAF を回し、生えてから購読する。
 */
const installViewModeRecorder = ({
  storageKey,
  mode,
}: {
  storageKey: string;
  mode: string;
}) => {
  try {
    window.localStorage.setItem(storageKey, mode);
  } catch {
    // 読み書きできない環境ではグリッドのまま。その場合この spec は意味を失うが、
    // 下の「記録が動いたか」のアサーションで気づける
  }

  const w = window as unknown as {
    __viewModeSeq: string[];
    __viewModeStop?: boolean;
  };
  w.__viewModeSeq = [];

  const read = () => {
    const grid = document.querySelector(
      '[class*="c_movie_grid_container__grid"]',
    );
    const list = document.querySelector(
      '[class*="c_movie_grid_container__list"]',
    );
    const listTile = document.querySelector(
      '[class*="c_movie_tile--list"], [class*="c_movie_tile_skeleton--list"]',
    );

    return `${grid ? 'G' : '-'}${list ? 'L' : '-'}${listTile ? 'T' : '-'}`;
  };

  const push = () => {
    if (w.__viewModeStop) return;

    const state = read();
    const seq = w.__viewModeSeq;
    if (seq[seq.length - 1] !== state) seq.push(state);
  };

  let observing = false;
  const loop = () => {
    if (w.__viewModeStop) return;

    push();

    if (!observing && document.documentElement) {
      observing = true;
      new MutationObserver(push).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

/** 採取を止めてから読む（読んでいる最中に伸びると判定がぶれる） */
const readSequence = (page: Page) =>
  page.evaluate((stopFlag) => {
    const w = window as unknown as Record<string, unknown>;
    w[stopFlag] = true;

    return w.__viewModeSeq as string[];
  }, STOP_FLAG);

test.describe('リスト設定での初回描画（#1048）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /** ⚠️ `newCDPSession` は Chromium 専用。CI は chromium だけだが手元は3つ走る */
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'CPU スロットリング（CDP）が Chromium 専用のため',
  );

  /** 指定の表示モードで開き、観測された遷移を返す */
  const openAndRecord = async (
    page: Page,
    path: string,
    mode: 'grid' | 'list',
  ): Promise<string[]> => {
    // ⚠️ `addInitScript` は**引数を1つしか渡せない**。2つ書くと2つ目が
    //    黙って捨てられ、`localStorage` に `undefined` が入って既定
    //    （グリッド）に落ちる。オブジェクトで1つにまとめる
    await page.addInitScript(installViewModeRecorder, {
      storageKey: STORAGE_KEYS.MOVIE_VIEW_MODE,
      mode,
    });

    // 遷移の窓を広げる。速い環境では数ミリ秒で終わって見逃す
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });

    await page.goto(path);

    const container =
      mode === 'list'
        ? '[class*="c_movie_grid_container__list"]'
        : '[class*="c_movie_grid_container__grid"]';

    await expect(page.locator(container)).toBeVisible({
      timeout: LIST_VISIBLE_TIMEOUT_MS,
    });

    return readSequence(page);
  };

  for (const path of [
    '/movies/now-showing',
    '/movies/upcoming',
    // 退行の比較対象。こちらは `ssr: false` なので元から起きない
    '/search?query=バットマン',
  ]) {
    test(`${path} でグリッドのコンテナが一度も現れない`, async ({ page }) => {
      /**
       * ⚠️ **dev で落ちるのは `/movies/now-showing` だけ**（実測）。
       *
       * あそこだけ `<Suspense>` ＋ `useSearchParams` の CSR 退避が理由で、
       * dev の on-demand SSR では退避が起きずハイドレーション対象になる。
       * 他2つは loader の `ssr: false` なので dev でも出ない。
       *
       * describe 単位でスキップすると、dev で動く2本と下の生存確認まで
       * 消える（＝クラス名を改名しても CI まで気づけない）ので、
       * **このケースだけ**に絞る。
       *
       * ⚠️ `CI` は webServer が `npm start`（本番ビルド）になる条件そのもの
       * （`playwright.config.ts` の `command: isCI ? 'npm start' : 'npm run dev'`）。
       */
      test.skip(
        !process.env.CI && path === '/movies/now-showing',
        '本番ビルドでのみ成立（dev は on-demand SSR でハイドレーションされ、1度グリッドになる）',
      );

      const sequence = await openAndRecord(page, path, 'list');

      // 記録そのものが動いていないと、何も起きていないように見えて通る
      expect(sequence.length).toBeGreaterThan(0);
      expect(sequence.some((state) => state.startsWith('G'))).toBe(false);
      expect(sequence[sequence.length - 1]).toContain('L');
    });
  }

  /**
   * ⛔ **検出器が生きていることの証明（positive control）。**
   *
   * 上の3本は「`G` が記録されなかった」ことしか見ていないので、
   * **グリッドのクラス名を改名して検出できなくなった**場合も緑のまま通る
   * （偽陰性）。グリッド設定で開けば `G` は必ず記録されるはずなので、
   * ここが落ちたら「退行が無い」のではなく「見えていない」と分かる。
   */
  test('グリッド設定なら G が記録される（検出器の生存確認）', async ({
    page,
  }) => {
    const sequence = await openAndRecord(page, '/movies/now-showing', 'grid');

    expect(sequence.some((state) => state.startsWith('G'))).toBe(true);
  });
});
