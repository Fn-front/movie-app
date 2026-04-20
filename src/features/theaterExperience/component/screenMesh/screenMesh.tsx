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
        color='#e0e0e0'
        emissive='#8888cc'
        emissiveIntensity={0.5}
        side={DoubleSide}
      />
    </mesh>
  );
});

ScreenMesh.displayName = 'ScreenMesh';
