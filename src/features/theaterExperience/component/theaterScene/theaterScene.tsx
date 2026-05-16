/**
 * TheaterSceneコンポーネント
 * 劇場3Dシーンの配置（ライト・カメラ・床・壁）
 * アイソメトリック ドールハウススタイル: フラットマテリアル + エッジ強調
 */

'use client';

import { memo, useMemo, useRef, useEffect } from 'react';
import {
  OrthographicCamera,
  PerspectiveCamera,
  Edges,
} from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import {
  PlaneGeometry,
  Vector3,
  type OrthographicCamera as OrthographicCameraType,
  type PerspectiveCamera as PerspectiveCameraType,
} from 'three';

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
}>(function WallMesh({
  width,
  height,
  position,
  rotation,
  color = COLOR_WALL,
}) {
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

/** 着座時の目の高さ（座席Y座標からのオフセット） */
const SEATED_EYE_HEIGHT = 1.2;

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

/**
 * 一人称カメラ（選択座席の目線位置）
 * 座席が変わるたびに位置と注視点を更新し、OrbitControlsで自由視点許可
 */
const FirstPersonCameraRig = memo<{
  selectedSeat: TheaterSeat;
  theater: Theater;
}>(function FirstPersonCameraRig({ selectedSeat, theater }) {
  const cameraRef = useRef<PerspectiveCameraType | null>(null);
  const set = useThree((state) => state.set);

  /**
   * 注視点: 座席の真正面・水平方向。
   * 実際の映画館では観客は水平に前を向いて座り、スクリーンは結果として視野の
   * 上方に現れる。スクリーン中心を直接 lookAt すると首が上下左右に回って
   * しまうため、顔は座席のX位置・目の高さで真正面（+Z）を向く。
   *
   * 左右の見え方について:
   * Three.js は +Z方向を向くカメラで世界の +X 軸を画面左に投影する。本アプリの
   * 座標系は +X = 観客から見て右なので、座席X座標をそのまま使うと端席で左右が
   * 反転する（A1=左端の人がスクリーンを画面左に見るなど）。これを補正する
   * ため、カメラ位置と注視点のX座標を鏡像位置（-x）に置く。シーン上の
   * オブジェクト（座席・スピーカー等）は実位置のまま描画され、観客視点と
   * 一致する見え方になる。距離・視野占有率の数値は元の position_x から計算
   * されるため、表示は正確なまま。
   */
  const seatPos = useMemo<[number, number, number]>(
    () => [
      -Number(selectedSeat.position_x),
      Number(selectedSeat.position_y) + SEATED_EYE_HEIGHT,
      Number(selectedSeat.position_z),
    ],
    [selectedSeat.position_x, selectedSeat.position_y, selectedSeat.position_z],
  );
  /**
   * 注視点の決め方:
   *
   * - X: 端席で「真正面のみ」だと視野の中心からスクリーンが外れ続けてしまい、
   *   逆に「スクリーン中心を直接 lookAt」すると首が大きく回り過ぎて不自然。
   *   実際の映画館では端席の観客も頭を少し傾けてスクリーンを視野内に収める
   *   ため、両者の中間として「カメラX とスクリーン中心X の中点」を注視点
   *   とする（α=0.5）。
   *
   * - Y: スクリーン中心の高さに合わせる。スクリーン全体（上端から下端まで）
   *   が視野の中央に収まるようにすることで「上半分が見えない」状態を回避。
   *   現実の映画館でも、観客は椅子のリクライン姿勢で自然にスクリーン中心
   *   付近に視線を向けている。
   *
   * - Z: スクリーン平面のZに固定。
   */
  const target = useMemo<[number, number, number]>(() => {
    const seatX = Number(selectedSeat.position_x);
    const screenX = Number(theater.screen_center_x);
    const midX = (seatX + screenX) / 2;
    return [
      -midX, // ミラー反転（カメラ位置と同じ補正）
      Number(theater.screen_center_y),
      Number(theater.screen_center_z),
    ];
  }, [
    selectedSeat.position_x,
    theater.screen_center_x,
    theater.screen_center_y,
    theater.screen_center_z,
  ]);

  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.position.set(seatPos[0], seatPos[1], seatPos[2]);
      cameraRef.current.lookAt(new Vector3(target[0], target[1], target[2]));
      cameraRef.current.updateProjectionMatrix();
      set({ camera: cameraRef.current });
    }
  }, [seatPos, target, set]);

  return (
    <>
      {/*
        FOV 85° (垂直): 16:9 で水平 ~116°。人間の視野の周辺認識ぎりぎりの
        広角でスクリーン+周囲（壁・天井・床）が同時に視野に入る。
        OrbitControls は使わず、座席ごとにカメラ位置と注視点を固定する。
        座席を変えるとカメラがその座席の視点に瞬時に切り替わる。
      */}
      <PerspectiveCamera
        ref={cameraRef}
        makeDefault
        position={seatPos}
        fov={85}
        near={0.05}
        far={100}
      />
    </>
  );
});
FirstPersonCameraRig.displayName = 'FirstPersonCameraRig';

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
      {/* 座席選択時は一人称、未選択時は等角投影 */}
      {selectedSeat ? (
        <FirstPersonCameraRig selectedSeat={selectedSeat} theater={theater} />
      ) : (
        <IsometricCameraRig
          roomWidth={roomWidth}
          roomDepth={roomDepth}
          roomHeight={roomHeight}
        />
      )}

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
