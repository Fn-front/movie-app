/**
 * TheaterSceneコンポーネント
 * 劇場3Dシーンの配置（ライト・カメラコントロール・床・壁）
 * PBRテクスチャ・改善ライティングで映画館の雰囲気を演出
 */

'use client';

import { Suspense, memo, useRef, useEffect, useMemo } from 'react';
import { OrbitControls, useTexture, ContactShadows } from '@react-three/drei';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3, RepeatWrapping } from 'three';
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
      // 座席視点: 座席の少し後ろ上方から見下ろす
      // 選択席・周囲の席・スクリーンが全て見える位置
      targetPos.current.set(
        selectedSeat.position_x,
        selectedSeat.position_y + 3.5,
        selectedSeat.position_z - 3,
      );
      // 座席から真っ直ぐ前方（スクリーン壁方向）を注視
      // X座標は座席と同じにして横回転を防止
      targetLookAt.current.set(
        selectedSeat.position_x,
        theater.screen_center_y,
        theater.screen_center_z,
      );
    } else {
      // 俯瞰視点に戻る
      targetPos.current.copy(OVERVIEW_POSITION);
      targetLookAt.current.copy(OVERVIEW_TARGET);
    }
  }, [selectedSeat, theater]);

  const isAnimating = useRef(false);

  useEffect(() => {
    isAnimating.current = true;
    if (controlsRef.current) {
      controlsRef.current.enabled = false;
    }
  }, [selectedSeat]);

  useFrame((_, delta) => {
    if (!controlsRef.current || !isAnimating.current) return;
    const controls = controlsRef.current;
    const t = 1 - Math.exp(-LERP_SPEED * delta);

    camera.position.lerp(targetPos.current, t);
    controls.target.lerp(targetLookAt.current, t);
    controls.update();

    const posDist = camera.position.distanceTo(targetPos.current);
    const targetDist = controls.target.distanceTo(targetLookAt.current);

    if (posDist < 0.01 && targetDist < 0.01) {
      // アニメーション完了: OrbitControlsにカメラ制御を委譲
      camera.position.copy(targetPos.current);
      controls.target.copy(targetLookAt.current);
      controls.update();
      controls.enabled = true;
      isAnimating.current = false;
    }
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

/** 床テクスチャのリピート回数 */
const FLOOR_REPEAT_X = 4;
const FLOOR_REPEAT_Y = 5;
/** 壁テクスチャのリピート回数 */
const WALL_REPEAT_X = 3;
const WALL_REPEAT_Y = 2;
/** 天井テクスチャのリピート回数 */
const CEILING_REPEAT_X = 3;
const CEILING_REPEAT_Y = 4;

/**
 * PBRテクスチャ付きの床メッシュ
 */
const FloorMesh = memo<{ roomWidth: number; roomDepth: number }>(
  function FloorMesh({ roomWidth, roomDepth }) {
    const textures = useTexture({
      map: '/textures/theater/carpet_color.jpg',
      normalMap: '/textures/theater/carpet_normal.jpg',
      roughnessMap: '/textures/theater/carpet_roughness.jpg',
      aoMap: '/textures/theater/carpet_ao.jpg',
    });

    useMemo(() => {
      Object.values(textures).forEach((tex) => {
        tex.wrapS = RepeatWrapping;
        tex.wrapT = RepeatWrapping;
        tex.repeat.set(FLOOR_REPEAT_X, FLOOR_REPEAT_Y);
      });
    }, [textures]);

    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[roomWidth, roomDepth]} />
        <meshStandardMaterial {...textures} color='#1a1a2e' roughness={0.95} />
      </mesh>
    );
  },
);
FloorMesh.displayName = 'FloorMesh';

/**
 * PBRテクスチャ付きの壁メッシュ
 */
const WallMesh = memo<{
  width: number;
  height: number;
  position: [number, number, number];
  rotation?: [number, number, number];
}>(function WallMesh({ width, height, position, rotation }) {
  const textures = useTexture({
    map: '/textures/theater/wall_color.jpg',
    normalMap: '/textures/theater/wall_normal.jpg',
    roughnessMap: '/textures/theater/wall_roughness.jpg',
  });

  useMemo(() => {
    Object.values(textures).forEach((tex) => {
      tex.wrapS = RepeatWrapping;
      tex.wrapT = RepeatWrapping;
      tex.repeat.set(WALL_REPEAT_X, WALL_REPEAT_Y);
    });
  }, [textures]);

  return (
    <mesh position={position} rotation={rotation} receiveShadow>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial {...textures} color='#0d0d1a' roughness={0.9} />
    </mesh>
  );
});
WallMesh.displayName = 'WallMesh';

/**
 * PBRテクスチャ付きの天井メッシュ
 * 壁テクスチャのnormalMap・roughnessMapを流用して凹凸感を付与
 */
