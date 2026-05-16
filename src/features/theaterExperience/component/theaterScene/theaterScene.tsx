/**
 * TheaterSceneコンポーネント
 * 劇場3Dシーンの配置（ライト・カメラ・床・壁）
 * アイソメトリック ドールハウススタイル: フラットマテリアル + エッジ強調
 */

'use client';

import { memo, useMemo, useRef, useEffect } from 'react';
import { OrthographicCamera, Edges } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { PlaneGeometry, type OrthographicCamera as OrthographicCameraType } from 'three';

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

/** ドールハウスパレット */
const COLOR_FLOOR = '#e8e0d4';
const COLOR_WALL = '#d4cfc4';
const COLOR_CEILING = '#b8b3a8';
const COLOR_SLOPE = '#a8a092';
const COLOR_EDGE = '#5a5247';

/** 座席エリア最後列の最大高さ (m) */
const SLOPE_MAX_HEIGHT = 3.13;

/**
 * フラットな床メッシュ（ドールハウス基盤）
 */
const FloorMesh = memo<{ roomWidth: number; roomDepth: number }>(
  function FloorMesh({ roomWidth, roomDepth }) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[roomWidth, roomDepth]} />
        <meshLambertMaterial color={COLOR_FLOOR} />
      </mesh>
    );
  },
);
FloorMesh.displayName = 'FloorMesh';

/**
 * フラットな壁メッシュ
 */
const WallMesh = memo<{
  width: number;
  height: number;
  position: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
}>(function WallMesh({ width, height, position, rotation, color = COLOR_WALL }) {
  return (
    <mesh position={position} rotation={rotation} receiveShadow>
      <planeGeometry args={[width, height]} />
      <meshLambertMaterial color={color} />
    </mesh>
  );
});
WallMesh.displayName = 'WallMesh';

/**
 * フラットな天井メッシュ
 */
const CeilingMesh = memo<{
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
}>(function CeilingMesh({ roomWidth, roomDepth, roomHeight }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, roomHeight, 0]}>
      <planeGeometry args={[roomWidth, roomDepth]} />
      <meshLambertMaterial color={COLOR_CEILING} />
    </mesh>
  );
});
CeilingMesh.displayName = 'CeilingMesh';

/**
 * 部屋の外形ボックス（エッジ線でドールハウス感を強調）
 */
const RoomEdgesBox = memo<{
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
}>(function RoomEdgesBox({ roomWidth, roomDepth, roomHeight }) {
  return (
    <mesh position={[0, roomHeight / 2, 0]} visible={false}>
      <boxGeometry args={[roomWidth, roomHeight, roomDepth]} />
      <Edges color={COLOR_EDGE} lineWidth={1.5} />
    </mesh>
  );
});
RoomEdgesBox.displayName = 'RoomEdgesBox';

/**
 * 傾斜床メッシュ（座席エリア）
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
      const localY = posAttr.getY(i);
      const t = (localY + depth / 2) / depth;
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
      <meshLambertMaterial color={COLOR_SLOPE} />
    </mesh>
  );
});
SlopedFloorMesh.displayName = 'SlopedFloorMesh';

/**
 * 等角投影カメラ + lookAt 原点向き
 * drei の OrthographicCamera は lookAt プロパティを取らないため
 * ref 経由で手動で向きを設定する
 */
const IsometricCameraRig = memo<{
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
}>(function IsometricCameraRig({ roomWidth, roomDepth, roomHeight }) {
  const cameraRef = useRef<OrthographicCameraType | null>(null);
  const set = useThree((state) => state.set);
  const camDistance = Math.max(roomWidth, roomDepth) * 1.2;
  const target = useMemo<[number, number, number]>(
    () => [0, roomHeight / 2, 0],
    [roomHeight],
  );

  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.lookAt(target[0], target[1], target[2]);
      cameraRef.current.updateProjectionMatrix();
      set({ camera: cameraRef.current });
    }
  }, [target, set]);

  return (
    <OrthographicCamera
      ref={cameraRef}
      makeDefault
      position={[camDistance, camDistance, camDistance]}
      zoom={28}
      near={0.1}
      far={200}
    />
  );
});
IsometricCameraRig.displayName = 'IsometricCameraRig';

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
      <IsometricCameraRig
        roomWidth={roomWidth}
        roomDepth={roomDepth}
        roomHeight={roomHeight}
      />

      {/* フラットライティング */}
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[10, 20, 5]}
        intensity={0.6}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-roomWidth / 2}
        shadow-camera-right={roomWidth / 2}
        shadow-camera-top={roomDepth / 2}
        shadow-camera-bottom={-roomDepth / 2}
        shadow-camera-near={0.1}
        shadow-camera-far={roomHeight + 30}
        shadow-bias={-0.002}
      />

      {/* 床 */}
      <FloorMesh roomWidth={roomWidth} roomDepth={roomDepth} />

      {/* 壁（4面）— 天井とスクリーン側壁は省略してドールハウスの中身が見えるように */}
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
      {/* スクリーン側壁（暗色でスクリーンを引き立てる） */}
      <WallMesh
        width={roomWidth}
        height={roomHeight}
        position={[0, roomHeight / 2, halfDepth]}
        rotation={[0, Math.PI, 0]}
        color='#3a3530'
      />

      {/* 天井（ドールハウスとしては開けておいても良いが、雰囲気維持で残す） */}
      <CeilingMesh
        roomWidth={roomWidth}
        roomDepth={roomDepth}
        roomHeight={roomHeight}
      />

      {/* 部屋外形のエッジ線 */}
      <RoomEdgesBox
        roomWidth={roomWidth}
        roomDepth={roomDepth}
        roomHeight={roomHeight}
      />

      {/* 傾斜床（座席エリア） */}
      <SlopedFloorMesh
        roomWidth={roomWidth}
        frontZ={halfDepth - 4}
        backZ={-halfDepth + 11}
      />

      {children}
    </>
  );
});

TheaterScene.displayName = 'TheaterScene';
