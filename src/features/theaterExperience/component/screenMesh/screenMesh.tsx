/**
 * ScreenMeshコンポーネント
 * スクリーン矩形メッシュ + ベゼル（暗いフレーム）
 * カスタムshaderMaterialでノイズベースの映像感を演出
 */

'use client';

import { memo, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, ShaderMaterial } from 'three';

import { screenVertexShader } from '../../shaders/screenVertex';
import { screenFragmentShader } from '../../shaders/screenFragment';

/** ベゼル（フレーム）の太さ (m) */
const BEZEL_THICKNESS = 0.08;
/** ベゼルの奥行き (m) */
const BEZEL_DEPTH = 0.05;

export interface ScreenMeshProps {
  /** スクリーン幅 (m) */
  width: number;
  /** スクリーン高さ (m) */
  height: number;
  /** スクリーン中心X座標 */
  centerX: number;
  /** スクリーン中心Y座標 */
  centerY: number;
  /** スクリーン中心Z座標 */
  centerZ: number;
  /** prefers-reduced-motion 有効時は true */
  reducedMotion?: boolean;
}

export const ScreenMesh = memo<ScreenMeshProps>(function ScreenMesh({
  width,
  height,
  centerX,
  centerY,
  centerZ,
  reducedMotion = false,
}) {
  const halfW = width / 2;
  const halfH = height / 2;
  const materialRef = useRef<ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
    }),
    [],
  );

  useFrame((_, delta) => {
    if (materialRef.current && !reducedMotion) {
      materialRef.current.uniforms.uTime.value += delta;
    }
  });

  return (
    <group position={[centerX, centerY, centerZ]}>
      {/* スクリーン本体 */}
      <mesh>
        <planeGeometry args={[width, height]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={screenVertexShader}
          fragmentShader={screenFragmentShader}
          uniforms={uniforms}
          side={DoubleSide}
          toneMapped
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>

      {/* ベゼル（上） */}
      <mesh position={[0, halfH + BEZEL_THICKNESS / 2, -BEZEL_DEPTH / 2]}>
        <boxGeometry
          args={[width + BEZEL_THICKNESS * 2, BEZEL_THICKNESS, BEZEL_DEPTH]}
        />
        <meshStandardMaterial color='#080808' roughness={0.3} metalness={0.7} />
      </mesh>

      {/* ベゼル（下） */}
      <mesh position={[0, -halfH - BEZEL_THICKNESS / 2, -BEZEL_DEPTH / 2]}>
        <boxGeometry
          args={[width + BEZEL_THICKNESS * 2, BEZEL_THICKNESS, BEZEL_DEPTH]}
        />
        <meshStandardMaterial color='#080808' roughness={0.3} metalness={0.7} />
      </mesh>

      {/* ベゼル（左） */}
      <mesh position={[-halfW - BEZEL_THICKNESS / 2, 0, -BEZEL_DEPTH / 2]}>
        <boxGeometry args={[BEZEL_THICKNESS, height, BEZEL_DEPTH]} />
        <meshStandardMaterial color='#080808' roughness={0.3} metalness={0.7} />
      </mesh>

      {/* ベゼル（右） */}
      <mesh position={[halfW + BEZEL_THICKNESS / 2, 0, -BEZEL_DEPTH / 2]}>
        <boxGeometry args={[BEZEL_THICKNESS, height, BEZEL_DEPTH]} />
        <meshStandardMaterial color='#080808' roughness={0.3} metalness={0.7} />
      </mesh>
    </group>
  );
});

ScreenMesh.displayName = 'ScreenMesh';
