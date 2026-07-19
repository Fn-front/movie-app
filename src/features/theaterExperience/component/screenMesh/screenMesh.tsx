/**
 * ScreenMeshコンポーネント
 * スクリーン矩形メッシュ + ベゼル（暗いフレーム）
 * 本体は投影風シェーダー（screenVertex/screenFragment）で「上映中の幕」を表現する。
 * prefers-reduced-motion 有効時はアニメ（フリッカー含む）を停止する。
 */

'use client';

import { memo, useMemo, useRef } from 'react';
import { DoubleSide } from 'three';
import type { ShaderMaterial } from 'three';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';

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
  /** prefers-reduced-motion 有効時は true（投影アニメを停止する） */
  reducedMotion?: boolean;
}

/**
 * 投影シェーダーの経過時間を進める。
 * reducedMotion 有効時は現在値を維持してアニメ（12Hzフリッカー含む）を停止する
 * （WCAG 2.3.1 点滅/発作、prefers-reduced-motion への配慮）。
 */
export function advanceScreenTime(
  current: number,
  delta: number,
  reducedMotion: boolean,
): number {
  return reducedMotion ? current : current + delta;
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
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.uTime.value = advanceScreenTime(
      material.uniforms.uTime.value,
      delta,
      reducedMotion,
    );
  });

  return (
    /*
      スクリーンZを後壁から 0.1m 手前にオフセットして Z-fighting を回避。
      後壁はシーンの halfDepth (= room_depth/2) 位置にあり、screen_center_z が
      同じ値だと両者が同一平面に重なってシマ模様のアーティファクトが発生する。
    */
    <group position={[centerX, centerY, centerZ - 0.1]}>
      {/* スクリーン本体（投影風シェーダー） */}
      <mesh>
        <planeGeometry args={[width, height]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={screenVertexShader}
          fragmentShader={screenFragmentShader}
          uniforms={uniforms}
          side={DoubleSide}
          toneMapped={false}
        />
        <Edges color='#1a1a2e' lineWidth={1.5} />
      </mesh>

      {/* ベゼル（上） */}
      <mesh position={[0, halfH + BEZEL_THICKNESS / 2, -BEZEL_DEPTH / 2]}>
        <boxGeometry
          args={[width + BEZEL_THICKNESS * 2, BEZEL_THICKNESS, BEZEL_DEPTH]}
        />
        <meshLambertMaterial color='#1a1a2e' />
        <Edges color='#0a0a14' lineWidth={1} />
      </mesh>

      {/* ベゼル（下） */}
      <mesh position={[0, -halfH - BEZEL_THICKNESS / 2, -BEZEL_DEPTH / 2]}>
        <boxGeometry
          args={[width + BEZEL_THICKNESS * 2, BEZEL_THICKNESS, BEZEL_DEPTH]}
        />
        <meshLambertMaterial color='#1a1a2e' />
        <Edges color='#0a0a14' lineWidth={1} />
      </mesh>

      {/* ベゼル（左） */}
      <mesh position={[-halfW - BEZEL_THICKNESS / 2, 0, -BEZEL_DEPTH / 2]}>
        <boxGeometry args={[BEZEL_THICKNESS, height, BEZEL_DEPTH]} />
        <meshLambertMaterial color='#1a1a2e' />
        <Edges color='#0a0a14' lineWidth={1} />
      </mesh>

      {/* ベゼル（右） */}
      <mesh position={[halfW + BEZEL_THICKNESS / 2, 0, -BEZEL_DEPTH / 2]}>
        <boxGeometry args={[BEZEL_THICKNESS, height, BEZEL_DEPTH]} />
        <meshLambertMaterial color='#1a1a2e' />
        <Edges color='#0a0a14' lineWidth={1} />
      </mesh>
    </group>
  );
});

ScreenMesh.displayName = 'ScreenMesh';
