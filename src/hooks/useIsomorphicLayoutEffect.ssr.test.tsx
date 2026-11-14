/**
 * @jest-environment node
 */

/**
 * useIsomorphicLayoutEffect のテスト（サーバー側）
 *
 * このフックが存在するのは、`useLayoutEffect` がサーバーでは動かないため。
 * サーバーでは `useEffect` へ解決されることを固定する。
 *
 * ⚠️ 「`renderToString` で警告が出ないこと」では判定できない。React 19 は
 * `useLayoutEffect` をサーバーで呼んでも警告を出さなくなっており、実装を
 * `useLayoutEffect` 固定に差し替えてもテストが通ってしまう（実測で確認）。
 */

import { useEffect } from 'react';

import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

describe('useIsomorphicLayoutEffect（SSR）', () => {
  it('window が無ければ useEffect に解決する', () => {
    expect(typeof window).toBe('undefined');
    expect(useIsomorphicLayoutEffect).toBe(useEffect);
  });
});
