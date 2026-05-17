/**
 * ScreenMeshコンポーネント
 * スクリーン矩形メッシュ + ベゼル（暗いフレーム）
 * アイソメトリック ドールハウス: フラットな単色 + エッジ強調
 */

'use client';

import { memo } from 'react';
import { DoubleSide } from 'three';
import { Edges } from '@react-three/drei';

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
  /** prefers-reduced-motion 有効時は true（プロトタイプでは未使用） */
  reducedMotion?: boolean;
}

export const ScreenMesh = memo<ScreenMeshProps>(function ScreenMesh({
  width,
  height,
  centerX,
  centerY,
  centerZ,
}) {
  const halfW = width / 2;
  const halfH = height / 2;

  return (
    /*
      スクリーンZを後壁から 0.1m 手前にオフセットして Z-fighting を回避。
      後壁はシーンの halfDepth (= room_depth/2) 位置にあり、screen_center_z が
      同じ値だと両者が同一平面に重なってシマ模様のアーティファクトが発生する。
    */
    <group position={[centerX, centerY, centerZ - 0.1]}>
      {/* スクリーン本体（フラットな単色） */}
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          color='#3a4a8a'
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
