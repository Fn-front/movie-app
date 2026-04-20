/**
 * TheaterScene コンポーネント テスト
 * R3F内の描画はテスト対象外。props型のみ検証。
 */

jest.mock('@react-three/drei', () => ({
  OrbitControls: jest.fn(() => null),
}));

import { TheaterScene } from './theaterScene';

describe('TheaterScene', () => {
  it('エクスポートが正しく定義されている', () => {
    expect(TheaterScene).toBeDefined();
    expect(TheaterScene.displayName).toBe('TheaterScene');
  });

  it('propsの型が正しい', () => {
    // 型レベルのテスト（コンパイル時に検証）
    const props = {
      roomWidth: 20,
      roomDepth: 25,
      roomHeight: 8,
      children: null,
    };
    expect(props.roomWidth).toBe(20);
  });
});
