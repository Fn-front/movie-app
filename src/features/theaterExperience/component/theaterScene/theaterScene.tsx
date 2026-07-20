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
  AdditiveBlending,
  type OrthographicCamera as OrthographicCameraType,
  type PerspectiveCamera as PerspectiveCameraType,
} from 'three';

import type { TheaterSeat, Theater } from '../../types';
import {
  calcDistanceToScreen,
  calcYawClampedTargetX,
} from '../../utils/fieldOfView';
import {
  calcOverviewZoom,
  interpolateFloorHeight,
} from '../../utils/theaterGeometry';
import type { SeatXSegment } from '../../utils/theaterGeometry';

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
  /** 座席エリアの前端Z（最前列のZ位置）— 傾斜床の起点 */
  seatAreaFrontZ: number;
  /** 座席エリアの後端Z（最後列のZ位置）— 傾斜床の終点 */
  seatAreaBackZ: number;
  /** 座席エリア最後列のY高さ — 傾斜床の最大高さ */
  seatAreaMaxY: number;
  /** 各列のZ位置（前列から後列の順） — 段差LED配置用 */
  rowZs: number[];
  /** 各列のY位置（前列から後列の順） — 段差LED配置用 */
  rowYs: number[];
  /** 座席ブロックのxセグメント（縦通路で分割） — 段差LEDをブロック単位に分割配置する */
  seatSegments: SeatXSegment[];
  /** 子要素（座席、スクリーン、ヒートマップ等） */
  children: React.ReactNode;
}

/**
 * シネマカラーパレット（暗色基調）
 * 実映画館では「暗さに目を慣らさせる」目的で内装全体を暗色にしている。
 * ドールハウスのフラット感は維持しつつ、シネマ風の暗色に振る。
 */
const COLOR_FLOOR = '#1f1820'; // 通路の濃色カーペット
const COLOR_WALL = '#6a5d68'; // 暗い壁（やや暖かみのあるトーン）
const COLOR_CEILING = '#252028'; // 暗い天井（投影光反射防止）
const COLOR_SLOPE = '#2e1f2c'; // 座席エリアの暗色カーペット（やや深め）
const COLOR_SCREEN_WALL = '#2d2540'; // スクリーン側壁（深紫でシネマ感）
const COLOR_PROSCENIUM = '#1a1322'; // ステージ前縁の暗色バンド
const COLOR_EDGE = '#b0a0a8'; // 暗色背景に対する明色エッジ線

/** アクセント設備カラー */
const COLOR_AISLE_LIGHT = '#ffd4a0'; // 通路灯（暖色）
const COLOR_EXIT_SIGN = '#00b06b'; // 非常口誘導灯（日本の法定色：緑）
const COLOR_STEP_LED = '#ffe8c4'; // 段差LED（やや暖白）

/** マージン: 傾斜床は座席より少し外側まで広げる */
const SLOPE_MARGIN = 0.5;

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
 * 各列の実Z/Y(rowZs/rowYs)を線形補間して床高を決めるため、床が必ず座席の
 * 足元を通り座席が浮かない。座席の傾斜曲線(t^1.3)や横通路のZシフトにも自動追従する。
 */
