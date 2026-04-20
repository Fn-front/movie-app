/**
 * TheaterSceneコンポーネント
 * 劇場3Dシーンの配置（ライト・カメラコントロール・床・壁）
 */

'use client';

import { memo, useRef, useEffect } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';

import type { TheaterSeat, Theater } from '../../types';

export interface TheaterSceneProps {
  /** 劇場の幅 (m) */
  roomWidth: number;
  /** 劇場の奥行 (m) */
  roomDepth: number;
  /** 劇場の高さ (m) */
  roomHeight: number;
  /** 選択中の座席 */
  selectedSeat: TheaterSeat | null;
  /** 劇場データ（スクリーン位置用） */
  theater: Theater;
  /** 子要素（座席、スクリーン、ヒートマップ等） */
  children: React.ReactNode;
}

/** 俯瞰カメラの初期位置 */
const OVERVIEW_POSITION = new Vector3(0, 15, -20);
const OVERVIEW_TARGET = new Vector3(0, 1, 0);

/** カメラ補間の速度 (0~1、1に近いほど速い) */
const LERP_SPEED = 3;

/**
 * カメラアニメーション用の内部コンポーネント
 * useFrame を使って毎フレームカメラ位置を補間する
 */
const CameraAnimator = memo<{
  selectedSeat: TheaterSeat | null;
  theater: Theater;
}>(function CameraAnimator({ selectedSeat, theater }) {
  const controlsRef = useRef<OrbitControlsType>(null);
  const { camera } = useThree();
  const targetPos = useRef(OVERVIEW_POSITION.clone());
  const targetLookAt = useRef(OVERVIEW_TARGET.clone());

  useEffect(() => {
    if (selectedSeat) {
      // 一人称視点: 座席位置 + 目の高さ
      const eyeHeight = selectedSeat.position_y + 1.2;
      targetPos.current.set(
        selectedSeat.position_x,
        eyeHeight,
        selectedSeat.position_z,
      );
      targetLookAt.current.set(
        theater.screen_center_x,
        theater.screen_center_y,
        theater.screen_center_z,
      );
    } else {
      // 俯瞰視点に戻る
      targetPos.current.copy(OVERVIEW_POSITION);
      targetLookAt.current.copy(OVERVIEW_TARGET);
    }
  }, [selectedSeat, theater]);

  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;
    const t = 1 - Math.exp(-LERP_SPEED * delta);

    camera.position.lerp(targetPos.current, t);
    controls.target.lerp(targetLookAt.current, t);
    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0, 1, 0]}
      maxPolarAngle={Math.PI / 2}
      minDistance={1}
      maxDistance={40}
      enableDamping={false}
    />
  );
});

CameraAnimator.displayName = 'CameraAnimator';

export const TheaterScene = memo<TheaterSceneProps>(function TheaterScene({
  roomWidth,
  roomDepth,
  roomHeight,
  selectedSeat,
  theater,
  children,
}) {
  const halfWidth = roomWidth / 2;
  const halfDepth = roomDepth / 2;

  return (
    <>
      {/* カメラコントロール + 一人称視点アニメーション */}
      <CameraAnimator selectedSeat={selectedSeat} theater={theater} />

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
