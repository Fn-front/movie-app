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
 * ## 本番ビルドでは起きない（実測）
 *
 * `/movies/*` は静的プリレンダで、一覧は `useSearchParams` を使うため
 * `<Suspense>` 配下が CSR へ退避する。**ハイドレーション対象にならない**
 * ので `getSnapshot`（保存値）が直接使われ、最初からリストで描かれる。
 *
 * | | `/movies/now-showing` | `/search` |
 * |---|---|---|
 * | `next dev` | `G--` → `---` → `-LT` | `---` → `-LT` |
 * | `next start`（本番ビルド） | `---` → `-LT` | `---` → `-LT` |
 *
 * （`G` = グリッドのコンテナ / `L` = リストのコンテナ / `T` = リストのタイル）
 *
 * CPU 6倍スロットリングで3周しても本番ビルドでは `G` が1度も現れなかった。
 * #1048 の観測が dev サーバーだったため「5画面で起きる」と読めていた。
 *
 * ⚠️ **dev では落ちる。** on-demand SSR でハイドレーションされるため、
 * 上の表のとおり1度グリッドになる。利用者が触るのは本番ビルドだけなので、
 * ここは CI（＝`npm start`）に限って見る。
 */

import { test, expect, type Page } from '@playwright/test';

import { STORAGE_KEYS } from '@/constants';

/** SP 表示（#1014 と同じ。リスト表示は SP の機能） */
test.use({ viewport: { width: 375, height: 812 } });

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
const INSTALL = (storageKey: string) => {
  try {
    window.localStorage.setItem(storageKey, 'list');
  } catch {
    // 読み書きできない環境ではグリッドのまま。その場合この spec は意味を失う
  }

  const w = window as unknown as { __viewModeSeq: string[] };
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
    const state = read();
    const seq = w.__viewModeSeq;
    if (seq[seq.length - 1] !== state) seq.push(state);
  };

  let observing = false;
  const loop = () => {
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

const readSequence = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __viewModeSeq: string[] }).__viewModeSeq,
  );

test.describe('リスト設定での初回描画（#1048）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /**
   * ⚠️ `CI` は webServer が `npm start`（本番ビルド）になる条件そのもの
   * （`playwright.config.ts` の `command: isCI ? 'npm start' : 'npm run dev'`）。
   * 手元でも `CI=true` を付ければ走る。
   */
  test.skip(
    !process.env.CI,
    '本番ビルドでのみ成立（dev は on-demand SSR でハイドレーションされ、1度グリッドになる）',
  );

  for (const path of [
    '/movies/now-showing',
    '/movies/upcoming',
    // 退行の比較対象。こちらは `ssr: false` なので元から起きない
    '/search?query=mission',
  ]) {
    test(`${path} でグリッドのコンテナが一度も現れない`, async ({ page }) => {
      await page.addInitScript(INSTALL, STORAGE_KEYS.MOVIE_VIEW_MODE);

      // 遷移の窓を広げる。速い環境では数ミリ秒で終わって見逃す
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });

      await page.goto(path);

      // リストのタイルが出るまで＝切り替えが終わるまで待つ
      await expect(
        page.locator('[class*="c_movie_grid_container__list"]'),
      ).toBeVisible({ timeout: 30000 });

      const sequence = await readSequence(page);

      // 記録そのものが動いていないと、何も起きていないように見えて通る
      expect(sequence.length).toBeGreaterThan(0);
      expect(sequence.some((state) => state.startsWith('G'))).toBe(false);
      expect(sequence[sequence.length - 1]).toContain('L');
    });
  }
});