const SlopedFloorMesh = memo<{
  roomWidth: number;
  frontZ: number;
  backZ: number;
  rowZs: number[];
  rowYs: number[];
}>(function SlopedFloorMesh({ roomWidth, frontZ, backZ, rowZs, rowYs }) {
  const geometry = useMemo(() => {
    const depth = frontZ - backZ;
    const segments = Math.max(10, rowZs.length * 2);
    const geo = new PlaneGeometry(roomWidth, depth, 1, segments);
    const posAttr = geo.attributes.position;

    for (let i = 0; i < posAttr.count; i++) {
      const localY = posAttr.getY(i);
      const t = (localY + depth / 2) / depth;
      // t=0(前/低) → frontZ、t=1(後/高) → backZ
      const worldZ = frontZ - t * depth;
      posAttr.setZ(i, interpolateFloorHeight(worldZ, rowZs, rowYs));
    }

    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [roomWidth, frontZ, backZ, rowZs, rowYs]);

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
 * 座席エリア後端と後壁の隙間を埋める「最上段の水平床」と「縦壁」
 * 傾斜床の最後端は床より maxHeight だけ高い位置にあるため、
 * 何もしないと床との縦の段差が空中に現れる。実映画館では最後列の後ろに
 * 最上段通路 + バックステップ壁があり、これでスタジアム客席の輪郭が完成する。
 */
const BackStepFill = memo<{
  roomWidth: number;
  roomDepth: number;
  slopeBackZ: number;
  maxHeight: number;
}>(function BackStepFill({ roomWidth, roomDepth, slopeBackZ, maxHeight }) {
  const halfDepth = roomDepth / 2;
  const backWallZ = -halfDepth;
  const topFloorDepth = slopeBackZ - backWallZ;
  if (topFloorDepth <= 0) return null;
  const topFloorCenterZ = (slopeBackZ + backWallZ) / 2;

  return (
    <group>
      {/* 縦の段差壁: slopeBackZ の位置で床から maxHeight まで立ち上がる */}
      <mesh position={[0, maxHeight / 2, slopeBackZ]} receiveShadow>
        <planeGeometry args={[roomWidth, maxHeight]} />
        <meshLambertMaterial color={COLOR_SLOPE} />
      </mesh>
      {/* 最上段の水平床（バック通路） */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, maxHeight, topFloorCenterZ]}
        receiveShadow
      >
        <planeGeometry args={[roomWidth, topFloorDepth]} />
        <meshLambertMaterial color={COLOR_SLOPE} />
      </mesh>
    </group>
  );
});
BackStepFill.displayName = 'BackStepFill';

/**
 * 通路灯（壁際・足元の小さな発光体）
 * 両側通路に等間隔で配置。旧実装は半径0.22m+グロー0.5mの大きな発光球で「浮いた
 * 金色の玉」に見え、しかもグローが加算合成でなく暗環（黒い縁取り）になっていた。
 * 足元(y≈0.15)の小型発光体＋加算合成の淡いグローに変更し、足元灯らしくする。
 */
const AisleLights = memo<{
  roomWidth: number;
  seatAreaFrontZ: number;
  seatAreaBackZ: number;
}>(function AisleLights({ roomWidth, seatAreaFrontZ, seatAreaBackZ }) {
  const halfWidth = roomWidth / 2;
  // 壁から内側 0.2m に配置、左右両側
  const wallOffset = 0.2;
  // 座席エリアの前後方向に等間隔で配置（2m間隔）
  const lights = useMemo(() => {
    const positions: [number, number, number][] = [];
    const length = seatAreaFrontZ - seatAreaBackZ;
    const count = Math.max(3, Math.floor(length / 2));
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const z = seatAreaFrontZ - t * length;
      // 足元(床際)に配置
      positions.push([-(halfWidth - wallOffset), 0.15, z]);
      positions.push([halfWidth - wallOffset, 0.15, z]);
    }
    return positions;
  }, [halfWidth, seatAreaFrontZ, seatAreaBackZ]);

  return (
    <group>
      {lights.map((pos) => (
        <group key={`${pos[0]},${pos[2]}`} position={pos}>
          {/* 足元の小さな発光体 */}
          <mesh>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshBasicMaterial color={COLOR_AISLE_LIGHT} toneMapped={false} />
          </mesh>
          {/* 加算合成の淡いグロー（暗環にならず自然に滲む） */}
          <mesh>
            <sphereGeometry args={[0.22, 12, 12]} />
            <meshBasicMaterial
              color={COLOR_AISLE_LIGHT}
              transparent
              opacity={0.35}
              blending={AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
});
AisleLights.displayName = 'AisleLights';

/**
 * 非常口誘導灯（後壁・両側の緑の発光板）
 * 傾斜のあるスタジアム席では最後列座席が高くせり上がるため、旧実装の固定
 * signY(2.8m) だと座席に埋没した。座席群の最大高さ(seatAreaMaxY)より上、かつ
 * 天井直下に退避させ、どのタイプでも座席と交差しないようにする。
 */
const ExitSigns = memo<{
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
  seatAreaMaxY: number;
}>(function ExitSigns({ roomWidth, roomDepth, roomHeight, seatAreaMaxY }) {
  const halfWidth = roomWidth / 2;
  const halfDepth = roomDepth / 2;
  const signDepth = 0.08;
  const signWidth = 1.2;
  const signHeight = 0.5;
  // 座席群より上（+0.6m）かつ天井直下（roomHeight-0.6m）に配置し、座席に埋没させない
  const signY = Math.max(seatAreaMaxY + 0.6, roomHeight - 0.6);
  // 後壁の両端（後壁から内側 0.05m）に配置
  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * (halfWidth * 0.7), signY, -halfDepth + signDepth]}
        >
          <boxGeometry args={[signWidth, signHeight, signDepth]} />
          <meshBasicMaterial color={COLOR_EXIT_SIGN} toneMapped={false} />
          <Edges color='#00301a' lineWidth={1} />
        </mesh>
      ))}
    </group>
  );
});
ExitSigns.displayName = 'ExitSigns';

