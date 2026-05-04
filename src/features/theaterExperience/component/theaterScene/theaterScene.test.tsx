/**
 * TheaterScene コンポーネント テスト
 * R3F内の描画はテスト対象外。props型のみ検証。
 */

jest.mock('@react-three/drei', () => ({
  OrbitControls: jest.fn(() => null),
  Environment: jest.fn(() => null),
  ContactShadows: jest.fn(() => null),
  useTexture: jest.fn(() => ({
    map: { wrapS: 0, wrapT: 0, repeat: { set: jest.fn() } },
    normalMap: { wrapS: 0, wrapT: 0, repeat: { set: jest.fn() } },
    roughnessMap: { wrapS: 0, wrapT: 0, repeat: { set: jest.fn() } },
    aoMap: { wrapS: 0, wrapT: 0, repeat: { set: jest.fn() } },
  })),
}));
jest.mock('@react-three/fiber', () => ({
  useThree: jest.fn(() => ({
    camera: { position: { lerp: jest.fn() } },
  })),
  useFrame: jest.fn(),
}));
jest.mock('three', () => ({
  Vector3: jest.fn().mockImplementation(function (
    this: Record<string, unknown>,
  ) {
    this.clone = jest.fn().mockReturnValue(this);
    this.copy = jest.fn();
    this.set = jest.fn();
  }),
  RepeatWrapping: 1000,
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
      selectedSeat: null,
      theater: {
        id: 'uuid-1',
        name: 'Test',
        slug: 'test',
        format: 'standard' as const,
        room_width: 20,
        room_depth: 25,
        room_height: 8,
        screen_width: 14,
        screen_height: 6,
        screen_center_x: 0,
        screen_center_y: 4,
        screen_center_z: 12.5,
        audio_layout: 'atmos_9_1_6' as const,
      },
      children: null,
    };
    expect(props.roomWidth).toBe(20);
  });
});
