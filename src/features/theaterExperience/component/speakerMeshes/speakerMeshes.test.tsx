/**
 * SpeakerMeshes コンポーネント テスト
 * R3F内の描画はテスト対象外。props型とエクスポートのみ検証。
 */

jest.mock('three', () => ({
  Object3D: jest.fn().mockImplementation(function (
    this: Record<string, unknown>,
  ) {
    this.position = { set: jest.fn() };
    this.rotation = { set: jest.fn() };
    this.matrix = {};
    this.updateMatrix = jest.fn();
  }),
  Color: jest.fn(),
}));

jest.mock('three-stdlib', () => ({
  RoundedBoxGeometry: jest.fn(),
}));

jest.mock('@react-three/fiber', () => ({
  extend: jest.fn(),
}));

import type { TheaterSpeaker } from '../../types';

import { SpeakerMeshes } from './speakerMeshes';

describe('SpeakerMeshes', () => {
  it('エクスポートが正しく定義されている', () => {
    expect(SpeakerMeshes).toBeDefined();
    expect(SpeakerMeshes.displayName).toBe('SpeakerMeshes');
  });

  it('propsの型が正しい', () => {
    const mockSpeaker: TheaterSpeaker = {
      id: 'speaker-1',
      channel: 'L',
      position_x: -7,
      position_y: 3,
      position_z: 5,
      power_watts: 500,
      direction_x: -0.41,
      direction_y: -0.21,
      direction_z: -0.89,
      directivity_alpha: 0.5,
    };

    const props = {
      speakers: [mockSpeaker],
    };

    expect(props.speakers).toHaveLength(1);
    expect(props.speakers[0].channel).toBe('L');
  });

  it('天井チャンネルを含むスピーカーを受け付ける', () => {
    const ceilingSpeaker: TheaterSpeaker = {
      id: 'speaker-ltf',
      channel: 'LTF',
      position_x: -4,
      position_y: 7,
      position_z: 3,
      power_watts: 300,
      direction_x: -0.34,
      direction_y: -0.55,
      direction_z: -0.76,
      directivity_alpha: 0.6,
    };

    const lfeSpeaker: TheaterSpeaker = {
      id: 'speaker-lfe',
      channel: 'LFE',
      position_x: 0,
      position_y: 0.5,
      position_z: 10,
      power_watts: 800,
      direction_x: 0.0,
      direction_y: 0.04,
      direction_z: -1.0,
      directivity_alpha: 1.0,
    };

    const speakers = [ceilingSpeaker, lfeSpeaker];
    expect(speakers).toHaveLength(2);
    expect(speakers[0].channel).toBe('LTF');
    expect(speakers[1].channel).toBe('LFE');
  });
});