/**
 * 段差LED（各列の段鼻に細い光帯）
 * スタジアム傾斜の段差を明示し、安全性と雰囲気を両立。
 *
 * 座席ブロック（縦通路で分割）ごとに分割配置し、全幅1本の光線が座席を貫通して
 * 通路の暗部まで伸びるのを防ぐ。輝度は toneMapped を有効化して周囲に馴染ませる
 * （旧実装の toneMapped=false による全開発光を廃止）。
 */
const StepLEDs = memo<{
  rowZs: number[];
  rowYs: number[];
  seatSegments: SeatXSegment[];
}>(function StepLEDs({ rowZs, rowYs, seatSegments }) {
  // 通常の列間隔（最小の正の間隔）を基準に、これを大きく超えるペア（横通路）は
  // 段差ではないためLEDを描かない（通路中央に宙浮きのLEDが出るのを防ぐ）
  const normalGap = useMemo(() => {
    let min = Infinity;
    for (let i = 1; i < rowZs.length; i++) {
      const g = Math.abs(rowZs[i - 1] - rowZs[i]);
      if (g > 0.01 && g < min) min = g;
    }
    return Number.isFinite(min) ? min : 1;
  }, [rowZs]);

  return (
    <group>
      {rowZs.map((z, i) => {
        if (i === 0) return null; // A列は段差なし
        const gap = Math.abs((rowZs[i - 1] ?? z) - z);
        if (gap > normalGap * 1.5) return null; // 横通路（段差でない）はスキップ
        // 段の中央高さ・中央Zに、各座席ブロックの幅で光帯を配置
        const prevY = rowYs[i - 1] ?? 0;
        const ledY = (rowYs[i] + prevY) / 2;
        const ledZ = (z + (rowZs[i - 1] ?? z)) / 2;
        return seatSegments.map((seg) => (
          <mesh key={`${z}:${seg.center}`} position={[seg.center, ledY, ledZ]}>
            <boxGeometry args={[seg.width, 0.04, 0.04]} />
            <meshBasicMaterial color={COLOR_STEP_LED} />
          </mesh>
        ));
      })}
    </group>
  );
});
StepLEDs.displayName = 'StepLEDs';

/** 着座時の目の高さ（座席Y座標からのオフセット） */
const SEATED_EYE_HEIGHT = 1.2;

/**
 * 一人称視点の水平首振り角の上限（度）。端席でスクリーン中心を直接向くと首を
 * 回し過ぎるため、この角度で頭打ちにする（超過分はスクリーンが視野の端に寄る）。
 */
const MAX_YAW_DEG = 20;
const MAX_YAW_RAD = (MAX_YAW_DEG * Math.PI) / 180;

/**
 * 首を振り始めない不感帯（度）。スクリーン中心がこの角度以内なら真正面のまま
 * （中央〜中央寄りの席は頭を動かさず、目・周辺視でスクリーンを捉える）。
 */
