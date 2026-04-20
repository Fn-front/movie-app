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
  },
  {
    id: 'sp-2',
    channel: 'R',
    position_x: 5,
    position_y: 2,
    position_z: 10,
    power_watts: 100,
  },
];

describe('useAudioShader', () => {
  it('uniformsを返す', () => {
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

  it('スピーカーデータからDataTextureを生成する', () => {
    const { result } = renderHook(() =>
      useAudioShader(mockSpeakers, 'mid', 20, 25),
    );

    expect(result.current.uSpeakerData.value).toBeDefined();
    expect(result.current.uSpeakerData.value.width).toBe(2);
  });
});
