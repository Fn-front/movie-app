/**
 * 前ページ挿入時のスクロール補正 テスト
 *
 * jsdom はレイアウトを持たないため、`getBoundingClientRect` と
 * `scrollHeight` / `clientHeight` を手で与えて「項目が下へ押された」状況を作る。
 */

import { renderHook, act } from '@testing-library/react';

import { usePrependScrollAnchor } from './usePrependScrollAnchor';

// --- Helpers ---

/** 画面上の位置を固定した要素を作る */
function createItem(top: number): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ top, bottom: top + 100 }) as unknown as DOMRect;
  return el;
}

/**
 * スクロール可能な祖先 + グリッド + 項目 を組み立てる
 *
 * `overflowY: auto` と `scrollHeight > clientHeight` の両方を満たさないと
 * `findScrollableAncestor` が拾わない
 */
function createTree(itemTops: number[]) {
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';
  Object.defineProperty(scroller, 'scrollHeight', { value: 1000 });
  Object.defineProperty(scroller, 'clientHeight', { value: 300 });
  scroller.scrollTop = 500;
  scroller.getBoundingClientRect = () =>
    ({ top: 0, bottom: 300 }) as unknown as DOMRect;

  const grid = document.createElement('div');
  itemTops.forEach((top) => grid.appendChild(createItem(top)));

  scroller.appendChild(grid);
  document.body.appendChild(scroller);

  return { scroller, grid };
}

afterEach(() => {
  document.body.innerHTML = '';
});

// --- Tests ---

describe('usePrependScrollAnchor', () => {
  it('基準要素が下へ押されたぶん scrollTop を足す', () => {
    // 先頭は画面外（bottom <= 0）なので、基準に選ばれるのは2つ目
    const { scroller, grid } = createTree([-200, 50]);
    const anchor = grid.children[1] as HTMLElement;

    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => usePrependScrollAnchor<HTMLDivElement>(key),
      { initialProps: { key: 'a' } },
    );
    (result.current.listRef as { current: HTMLElement | null }).current = grid;

    act(() => {
      result.current.captureBeforePrepend();
    });

    // 前ページが挿入され、基準要素が 300px 下へ押された
    anchor.getBoundingClientRect = () =>
      ({ top: 350, bottom: 450 }) as unknown as DOMRect;

    rerender({ key: 'b' });

    expect(scroller.scrollTop).toBe(800); // 500 + 300
  });

  it('capture していなければ何もしない', () => {
    const { scroller, grid } = createTree([50]);

    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => usePrependScrollAnchor<HTMLDivElement>(key),
      { initialProps: { key: 'a' } },
    );
    (result.current.listRef as { current: HTMLElement | null }).current = grid;

    rerender({ key: 'b' });

    expect(scroller.scrollTop).toBe(500);
  });

  it('基準要素が捨てられていたら補正しない', () => {
    // 誤った位置へ飛ばすより、何もしないほうが無害
    const { scroller, grid } = createTree([50]);
    const anchor = grid.children[0] as HTMLElement;

    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => usePrependScrollAnchor<HTMLDivElement>(key),
      { initialProps: { key: 'a' } },
    );
    (result.current.listRef as { current: HTMLElement | null }).current = grid;

    act(() => {
      result.current.captureBeforePrepend();
    });

    grid.removeChild(anchor);
    rerender({ key: 'b' });

    expect(scroller.scrollTop).toBe(500);
  });

  it('同じ描画で2度は補正しない（スナップショットを使い切る）', () => {
    const { scroller, grid } = createTree([-200, 50]);
    const anchor = grid.children[1] as HTMLElement;

    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => usePrependScrollAnchor<HTMLDivElement>(key),
      { initialProps: { key: 'a' } },
    );
    (result.current.listRef as { current: HTMLElement | null }).current = grid;

    act(() => {
      result.current.captureBeforePrepend();
    });
    anchor.getBoundingClientRect = () =>
      ({ top: 350, bottom: 450 }) as unknown as DOMRect;

    rerender({ key: 'b' });
    expect(scroller.scrollTop).toBe(800);

    // さらに下へ押されても、capture していないので触らない
    anchor.getBoundingClientRect = () =>
      ({ top: 900, bottom: 1000 }) as unknown as DOMRect;
    rerender({ key: 'c' });

    expect(scroller.scrollTop).toBe(800);
  });

  it('スクロール可能な祖先が無ければ何もしない', () => {
    const grid = document.createElement('div');
    grid.appendChild(createItem(50));
    document.body.appendChild(grid);

    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => usePrependScrollAnchor<HTMLDivElement>(key),
      { initialProps: { key: 'a' } },
    );
    (result.current.listRef as { current: HTMLElement | null }).current = grid;

    act(() => {
      result.current.captureBeforePrepend();
    });

    expect(() => rerender({ key: 'b' })).not.toThrow();
  });
});
