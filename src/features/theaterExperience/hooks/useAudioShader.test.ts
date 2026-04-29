/**
 * useAudioShader フック テスト
 */

import { renderHook } from '@testing-library/react';

import type { TheaterSpeaker, FrequencyBand } from '../types';

import { useAudioShader } from './useAudioShader';

// Three.js モック
jest.mock('three', () => ({
  DataTexture: jest.fn().mockImplementation(function (
    this: Record<string, unknown>,
    data: Float32Array,
    width: number,
    height: number,
  ) {
    this.data = data;
    this.width = width;
    this.height = height;
    this.needsUpdate = false;
    this.dispose = jest.fn();
  }),
  FloatType: 1015,
  RGBAFormat: 1023,
  NearestFilter: 1003,
}));

const mockSpeakers: TheaterSpeaker[] = [
  {
    id: 'sp-1',
    channel: 'L',
    position_x: -5,
    position_y: 2,
    position_z: 10,
    power_watts: 100,
    direction_x: 0.41,
    direction_y: -0.21,
    direction_z: -0.89,
    directivity_alpha: 0.5,
  },
  {
    id: 'sp-2',
    channel: 'R',
    position_x: 5,
    position_y: 2,
    position_z: 10,
    power_watts: 100,
    direction_x: -0.41,
    direction_y: -0.21,
    direction_z: -0.89,
    directivity_alpha: 0.5,
  },
];

describe('useAudioShader', () => {
  it('単一のuniformsオブジェクトを返す', () => {
    const { result } = renderHook(() =>
      useAudioShader(mockSpeakers, 'mid', 20, 25),
    );

    const uniforms = result.current;
    expect(uniforms).toBeDefined();
    expect(uniforms.uSpeakerCount).toBeDefined();
    expect(uniforms.uSliceY).toBeDefined();
  });

  it('正しいuniform値を持つ', () => {
    const { result } = renderHook(() =>
      useAudioShader(mockSpeakers, 'mid', 20, 25),
    );

    const uniforms = result.current;
    expect(uniforms.uSpeakerCount.value).toBe(2);
    expect(uniforms.uFrequency.value).toBe(1000);
    expect(uniforms.uTime.value).toBe(0);
    expect(uniforms.uRoomSize.value).toEqual([20, 25]);
    expect(uniforms.uRoomOffset.value).toEqual([-10, -12.5]);
  });

  it('デフォルトのsliceYが1.2（耳の高さ）', () => {
    const { result } = renderHook(() =>
      useAudioShader(mockSpeakers, 'mid', 20, 25),
    );

    expect(result.current.uSliceY.value).toBeCloseTo(1.2);
  });

  it('sliceYをカスタム値で指定できる', () => {
    const { result } = renderHook(() =>
      useAudioShader(mockSpeakers, 'mid', 20, 25, 2.0),
    );

    expect(result.current.uSliceY.value).toBeCloseTo(2.0);
  });

  it('uSliceAlphaが0.85', () => {
    const { result } = renderHook(() =>
      useAudioShader(mockSpeakers, 'mid', 20, 25),
    );

    expect(result.current.uSliceAlpha.value).toBeCloseTo(0.85);
  });

  it('周波数帯に応じてfrequencyが変わる', () => {
    const bands: FrequencyBand[] = ['low', 'mid', 'high'];
    const expected = [80, 1000, 8000];

    bands.forEach((band, i) => {
      const { result } = renderHook(() =>
        useAudioShader(mockSpeakers, band, 20, 25),
      );
      expect(result.current.uFrequency.value).toBe(expected[i]);
    });
  });

  it('スピーカーデータからDataTextureを生成する（2行テクスチャ）', () => {
    const { result } = renderHook(() =>
      useAudioShader(mockSpeakers, 'mid', 20, 25),
    );

    expect(result.current.uSpeakerData.value).toBeDefined();
    expect(result.current.uSpeakerData.value.width).toBe(2);
    expect(result.current.uSpeakerData.value.height).toBe(2);
  });

  it('roomCenterZを指定するとuRoomOffsetのZ成分がシフトする', () => {
    const { result } = renderHook(() =>
      useAudioShader(mockSpeakers, 'mid', 20, 16, 1.2, 3.5),
    );

    expect(result.current.uRoomSize.value).toEqual([20, 16]);
    // offset = [-20/2, 3.5 - 16/2] = [-10, -4.5]
    expect(result.current.uRoomOffset.value).toEqual([-10, -4.5]);
  });

  it('参照が安定している', () => {
    const { result, rerender } = renderHook(() =>
      useAudioShader(mockSpeakers, 'mid', 20, 25),
    );

    const firstRef = result.current;
    rerender();
    expect(result.current).toBe(firstRef);
  });
});
