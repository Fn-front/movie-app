/**
 * AudioHeatmapPlaneコンポーネント
 * ShaderMaterialとDataTextureでオーディオヒートマップを描画
 */

'use client';

import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ShaderMaterial as ShaderMaterialType } from 'three';

import type { AudioShaderUniforms } from '../../hooks/useAudioShader';
import vertexShader from '../../shaders/audioHeatmap.vert.glsl';
import fragmentShader from '../../shaders/audioHeatmap.frag.glsl';

export interface AudioHeatmapPlaneProps {
  /** シェーダーuniforms */
  uniforms: AudioShaderUniforms;
  /** 平面の幅 (m) */
  width: number;
  /** 平面の奥行 (m) */
  depth: number;
  /** prefers-reduced-motionが有効か */
  reducedMotion?: boolean;
}

export const AudioHeatmapPlane = memo<AudioHeatmapPlaneProps>(
  function AudioHeatmapPlane({
    uniforms,
    width,
    depth,
    reducedMotion = false,
  }) {
    const materialRef = useRef<ShaderMaterialType>(null);

    // フレームごとにuTimeを更新
    useFrame((_, delta) => {
      if (materialRef.current && !reducedMotion) {
        materialRef.current.uniforms.uTime.value += delta * 0.5;
      }
    });

    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[width, depth, 1, 1]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms as unknown as Record<string, { value: unknown }>}
          transparent
        />
      </mesh>
    );
  },
);

AudioHeatmapPlane.displayName = 'AudioHeatmapPlane';
