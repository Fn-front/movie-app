/**
 * バナー高さの CSS 変数反映のテスト
 *
 * jest.setup.js の ResizeObserver は完全な no-op スタブで、コールバックが
 * 発火しない。そのためコンポーネント側のテストでは高さ反映を検証できず、
 * 純関数として切り出してここで固定する。
 */

import {
  BANNER_HEIGHT_VAR,
  resolveBannerHeight,
  setBannerHeightVar,
} from './bannerHeight';

describe('setBannerHeightVar', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty(BANNER_HEIGHT_VAR);
  });

  it('px 付きで書き込む', () => {
    // 単位を落とすと calc(100vh - 0) が無効になり height: auto へ落ちる
    setBannerHeightVar(72);

    expect(
      document.documentElement.style.getPropertyValue(BANNER_HEIGHT_VAR),
    ).toBe('72px');
  });

  it('小数は切り上げる', () => {
    setBannerHeightVar(71.2);

    expect(
      document.documentElement.style.getPropertyValue(BANNER_HEIGHT_VAR),
    ).toBe('72px');
  });

  it('null で変数を外す', () => {
    setBannerHeightVar(72);
    setBannerHeightVar(null);

    expect(
      document.documentElement.style.getPropertyValue(BANNER_HEIGHT_VAR),
    ).toBe('');
  });

  it('同値なら書き込まない（ResizeObserver のループを避ける）', () => {
    setBannerHeightVar(72);
    const setProperty = jest.spyOn(
      document.documentElement.style,
      'setProperty',
    );

    setBannerHeightVar(72);

    expect(setProperty).not.toHaveBeenCalled();
    setProperty.mockRestore();
  });

  it('値が変わったら書き込む', () => {
    setBannerHeightVar(72);
    setBannerHeightVar(96);

    expect(
      document.documentElement.style.getPropertyValue(BANNER_HEIGHT_VAR),
    ).toBe('96px');
  });
});

describe('resolveBannerHeight', () => {
  /**
   * ResizeObserver の entry を模す
   *
   * 実ブラウザでは borderBoxSize / contentRect の両方が常に設定される。
   * ここでは「どちらを読んでいるか」を区別するため意図的に値をずらす
   */
  const createEntry = (
    borderBoxBlockSize: number | undefined,
    contentHeight: number,
    boundingHeight = contentHeight,
  ) =>
    ({
      borderBoxSize:
        borderBoxBlockSize === undefined
          ? undefined
          : [{ blockSize: borderBoxBlockSize, inlineSize: 0 }],
      contentRect: { height: contentHeight } as DOMRectReadOnly,
      target: {
        getBoundingClientRect: () => ({ height: boundingHeight }) as DOMRect,
      } as Element,
    }) as unknown as ResizeObserverEntry;

  it('境界ボックスの高さを返す（境界線ぶんを含む）', () => {
    // border-top: 1px があるぶん、内容ボックスより1px大きい。
    // contentRect を読んでいるとフッター最下1pxに境界線が重なる（#966）
    const entry = createEntry(83, 82);

    expect(resolveBannerHeight(entry)).toBe(83);
  });

  it('内容ボックスの高さは使わない', () => {
    const entry = createEntry(100, 50);

    expect(resolveBannerHeight(entry)).not.toBe(50);
  });

  it('borderBoxSize が無い環境では境界ボックスの実測へフォールバックする', () => {
    // Safari 15.4 未満向けの保険
    const entry = createEntry(undefined, 82, 83);

    expect(resolveBannerHeight(entry)).toBe(83);
  });

  it('小数の高さをそのまま返す（切り上げは setBannerHeightVar 側）', () => {
    const entry = createEntry(82.5, 81.5);

    expect(resolveBannerHeight(entry)).toBe(82.5);
    setBannerHeightVar(resolveBannerHeight(entry));
    expect(
      document.documentElement.style.getPropertyValue(BANNER_HEIGHT_VAR),
    ).toBe('83px');
  });
});
