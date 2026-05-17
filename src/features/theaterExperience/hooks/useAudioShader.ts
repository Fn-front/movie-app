/**
 * オーディオヒートマップシェーダー用フック
 * スピーカーデータをDataTextureに変換し、スライスごとのuniformsを管理する
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
  uSliceY: { value: number };
  uSliceAlpha: { value: number };
}

/**
 * スピーカー配列からDataTextureを生成（2行）
 * row0 (v=0.25): [position_x, position_y, position_z, power_watts]
 * row1 (v=0.75): [direction_x, direction_y, direction_z, directivity_alpha]
 */
function createSpeakerTexture(speakers: TheaterSpeaker[]): DataTexture {
  const count = Math.max(speakers.length, 1);
  const data = new Float32Array(count * 4 * 2);

  for (let i = 0; i < speakers.length; i++) {
    const s = speakers[i];
    // row0: position + power
    const row0 = i * 4;
    data[row0 + 0] = s.position_x;
    data[row0 + 1] = s.position_y;
    data[row0 + 2] = s.position_z;
    data[row0 + 3] = s.power_watts;

    // row1: direction + alpha
    const row1 = count * 4 + i * 4;
    data[row1 + 0] = s.direction_x;
    data[row1 + 1] = s.direction_y;
    data[row1 + 2] = s.direction_z;
    data[row1 + 3] = s.directivity_alpha;
  }

  const texture = new DataTexture(data, count, 2, RGBAFormat, FloatType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.needsUpdate = true;

  return texture;
}

/**
 * オーディオシェーダーのuniformsをスライス配列として生成・管理するフック
 *
 * uniforms オブジェクトの参照を安定させ、値のみをミューテートすることで
 * R3F の shaderMaterial が正しく uniform を反映する。
 *
 * @param speakers スピーカー配列
 * @param frequencyBand 周波数帯
 * @param roomWidth ヒートマップ幅 (m)
 * @param roomDepth ヒートマップ奥行 (m)
 * @param sliceY スライスのY座標（耳の高さ、デフォルト1.2m）
 * @param roomCenterZ ヒートマップ中心のZ座標（デフォルト0）
 */
export function useAudioShader(
  speakers: TheaterSpeaker[],
  frequencyBand: FrequencyBand,
  roomWidth: number,
  roomDepth: number,
  sliceY: number = 1.2,
  roomCenterZ: number = 0,
): AudioShaderUniforms {
  const uniformsRef = useRef<AudioShaderUniforms | null>(null);

  // 初回のみ uniforms を作成（lazy ref initialization）
  // R3F ShaderMaterial の uniforms は安定した参照が必要
  if (uniformsRef.current === null) {
    const texture = createSpeakerTexture(speakers);

    uniformsRef.current = {
      uSpeakerData: { value: texture },
      uSpeakerCount: { value: speakers.length },
      uFrequency: { value: FREQUENCY_MAP[frequencyBand] },
      uAbsorption: { value: ABSORPTION_COEFFICIENTS[frequencyBand] },
      uTime: { value: 0 },
      uRoomSize: { value: [roomWidth, roomDepth] as [number, number] },
      uRoomOffset: {
        value: [-roomWidth / 2, roomCenterZ - roomDepth / 2] as [
          number,
          number,
        ],
      },
      uSliceY: { value: sliceY },
      uSliceAlpha: { value: 0.4 },
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
    uniformsRef.current.uRoomOffset.value = [
      -roomWidth / 2,
      roomCenterZ - roomDepth / 2,
    ];
  }, [roomWidth, roomDepth, roomCenterZ]);

  // eslint-disable-next-line react-hooks/refs -- R3F ShaderMaterial requires stable uniform reference via lazy ref init
  return uniformsRef.current!;
}
