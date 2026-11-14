/**
 * useIsomorphicLayoutEffect のテスト（クライアント側）
 *
 * このモジュールの契約は「**どちらの React フックに解決されるか**」だけで、
 * それ以外の振る舞いを持たない。よってここでは同一性を固定する。
 *
 * ⚠️ 挙動で判定しようとすると**どれも偽陽性になる**。実際に試して確認した。
 *
 * - RTL の `render()`：`act()` が終了時に passive 効果まで同期的に流すため、
 *   `useEffect` に差し替えても「宣言順どおり」になって通る
 * - `flushSync` ＋ `createRoot`：同じく passive まで流れるので区別できない
 * - `renderToString` の警告：React 19 は `useLayoutEffect` でも警告を出さない
 *
 * jsdom にはペイントが無く、「ペイント前かどうか」を観測する手段が無い。
 * 実際のタイミングは利用側（`useBottomNavHeight` / `useConsentServerSync`）の
 * テストと E2E が担保する。
 */

import { useLayoutEffect } from 'react';

import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

describe('useIsomorphicLayoutEffect', () => {
  it('window があれば useLayoutEffect に解決する', () => {
    // ペイント前に決めたいものがあるときに使うフックなので、
    // ここが useEffect に倒れると 1フレームの窓が開く
    expect(typeof window).not.toBe('undefined');
    expect(useIsomorphicLayoutEffect).toBe(useLayoutEffect);
  });
});