const CeilingMesh = memo<{
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
}>(function CeilingMesh({ roomWidth, roomDepth, roomHeight }) {
  const textures = useTexture({
    normalMap: '/textures/theater/wall_normal.jpg',
    roughnessMap: '/textures/theater/wall_roughness.jpg',
  });

  useMemo(() => {
    Object.values(textures).forEach((tex) => {
      tex.wrapS = RepeatWrapping;
      tex.wrapT = RepeatWrapping;
      tex.repeat.set(CEILING_REPEAT_X, CEILING_REPEAT_Y);
    });
  }, [textures]);

  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, roomHeight, 0]}>
      <planeGeometry args={[roomWidth, roomDepth]} />
      <meshStandardMaterial
        {...textures}
        color='#0a0a14'
        roughness={0.98}
        metalness={0.05}
      />
    </mesh>
  );
});
CeilingMesh.displayName = 'CeilingMesh';

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

      {/* 距離フォグ: 奥行きの空気感を演出 */}
      <fog attach='fog' args={['#050510', roomDepth * 0.6, roomDepth * 1.8]} />

      {/* ライティング */}
      <ambientLight intensity={0.15} color='#ffd4a0' />
      <directionalLight
        position={[0, roomHeight, 0]}
        intensity={0.3}
        color='#fff5e6'
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-roomWidth / 2}
        shadow-camera-right={roomWidth / 2}
        shadow-camera-top={roomDepth / 2}
        shadow-camera-bottom={-roomDepth / 2}
        shadow-camera-near={0.1}
        shadow-camera-far={roomHeight + 5}
        shadow-bias={-0.002}
      />
      <pointLight
        position={[0, 3, halfDepth - 1]}
        intensity={0.8}
        color='#b0c0e8'
        distance={roomDepth}
        decay={2}
      />
      <spotLight
        position={[0, roomHeight - 0.5, 0]}
        angle={Math.PI / 3}
        penumbra={0.8}
        intensity={0.4}
        color='#ffe8cc'
        distance={roomHeight * 2}
        decay={2}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
      />
      <pointLight
        position={[-halfWidth + 0.5, 2, 0]}
        intensity={0.15}
        color='#ff9966'
        distance={8}
        decay={2}
      />
      <pointLight
        position={[halfWidth - 0.5, 2, 0]}
        intensity={0.15}
        color='#ff9966'
        distance={8}
        decay={2}
      />

      {/* 床・壁（PBRテクスチャ、Suspenseで個別にラップ） */}
      <Suspense
        fallback={
          <>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0, 0]}
              receiveShadow
            >
              <planeGeometry args={[roomWidth, roomDepth]} />
              <meshStandardMaterial color='#1a1a2e' />
            </mesh>
            <mesh position={[0, roomHeight / 2, -halfDepth]}>
              <planeGeometry args={[roomWidth, roomHeight]} />
              <meshStandardMaterial color='#0d0d1a' />
            </mesh>
            <mesh
              rotation={[0, Math.PI / 2, 0]}
              position={[-halfWidth, roomHeight / 2, 0]}
            >
              <planeGeometry args={[roomDepth, roomHeight]} />
              <meshStandardMaterial color='#0d0d1a' />
            </mesh>
            <mesh
              rotation={[0, -Math.PI / 2, 0]}
              position={[halfWidth, roomHeight / 2, 0]}
            >
              <planeGeometry args={[roomDepth, roomHeight]} />
              <meshStandardMaterial color='#0d0d1a' />
            </mesh>
            {/* 後方壁フォールバック */}
            <mesh
              rotation={[0, Math.PI, 0]}
              position={[0, roomHeight / 2, halfDepth]}
            >
              <planeGeometry args={[roomWidth, roomHeight]} />
              <meshStandardMaterial color='#0d0d1a' />
            </mesh>
            {/* 天井フォールバック */}
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, roomHeight, 0]}>
              <planeGeometry args={[roomWidth, roomDepth]} />
              <meshStandardMaterial color='#0a0a14' />
            </mesh>
          </>
        }
      >
        <FloorMesh roomWidth={roomWidth} roomDepth={roomDepth} />
        <WallMesh
          width={roomWidth}
          height={roomHeight}
          position={[0, roomHeight / 2, -halfDepth]}
        />
        <WallMesh
          width={roomDepth}
          height={roomHeight}
          position={[-halfWidth, roomHeight / 2, 0]}
          rotation={[0, Math.PI / 2, 0]}
        />
        <WallMesh
          width={roomDepth}
          height={roomHeight}
          position={[halfWidth, roomHeight / 2, 0]}
          rotation={[0, -Math.PI / 2, 0]}
        />
        {/* 後方壁 */}
        <WallMesh
          width={roomWidth}
          height={roomHeight}
          position={[0, roomHeight / 2, halfDepth]}
          rotation={[0, Math.PI, 0]}
        />
        {/* 天井（壁テクスチャ流用で凹凸感付与） */}
        <CeilingMesh
          roomWidth={roomWidth}
          roomDepth={roomDepth}
          roomHeight={roomHeight}
        />
      </Suspense>

      {/* ContactShadows: 床面への接地影 */}
      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.6}
        scale={Math.max(roomWidth, roomDepth)}
        blur={2}
        far={roomHeight}
        resolution={512}
        color='#000000'
      />

      {children}
    </>
  );
});

TheaterScene.displayName = 'TheaterScene';