const YAW_DEADZONE_DEG = 15;
const YAW_DEADZONE_RAD = (YAW_DEADZONE_DEG * Math.PI) / 180;

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
  // 部屋サイズに応じて等角カメラのズームを調整（大型ルームでも全体が収まる）
  const zoom = calcOverviewZoom(roomWidth, roomDepth, roomHeight);
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
      zoom={zoom}
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
   * - X（水平の首振り）: 中央〜中央寄りの席は首を振らず真正面（スクリーン中心が
   *   不感帯 YAW_DEADZONE_DEG 以内）。それを超えた分だけスクリーン中心方向へ首を
   *   振り、上限角 MAX_YAW_DEG で頭打ちにする（超過分はスクリーンが視野の端に寄る）。
   *   旧実装は「座席Xとスクリーン中心Xの中点」(α=0.5)固定で、中央寄りでも首を振り、
   *   前列端では約36°も振り過剰だった（例: A列端 full 55° → 上限20°で頭打ち）。
   *
   * - Y: 眼の高さ＋1.5m。スクリーン中心(y=4.5)を直接 lookAt すると
   *   前列で33°もの上向きになり「首を反らす」状態になる。実際の映画館では
   *   椅子のリクライン姿勢で 15-20° 程度の自然な上向きなので、注視点を
   *   スクリーン下半分の中央付近（眼+1.5m）に置く。
   *
   * - Z: スクリーン平面のZに固定。
   */
  const target = useMemo<[number, number, number]>(() => {
    const seatX = Number(selectedSeat.position_x);
    const screenX = Number(theater.screen_center_x);
    const seatZ = Number(selectedSeat.position_z);
    const screenZ = Number(theater.screen_center_z);
    const eyeY = Number(selectedSeat.position_y) + SEATED_EYE_HEIGHT;
    // スクリーン中心を向くが、水平首振りは MAX_YAW で頭打ちにする
    const forwardDist = calcDistanceToScreen(seatZ, screenZ);
    const targetX = calcYawClampedTargetX(
      seatX,
      screenX,
      forwardDist,
      MAX_YAW_RAD,
      YAW_DEADZONE_RAD,
    );
    return [
      -targetX, // ミラー反転（カメラ位置と同じ補正）
      eyeY + 1.5,
      screenZ,
    ];
  }, [
    selectedSeat.position_x,
    selectedSeat.position_y,
    selectedSeat.position_z,
    theater.screen_center_x,
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
  seatAreaFrontZ,
  seatAreaBackZ,
  seatAreaMaxY,
  rowZs,
  rowYs,
  seatSegments,
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
      <ambientLight intensity={1.0} />
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
      {/* スクリーン側壁（深紫でスクリーンを引き立てる） */}
      <WallMesh
        width={roomWidth}
        height={roomHeight}
        position={[0, roomHeight / 2, halfDepth]}
        rotation={[0, Math.PI, 0]}
        color={COLOR_SCREEN_WALL}
      />

      {/* ステージ前縁バンド（スクリーン下の細い装飾帯でシアター感を強調） */}
      <mesh position={[0, 0.15, halfDepth - 0.05]}>
        <boxGeometry args={[roomWidth, 0.3, 0.1]} />
        <meshLambertMaterial color={COLOR_PROSCENIUM} />
      </mesh>

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

      {/* 傾斜床（座席エリア）— 各列の実Z/Yを補間して座席を接地させる */}
      <SlopedFloorMesh
        roomWidth={roomWidth}
        frontZ={seatAreaFrontZ + SLOPE_MARGIN}
        backZ={seatAreaBackZ - SLOPE_MARGIN}
        rowZs={rowZs}
        rowYs={rowYs}
      />

      {/* 傾斜床と後壁の間の段差を埋める（バックステップ壁＋最上段通路） */}
      <BackStepFill
        roomWidth={roomWidth}
        roomDepth={roomDepth}
        slopeBackZ={seatAreaBackZ - SLOPE_MARGIN}
        maxHeight={seatAreaMaxY}
      />

      {/* 通路灯（両側壁際の暖色発光体） */}
      <AisleLights
        roomWidth={roomWidth}
        seatAreaFrontZ={seatAreaFrontZ}
        seatAreaBackZ={seatAreaBackZ}
      />

      {/* 非常口誘導灯（後壁両端の緑の発光板・座席上に退避） */}
      <ExitSigns
        roomWidth={roomWidth}
        roomDepth={roomDepth}
        roomHeight={roomHeight}
        seatAreaMaxY={seatAreaMaxY}
      />

      {/* 段差LED（各列の段鼻を座席ブロック単位で明示する細い光帯） */}
      <StepLEDs rowZs={rowZs} rowYs={rowYs} seatSegments={seatSegments} />

      {children}
    </>
  );
});

TheaterScene.displayName = 'TheaterScene';
