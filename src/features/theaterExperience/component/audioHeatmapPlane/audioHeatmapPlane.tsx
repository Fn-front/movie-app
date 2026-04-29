/**
 * AudioHeatmapPlaneコンポーネント
 * 耳の高さ(1.2m)の音響をシミュレーションし、床面に表示（単一レイヤー）
 * 色: 紫(低強度) → 青 → シアン → 緑 → 黄 → 赤(高強度)
 */

'use client';

import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending } from 'three';
import type { ShaderMaterial as ShaderMaterialType } from 'three';

import type { FrequencyBand } from '../../types';
import type { AudioShaderUniforms } from '../../hooks/useAudioShader';
import { ABSORPTION_COEFFICIENTS, FREQUENCY_MAP } from '../../utils/physics';
import { vertexShader } from '../../shaders/audioHeatmap.vert';
import { fragmentShader } from '../../shaders/audioHeatmap.frag';

export interface AudioHeatmapPlaneProps {
  /** シェーダーuniforms */
  uniforms: AudioShaderUniforms;
  /** 現在の周波数帯 */
  frequencyBand: FrequencyBand;
  /** 平面の幅 (m) */
  width: number;
  /** 平面の奥行 (m) */
  depth: number;
  /** 平面の中心Z座標 (m) */
  centerZ?: number;
  /** prefers-reduced-motionが有効か */
  reducedMotion?: boolean;
}

export const AudioHeatmapPlane = memo<AudioHeatmapPlaneProps>(
  function AudioHeatmapPlane({
    uniforms,
    frequencyBand,
    width,
    depth,
    centerZ = 0,
    reducedMotion = false,
  }) {
    const materialRef = useRef<ShaderMaterialType>(null);

    // フレームごとにuTimeを更新し、周波数帯のuniformを同期
    // R3FはshaderMaterialのuniforms propを内部コピーするため、
    // useEffectでのref経由ミューテーションではGPUに反映されない。
    // materialRef経由で直接更新する必要がある。
    useFrame((_, delta) => {
      if (!materialRef.current) return;
      if (!reducedMotion) {
        materialRef.current.uniforms.uTime.value += delta * 0.5;
      }
      materialRef.current.uniforms.uFrequency.value =
        FREQUENCY_MAP[frequencyBand];
      materialRef.current.uniforms.uAbsorption.value =
        ABSORPTION_COEFFICIENTS[frequencyBand];
    });

    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, centerZ]}>
        <planeGeometry args={[width, depth, 1, 1]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms as unknown as Record<string, { value: unknown }>}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    );
  },
);

AudioHeatmapPlane.displayName = 'AudioHeatmapPlane';
