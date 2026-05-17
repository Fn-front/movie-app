/**
 * AudioHeatmapPlaneコンポーネント
 * 耳の高さ(1.2m)の音響をシミュレーションし、床面に表示（単一レイヤー）
 * 色: 紫(低強度) → 青 → シアン → 緑 → 黄 → 赤(高強度)
 */

'use client';

import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, PlaneGeometry } from 'three';
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
  /** 傾斜床に沿わせる場合に渡す。スロープ前端Z（座席最前列のZ） */
  slopeFrontZ?: number;
  /** スロープ後端Z（座席最後列のZ） */
  slopeBackZ?: number;
  /** スロープ最大高さ（座席最後列のY） */
  slopeMaxHeight?: number;
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
    slopeFrontZ,
    slopeBackZ,
    slopeMaxHeight,
    reducedMotion = false,
  }) {
    const materialRef = useRef<ShaderMaterialType>(null);

    /**
     * 傾斜床に沿わせる場合、SlopedFloorMesh と同じ t² カーブで頂点を
     * 上方向に変位させる。これによりヒートマップが床（スロープ）の上面に
     * 重なり、スロープの下に隠れない。
     */
    const geometry = useMemo(() => {
      const segments = slopeFrontZ !== undefined ? 24 : 1;
      const geo = new PlaneGeometry(width, depth, 1, segments);
      if (
        slopeFrontZ === undefined ||
        slopeBackZ === undefined ||
        slopeMaxHeight === undefined
      ) {
        return geo;
      }
      const posAttr = geo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        // plane の localY は -depth/2 .. +depth/2
        // 回転 -π/2 後、localY は world -Z 方向へ写像される
        // worldZ = centerZ - localY
        const localY = posAttr.getY(i);
        const worldZ = centerZ - localY;
        // スロープ区間 (slopeBackZ..slopeFrontZ) の内側だけ持ち上げる
        if (worldZ >= slopeBackZ && worldZ <= slopeFrontZ) {
          const t = (slopeFrontZ - worldZ) / (slopeFrontZ - slopeBackZ);
          posAttr.setZ(i, slopeMaxHeight * t * t);
        }
      }
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();
      return geo;
    }, [width, depth, centerZ, slopeFrontZ, slopeBackZ, slopeMaxHeight]);

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
      materialRef.current.uniforms.uSliceAlpha.value = 0.7;
    });

    return (
      <mesh
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, centerZ]}
      >
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
