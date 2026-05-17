/**
 * FirstPersonPreview コンポーネント テスト
 * R3F内の描画はテスト対象外。エクスポートのみ検証。
 */

jest.mock('@react-three/drei', () => ({
  PerspectiveCamera: jest.fn(() => null),
}));

import { FirstPersonPreview } from './firstPersonPreview';

describe('FirstPersonPreview', () => {
  it('エクスポートが正しく定義されている', () => {
    expect(FirstPersonPreview).toBeDefined();
    expect(FirstPersonPreview.displayName).toBe('FirstPersonPreview');
  });
});
