/**
 * ScreenMeshコンポーネント
 * スクリーン矩形メッシュ
 */

'use client';

import { memo } from 'react';
import { DoubleSide } from 'three';

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
}

export const ScreenMesh = memo<ScreenMeshProps>(function ScreenMesh({
  width,
  height,
  centerX,
  centerY,
  centerZ,
}) {
  return (
    <mesh position={[centerX, centerY, centerZ]}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial
        color='#f0f0f0'
        emissive='#aab0cc'
        emissiveIntensity={0.8}
        side={DoubleSide}
      />
    </mesh>
  );
});

ScreenMesh.displayName = 'ScreenMesh';
