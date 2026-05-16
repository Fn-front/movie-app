/**
 * TheaterSceneコンポーネント
 * 劇場3Dシーンの配置（ライト・カメラコントロール・床・壁）
 * PBRテクスチャ・改善ライティングで映画館の雰囲気を演出
 */

'use client';

import { Suspense, memo, useRef, useEffect, useMemo } from 'react';
import { OrbitControls, useTexture, ContactShadows } from '@react-three/drei';
import { useThree, useFrame } from '@react-three/fiber';
import {
  Vector3,
  RepeatWrapping,
  Object3D,
  PlaneGeometry,
  MathUtils,
  type InstancedMesh as InstancedMeshType,
} from 'three';
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

/** 俯瞰カメラの注視点 */
const OVERVIEW_TARGET = new Vector3(0, 1, 0);

/** カメラ補間の速度 (0~1、1に近いほど速い) */
const LERP_SPEED = 3;

/** 着座時の目の高さ（座席Y座標からのオフセット） */
const SEATED_EYE_HEIGHT = 1.2;

/** 壁面からカメラ位置のバッファ (m) */
const ROOM_BOUNDARY_PADDING = 0.5;
/** カメラY座標の最低高さ (m) */
const CAMERA_MIN_Y = 0.5;

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

  // 部屋内の俯瞰位置: 天井近く・後壁近くから見下ろす
  const overviewPosition = useMemo(
    () =>
      new Vector3(
        0,
        theater.room_height - ROOM_BOUNDARY_PADDING,
        -(theater.room_depth / 2 - ROOM_BOUNDARY_PADDING),
      ),
    [theater.room_height, theater.room_depth],
  );

  const targetPos = useRef(overviewPosition.clone());
  const targetLookAt = useRef(OVERVIEW_TARGET.clone());

  useEffect(() => {
    if (selectedSeat) {
      // 座席視点: 着座目線（firstPersonPreview と統一）
      targetPos.current.set(
        selectedSeat.position_x,
        selectedSeat.position_y + SEATED_EYE_HEIGHT,
        selectedSeat.position_z,
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
      targetPos.current.copy(overviewPosition);
      targetLookAt.current.copy(OVERVIEW_TARGET);
    }
  }, [selectedSeat, theater, overviewPosition]);

  const isAnimating = useRef(false);

  useEffect(() => {
    isAnimating.current = true;
    if (controlsRef.current) {
      controlsRef.current.enabled = false;
    }
  }, [selectedSeat]);

  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;

    // --- アニメーション処理 ---
    if (isAnimating.current) {
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
    }

    // --- 境界クランプ（毎フレーム実行） ---
    const pad = ROOM_BOUNDARY_PADDING;
    const halfW = theater.room_width / 2 - pad;
    const halfD = theater.room_depth / 2 - pad;
    const maxY = theater.room_height - pad;

    camera.position.x = MathUtils.clamp(camera.position.x, -halfW, halfW);
    camera.position.y = MathUtils.clamp(camera.position.y, CAMERA_MIN_Y, maxY);
    camera.position.z = MathUtils.clamp(camera.position.z, -halfD, halfD);

    controls.target.x = MathUtils.clamp(controls.target.x, -halfW, halfW);
    controls.target.y = MathUtils.clamp(controls.target.y, CAMERA_MIN_Y, maxY);
    controls.target.z = MathUtils.clamp(controls.target.z, -halfD, halfD);

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
  color?: string;
}>(function WallMesh({ width, height, position, rotation, color = '#2a2a45' }) {
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
      <meshStandardMaterial
        {...textures}
        color={color}
        roughness={0.9}
        emissive='#0a0a14'
        emissiveIntensity={0.3}
      />
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
        color='#222238'
        roughness={0.98}
        metalness={0.05}
        emissive='#080810'
        emissiveIntensity={0.2}
      />
    </mesh>
  );
});
CeilingMesh.displayName = 'CeilingMesh';

/** 通路足元灯の数（片側） */
const AISLE_LIGHTS_PER_SIDE = 10;
/** 通路足元灯の総数 */
const AISLE_LIGHTS_TOTAL = AISLE_LIGHTS_PER_SIDE * 2;

