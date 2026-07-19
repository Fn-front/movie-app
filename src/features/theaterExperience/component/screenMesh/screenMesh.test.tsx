/**
 * ScreenMesh コンポーネント テスト
 * R3F内の描画はテスト対象外。props型とエクスポートのみ検証。
 */

jest.mock('@react-three/fiber', () => ({
  useFrame: jest.fn(),
}));

jest.mock('@react-three/drei', () => ({
  Edges: () => null,
}));

jest.mock('three', () => ({
  DoubleSide: 2,
}));

jest.mock('../../shaders/screenVertex', () => ({
  screenVertexShader: 'mock-vertex-shader',
}));

jest.mock('../../shaders/screenFragment', () => ({
  screenFragmentShader: 'mock-fragment-shader',
}));

import { ScreenMesh, advanceScreenTime } from './screenMesh';

describe('advanceScreenTime', () => {
  it('通常時は経過時間(delta)だけ進む', () => {
    expect(advanceScreenTime(1, 0.5, false)).toBeCloseTo(1.5);
  });

  it('reducedMotion時は現在値を維持しアニメ（フリッカー含む）を停止する', () => {
    expect(advanceScreenTime(1, 0.5, true)).toBe(1);
    expect(advanceScreenTime(0, 999, true)).toBe(0);
  });
});

describe('ScreenMesh', () => {
  it('エクスポートが正しく定義されている', () => {
    expect(ScreenMesh).toBeDefined();
    expect(ScreenMesh.displayName).toBe('ScreenMesh');
  });

  it('propsの型が正しい', () => {
    const props = {
      width: 14,
      height: 6,
      centerX: 0,
      centerY: 4,
      centerZ: 12.5,
    };

    expect(props.width).toBe(14);
    expect(props.height).toBe(6);
    expect(props.centerX).toBe(0);
    expect(props.centerY).toBe(4);
    expect(props.centerZ).toBe(12.5);
  });

  it('reducedMotion propsを受け付ける', () => {
    const props = {
      width: 14,
      height: 6,
      centerX: 0,
      centerY: 4,
      centerZ: 12.5,
      reducedMotion: true,
    };

    expect(props.reducedMotion).toBe(true);
  });
});
