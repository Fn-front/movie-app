/**
 * TheaterSceneコンポーネント
 * 劇場3Dシーンの配置（ライト・カメラコントロール・床・壁）
 */

'use client';

import { memo } from 'react';
import { OrbitControls } from '@react-three/drei';

export interface TheaterSceneProps {
  /** 劇場の幅 (m) */
  roomWidth: number;
  /** 劇場の奥行 (m) */
  roomDepth: number;
  /** 劇場の高さ (m) */
  roomHeight: number;
  /** 子要素（座席、スクリーン、ヒートマップ等） */
  children: React.ReactNode;
}

export const TheaterScene = memo<TheaterSceneProps>(function TheaterScene({
  roomWidth,
  roomDepth,
  roomHeight,
  children,
}) {
  const halfWidth = roomWidth / 2;
  const halfDepth = roomDepth / 2;

  return (
    <>
      {/* カメラコントロール */}
      <OrbitControls
        target={[0, 1, 0]}
        maxPolarAngle={Math.PI / 2}
        minDistance={5}
        maxDistance={40}
      />

      {/* ライティング */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[0, roomHeight, 0]} intensity={0.5} />
      <pointLight position={[0, roomHeight - 1, 0]} intensity={0.3} />

      {/* 床 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[roomWidth, roomDepth]} />
        <meshStandardMaterial color='#1a1a2e' />
      </mesh>

      {/* 後壁 */}
      <mesh position={[0, roomHeight / 2, -halfDepth]}>
        <planeGeometry args={[roomWidth, roomHeight]} />
        <meshStandardMaterial color='#16213e' />
      </mesh>

      {/* 左壁 */}
      <mesh
        rotation={[0, Math.PI / 2, 0]}
        position={[-halfWidth, roomHeight / 2, 0]}
      >
        <planeGeometry args={[roomDepth, roomHeight]} />
        <meshStandardMaterial color='#16213e' />
      </mesh>

      {/* 右壁 */}
      <mesh
        rotation={[0, -Math.PI / 2, 0]}
        position={[halfWidth, roomHeight / 2, 0]}
      >
        <planeGeometry args={[roomDepth, roomHeight]} />
        <meshStandardMaterial color='#16213e' />
      </mesh>

      {children}
    </>
  );
});

TheaterScene.displayName = 'TheaterScene';
