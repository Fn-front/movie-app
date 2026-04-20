/**
 * オーディオヒートマップシェーダー用フック
 * スピーカーデータをDataTextureに変換し、uniformsを管理する
 */

import { useMemo } from 'react';
import { DataTexture, FloatType, RGBAFormat, NearestFilter } from 'three';

import type { TheaterSpeaker, FrequencyBand } from '../types';
import { ABSORPTION_COEFFICIENTS, FREQUENCY_MAP } from '../utils/physics';

export interface AudioShaderUniforms {
  uSpeakerData: { value: DataTexture };
  uSpeakerCount: { value: number };
  uFrequency: { value: number };
  uAbsorption: { value: number };
  uTime: { value: number };
  uRoomSize: { value: [number, number] };
  uRoomOffset: { value: [number, number] };
}

/**
 * スピーカー配列からDataTextureを生成
 * 各ピクセル: [x, y, z, power_watts]
 */
function createSpeakerTexture(speakers: TheaterSpeaker[]): DataTexture {
  const count = speakers.length;
  const data = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    const s = speakers[i];
    data[i * 4 + 0] = s.position_x;
    data[i * 4 + 1] = s.position_y;
    data[i * 4 + 2] = s.position_z;
    data[i * 4 + 3] = s.power_watts;
  }

  const texture = new DataTexture(data, count, 1, RGBAFormat, FloatType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.needsUpdate = true;

  return texture;
}

/**
 * オーディオシェーダーのuniformsを生成・管理するフック
 *
 * @param speakers スピーカー配列
 * @param frequencyBand 周波数帯
 * @param roomWidth 劇場幅 (m)
 * @param roomDepth 劇場奥行 (m)
 */
export function useAudioShader(
  speakers: TheaterSpeaker[],
  frequencyBand: FrequencyBand,
  roomWidth: number,
  roomDepth: number,
): AudioShaderUniforms {
  const speakerTexture = useMemo(
    () => createSpeakerTexture(speakers),
    [speakers],
  );

  const frequency = FREQUENCY_MAP[frequencyBand];
  const absorption = ABSORPTION_COEFFICIENTS[frequencyBand];

  const uniforms = useMemo<AudioShaderUniforms>(
    () => ({
      uSpeakerData: { value: speakerTexture },
      uSpeakerCount: { value: speakers.length },
      uFrequency: { value: frequency },
      uAbsorption: { value: absorption },
      uTime: { value: 0 },
      uRoomSize: { value: [roomWidth, roomDepth] },
      uRoomOffset: { value: [-roomWidth / 2, -roomDepth / 2] },
    }),
    [
      speakerTexture,
      speakers.length,
      frequency,
      absorption,
      roomWidth,
      roomDepth,
    ],
  );

  return uniforms;
}
