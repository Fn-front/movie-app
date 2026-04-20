/**
 * オーディオヒートマップシェーダー用フック
 * スピーカーデータをDataTextureに変換し、uniformsを管理する
 */

import { useEffect, useRef } from 'react';
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
  const count = Math.max(speakers.length, 1);
  const data = new Float32Array(count * 4);

  for (let i = 0; i < speakers.length; i++) {
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
 * uniforms オブジェクトの参照を安定させ、値のみをミューテートすることで
 * R3F の shaderMaterial が正しく uniform を反映する。
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
  const uniformsRef = useRef<AudioShaderUniforms | null>(null);

  // 初回のみ uniforms オブジェクトを作成
  if (uniformsRef.current === null) {
    uniformsRef.current = {
      uSpeakerData: { value: createSpeakerTexture(speakers) },
      uSpeakerCount: { value: speakers.length },
      uFrequency: { value: FREQUENCY_MAP[frequencyBand] },
      uAbsorption: { value: ABSORPTION_COEFFICIENTS[frequencyBand] },
      uTime: { value: 0 },
      uRoomSize: { value: [roomWidth, roomDepth] },
      uRoomOffset: { value: [-roomWidth / 2, -roomDepth / 2] },
    };
  }

  // スピーカーデータが変わったらテクスチャを再生成
  useEffect(() => {
    if (!uniformsRef.current) return;
    const tex = createSpeakerTexture(speakers);
    uniformsRef.current.uSpeakerData.value = tex;
    uniformsRef.current.uSpeakerCount.value = speakers.length;
    return () => tex.dispose();
  }, [speakers]);

  // 周波数帯が変わったら値をミューテート
  useEffect(() => {
    if (!uniformsRef.current) return;
    uniformsRef.current.uFrequency.value = FREQUENCY_MAP[frequencyBand];
    uniformsRef.current.uAbsorption.value =
      ABSORPTION_COEFFICIENTS[frequencyBand];
  }, [frequencyBand]);

  // 部屋サイズが変わったら値をミューテート
  useEffect(() => {
    if (!uniformsRef.current) return;
    uniformsRef.current.uRoomSize.value = [roomWidth, roomDepth];
    uniformsRef.current.uRoomOffset.value = [-roomWidth / 2, -roomDepth / 2];
  }, [roomWidth, roomDepth]);

  return uniformsRef.current;
}
