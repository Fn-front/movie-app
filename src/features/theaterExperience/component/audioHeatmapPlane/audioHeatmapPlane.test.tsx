/**
 * AudioHeatmapPlane コンポーネント テスト
 * R3F内の描画はテスト対象外。エクスポートのみ検証。
 */

jest.mock('@react-three/fiber', () => ({
  useFrame: jest.fn(),
}));

jest.mock('../../shaders/audioHeatmap.vert.glsl', () => 'vertex shader');
jest.mock('../../shaders/audioHeatmap.frag.glsl', () => 'fragment shader');

import { AudioHeatmapPlane } from './audioHeatmapPlane';

describe('AudioHeatmapPlane', () => {
  it('エクスポートが正しく定義されている', () => {
    expect(AudioHeatmapPlane).toBeDefined();
    expect(AudioHeatmapPlane.displayName).toBe('AudioHeatmapPlane');
  });
});
