/**
 * バナー高さの CSS 変数反映のテスト
 *
 * jest.setup.js の ResizeObserver は完全な no-op スタブで、コールバックが
 * 発火しない。そのためコンポーネント側のテストでは高さ反映を検証できず、
 * 純関数として切り出してここで固定する。
 */

import { BANNER_HEIGHT_VAR, setBannerHeightVar } from './bannerHeight';

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
