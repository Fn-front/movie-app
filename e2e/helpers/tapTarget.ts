/**
 * タップ領域の実測ヘルパー（#1017）
 *
 * `tap-target` mixin は `::after` でヒット領域を広げるため、
 * **`boundingBox()` では測れない**（見た目の 28px しか返らない）。
 * 実際にそこを押したら何に当たるかで見る。
 *
 * `e2e/mobile/tapTarget.spec.ts` と `e2e/mobile/watchlistFavoritesViewMode.spec.ts`
 * の2つで使うため、`locators.ts` の方針に合わせてここへ集約している。
 */

import { expect, type Locator } from '@playwright/test';

/** 指で押せるタップ領域の最小サイズ（`$tap-target-min` と対） */
export const TAP_TARGET_MIN = 44;

/**
 * 要素を中心とする `size`×`size` の正方形の四隅が、その要素に当たるかを返す
 *
 * 擬似要素は親要素の一部として `elementFromPoint` に返るため、
 * 広げた分がそのまま判定に出る。
 *
 * 端ちょうどは隣の要素と取り合いになるので 2px 内側を測る。
 *
 * @param locator - 対象の要素
 * @param size - 検査する正方形の一辺
 */
export async function hitAreaCorners(
  locator: Locator,
  size = TAP_TARGET_MIN,
): Promise<boolean[]> {
  return locator.evaluate((el, targetSize) => {
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    // 端ちょうどは隣と取り合いになるうえ、カードの角丸（border-radius +
    // overflow: hidden）で**クリップされる境界とほぼ一致**する。
    // 実測で 21.0px は card、20.5px は button に当たった。2px 内側を見る
    const offset = targetSize / 2 - 2;

    return [
      [centerX - offset, centerY - offset],
      [centerX + offset, centerY - offset],
      [centerX - offset, centerY + offset],
      [centerX + offset, centerY + offset],
    ].map(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit === el || el.contains(hit);
    });
  }, size);
}

/**
 * 四隅すべてがその要素に当たることを検証する
 *
 * @param locator - 対象の要素
 * @param label - 失敗メッセージに出す要素名
 */
export async function expectTapAreaAtLeast(
  locator: Locator,
  label: string,
): Promise<void> {
  const corners = await hitAreaCorners(locator);
  expect(
    corners,
    `${label} の ${TAP_TARGET_MIN}px 四方のうち、押しても当たらない角がある`,
  ).toEqual([true, true, true, true]);
}