/**
 * 通路足元灯コンポーネント
 * 座席エリアの両サイドに小さな発光メッシュを等間隔配置
 */
const AisleLights = memo<{
  roomWidth: number;
  frontZ: number;
  backZ: number;
}>(function AisleLights({ roomWidth, frontZ, backZ }) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (!meshRef.current) return;

    const aisleX = roomWidth / 2 - 1.5;
    const zRange = frontZ - backZ;
    let index = 0;

    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? -aisleX : aisleX;
      for (let i = 0; i < AISLE_LIGHTS_PER_SIDE; i++) {
        const z = backZ + (zRange * i) / (AISLE_LIGHTS_PER_SIDE - 1);
        tempObject.position.set(x, 0.01, z);
        tempObject.updateMatrix();
        meshRef.current!.setMatrixAt(index, tempObject.matrix);
        index++;
      }
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [roomWidth, frontZ, backZ, tempObject]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, AISLE_LIGHTS_TOTAL]}
      frustumCulled={false}
    >
      <boxGeometry args={[0.12, 0.02, 0.12]} />
      <meshStandardMaterial
        color='#ffa040'
        emissive='#ff8020'
        emissiveIntensity={3.0}
      />
    </instancedMesh>
  );
});
AisleLights.displayName = 'AisleLights';

/**
 * 壁面LEDアクセントラインコンポーネント
 * 左右の壁面に高さ1mで水平に走る細い発光帯
 */
