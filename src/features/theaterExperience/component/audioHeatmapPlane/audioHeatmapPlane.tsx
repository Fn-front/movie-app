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
import { interpolateFloorHeight } from '../../utils/theaterGeometry';
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
  /**
   * 各列の代表Z（前→後の降順）。傾斜床に沿わせる場合に渡す。
   * 床メッシュ（SlopedFloorMesh）と同じ `interpolateFloorHeight` で補間するため、
   * 面が必ず実際の床の上に乗る。
   */
  rowZs?: number[];
  /** 各列の代表Y（rowZs と同順・同数） */
  rowYs?: number[];
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
    rowZs,
    rowYs,
    reducedMotion = false,
  }) {
    const materialRef = useRef<ShaderMaterialType>(null);

    /**
     * 傾斜床に沿わせる場合、床メッシュ（SlopedFloorMesh）と**同じ**
     * `interpolateFloorHeight` で頂点を変位させる。
     *
     * 旧実装は `slopeMaxHeight * t²` という独自カーブを使っており、床メッシュ
     * （各列のYを必ず通る線形補間）とも座席（t^1.3）とも一致していなかった。
     * つまりヒートマップ面が実際の床の上に乗っていなかった。式を一本化する。
     */
    const geometry = useMemo(() => {
      const hasSlope = rowZs !== undefined && rowYs !== undefined;
      const segments = hasSlope ? Math.max(24, rowZs.length * 2) : 1;
      const geo = new PlaneGeometry(width, depth, 1, segments);
      if (!hasSlope || rowZs.length === 0 || rowZs.length !== rowYs.length) {
        return geo;
      }
      const posAttr = geo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        // plane の localY は -depth/2 .. +depth/2
        // 回転 -π/2 後、localY は world -Z 方向へ写像される
        // worldZ = centerZ - localY
        const localY = posAttr.getY(i);
        const worldZ = centerZ - localY;
        posAttr.setZ(i, interpolateFloorHeight(worldZ, rowZs, rowYs));
      }
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();
      return geo;
    }, [width, depth, centerZ, rowZs, rowYs]);

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