const WallAccentLine = memo<{
  roomWidth: number;
  roomDepth: number;
}>(function WallAccentLine({ roomWidth, roomDepth }) {
  const halfWidth = roomWidth / 2;

  return (
    <>
      {/* 左壁アクセント */}
      <mesh
        position={[-halfWidth + 0.02, 1.0, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <boxGeometry args={[roomDepth, 0.02, 0.01]} />
        <meshStandardMaterial
          color='#4060a0'
          emissive='#3050a0'
          emissiveIntensity={2.5}
        />
      </mesh>
      {/* 右壁アクセント */}
      <mesh
        position={[halfWidth - 0.02, 1.0, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <boxGeometry args={[roomDepth, 0.02, 0.01]} />
        <meshStandardMaterial
          color='#4060a0'
          emissive='#3050a0'
          emissiveIntensity={2.5}
        />
      </mesh>
    </>
  );
});
WallAccentLine.displayName = 'WallAccentLine';

/** 座席エリア最後列の最大高さ (m) — マイグレーションと同期 */
const SLOPE_MAX_HEIGHT = 3.13;

/**
 * 傾斜床メッシュコンポーネント
 * 座席エリアに傾斜する床面を追加（前端Y=0、後端Y=SLOPE_MAX_HEIGHT）
 */
const SlopedFloorMesh = memo<{
  roomWidth: number;
  frontZ: number;
  backZ: number;
}>(function SlopedFloorMesh({ roomWidth, frontZ, backZ }) {
  const geometry = useMemo(() => {
    const depth = frontZ - backZ;
    const geo = new PlaneGeometry(roomWidth, depth, 1, 10);
    const posAttr = geo.attributes.position;

    for (let i = 0; i < posAttr.count; i++) {
      // PlaneGeometry のローカルY（回転前）= 傾斜方向
      // -depth/2(前端) 〜 +depth/2(後端)
      const localY = posAttr.getY(i);
      // 0(前端) 〜 1(後端) に正規化
      const t = (localY + depth / 2) / depth;
      // 2次曲線的に高さを増加（マイグレーションの勾配カーブに近似）
      const heightOffset = SLOPE_MAX_HEIGHT * t * t;
      posAttr.setZ(i, heightOffset);
    }

    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [roomWidth, frontZ, backZ]);

  const centerZ = (frontZ + backZ) / 2;

  return (
    <mesh
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, centerZ]}
      receiveShadow
    >
      <meshStandardMaterial
        color='#1a1a2e'
        roughness={0.95}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
});
SlopedFloorMesh.displayName = 'SlopedFloorMesh';

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
      <fog attach='fog' args={['#050510', roomDepth * 4, roomDepth * 6]} />

      {/* ライティング */}
      <ambientLight intensity={0.15} color='#ffd4a0' />
      <directionalLight
        position={[0, roomHeight, 0]}
        intensity={0.8}
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
        position={[0, 3, halfDepth - 3]}
        intensity={0.1}
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
        intensity={0.6}
        color='#ff9966'
        distance={15}
        decay={1.5}
      />
      <pointLight
        position={[halfWidth - 0.5, 2, 0]}
        intensity={0.6}
        color='#ff9966'
        distance={15}
        decay={1.5}
      />
      {/* 座席エリア照明（スクリーン側から客席を照らす間接光） */}
      <spotLight
        position={[0, roomHeight - 1, halfDepth - 3]}
        target-position={[0, 0, 0]}
        angle={Math.PI / 3}
        penumbra={1.0}
        intensity={0.3}
        color='#d0d8f0'
        distance={roomDepth}
        decay={2}
      />
      {/* 前方壁上部ウォッシュライト（スクリーン周辺を照らす） */}
      <pointLight
        position={[0, roomHeight - 1, halfDepth - 2]}
        intensity={0.05}
        color='#c0c8e0'
        distance={20}
        decay={1.5}
      />
      {/* 後方壁上部ウォッシュライト */}
      <pointLight
        position={[0, roomHeight - 1, -halfDepth + 2]}
        intensity={0.6}
        color='#c0c8e0'
        distance={20}
        decay={1.5}
      />
      {/* 左壁上部ウォッシュライト */}
      <pointLight
        position={[-halfWidth + 1, roomHeight - 1, 0]}
        intensity={0.5}
        color='#c0c8e0'
        distance={20}
        decay={1.5}
      />
      {/* 右壁上部ウォッシュライト */}
      <pointLight
        position={[halfWidth - 1, roomHeight - 1, 0]}
        intensity={0.5}
        color='#c0c8e0'
        distance={20}
        decay={1.5}
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
              <meshStandardMaterial color='#2a2a45' />
            </mesh>
            <mesh
              rotation={[0, Math.PI / 2, 0]}
              position={[-halfWidth, roomHeight / 2, 0]}
            >
              <planeGeometry args={[roomDepth, roomHeight]} />
              <meshStandardMaterial color='#2a2a45' />
            </mesh>
            <mesh
              rotation={[0, -Math.PI / 2, 0]}
              position={[halfWidth, roomHeight / 2, 0]}
            >
              <planeGeometry args={[roomDepth, roomHeight]} />
              <meshStandardMaterial color='#2a2a45' />
            </mesh>
            {/* 後方壁フォールバック */}
            <mesh
              rotation={[0, Math.PI, 0]}
              position={[0, roomHeight / 2, halfDepth]}
            >
              <planeGeometry args={[roomWidth, roomHeight]} />
              <meshStandardMaterial color='#2a2a45' />
            </mesh>
            {/* 天井フォールバック */}
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, roomHeight, 0]}>
              <planeGeometry args={[roomWidth, roomDepth]} />
              <meshStandardMaterial color='#222238' />
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
        {/* スクリーン側壁（映画館のマスキング：非常に暗い色で映像を引き立てる） */}
        <WallMesh
          width={roomWidth}
          height={roomHeight}
          position={[0, roomHeight / 2, halfDepth]}
          rotation={[0, Math.PI, 0]}
          color='#080810'
        />
        {/* 天井（壁テクスチャ流用で凹凸感付与） */}
        <CeilingMesh
          roomWidth={roomWidth}
          roomDepth={roomDepth}
          roomHeight={roomHeight}
        />
      </Suspense>

      {/* 傾斜床（座席エリア） */}
      <SlopedFloorMesh
        roomWidth={roomWidth}
        frontZ={halfDepth - 4}
        backZ={-halfDepth + 11}
      />

      {/* 通路足元灯 */}
      <AisleLights
        roomWidth={roomWidth}
        frontZ={halfDepth - 4}
        backZ={-halfDepth + 11}
      />

      {/* 壁面LEDアクセントライン */}
      <WallAccentLine roomWidth={roomWidth} roomDepth={roomDepth} />

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
