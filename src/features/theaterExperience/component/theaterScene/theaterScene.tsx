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
import { useThree, useFrame } from '@react-three/fiber';
import {
  PlaneGeometry,
  Vector3,
  Color,
  type OrthographicCamera as OrthographicCameraType,
  type PerspectiveCamera as PerspectiveCameraType,
} from 'three';

import type { TheaterSeat, Theater } from '../../types';
import {
  calcDistance3D,
  calcDistanceToScreen,
  calcYawClampedTargetX,
  calcPitchClampedTargetY,
  calcFirstPersonFov,
  easeOutCubic,
  resolveFlythroughStart,
} from '../../utils/fieldOfView';
import {
  calcOverviewZoom,
  calcOverviewCameraPosition,
  interpolateFloorHeight,
} from '../../utils/theaterGeometry';
import type { SeatXSegment } from '../../utils/theaterGeometry';
import { getWallColors } from '../../utils/theaterPalette';

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
  /** prefers-reduced-motion 有効時は true（俯瞰→一人称のフライスルーを即時カットにする） */
  reducedMotion?: boolean;
  /** 子要素（座席、スクリーン、ヒートマップ等） */
  children: React.ReactNode;
}

/**
 * シネマカラーパレット（暗色基調）
 * 実映画館では「暗さに目を慣らさせる」目的で内装全体を暗色にしている。
 * ドールハウスのフラット感は維持しつつ、シネマ風の暗色に振る。
 *
 * 壁・天井・スクリーン側壁の色はフォーマット別に出し分けるため
 * `getWallColors(theater.format)`（utils/theaterPalette）から取得する。
 * 床・傾斜床・装飾帯は素材共通のためここで定数管理する。
 */
const COLOR_FLOOR = '#1f1820'; // 通路の濃色カーペット
const COLOR_SLOPE = '#2e1f2c'; // 座席エリアの暗色カーペット（やや深め）
const COLOR_PROSCENIUM = '#1a1322'; // ステージ前縁の暗色バンド
const COLOR_EDGE = '#b0a0a8'; // 暗色背景に対する明色エッジ線

/** アクセント設備カラー */
const COLOR_AISLE_LIGHT = '#ffd4a0'; // 通路灯（暖色）
const COLOR_EXIT_SIGN = '#00b06b'; // 非常口誘導灯（日本の法定色：緑）
const COLOR_STEP_LED = '#ffe8c4'; // 段差LED（やや暖白）

/**
 * 発光体の HDR カラー（各チャンネルを 1.0 超へ増幅）。
 * Bloom は「明るい背景(#f5f3ee, ACES後≈0.8)は光らせず、発光体だけ滲ませる」ため
 * luminanceThreshold を 0.9 に設定している。LDR(≤1.0)のままだと背景に埋もれて
 * 閾値を超えないため、発光体は toneMapped=false かつ HDR にして確実にブルームさせる。
 */
const COLOR_AISLE_LIGHT_HDR = new Color(COLOR_AISLE_LIGHT).multiplyScalar(2.4);
const COLOR_STEP_LED_HDR = new Color(COLOR_STEP_LED).multiplyScalar(1.6);

/** ライティング用カラー */
const COLOR_HEMI_SKY = '#cfd6e6'; // 半球光の空側フィル（やや寒色）
const COLOR_HEMI_GROUND = '#2a2130'; // 半球光の地面側フィル（暗紫・床トーンに寄せる）

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
  color: string;
}>(function WallMesh({ width, height, position, rotation, color }) {
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
  color: string;
}>(function CeilingMesh({ roomWidth, roomDepth, roomHeight, color }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, roomHeight, 0]}>
      <planeGeometry args={[roomWidth, roomDepth]} />
      <meshLambertMaterial color={color} />
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
 * 両側通路に等間隔で配置。発光体本体（toneMapped=false）のみを描き、滲み（グロー）は
 * ポストプロセスの Bloom に委ねる。#464 で自作していた加算合成グロー球（半透明の大球）は
 * Bloom 導入により不要になったため削除した（暗環化リスクもなくなる）。
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
          {/* 足元の小さな発光体（HDR＋toneMapped=false で Bloom が滲みを付与） */}
          <mesh>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshBasicMaterial
              color={COLOR_AISLE_LIGHT_HDR}
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
            {/* 段差LEDも HDR＋toneMapped=false で Bloom により細く滲ませる（過度な全開発光は避ける控えめ増幅） */}
            <meshBasicMaterial color={COLOR_STEP_LED_HDR} toneMapped={false} />
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
 * 一人称視点の見上げ角の上限（度）。スクリーン中心が高い位置（IMAX等）でも、
 * 首を反らし過ぎない自然なリクライン姿勢の上限。超過分はスクリーンが視野の上方に寄る
 * （高い大画面を「見上げている」実態がそのまま表現される）。
 */
const MAX_PITCH_DEG = 22;
const MAX_PITCH_RAD = (MAX_PITCH_DEG * Math.PI) / 180;

/**
 * 首を上げ始めない不感帯（度）。スクリーン中心の仰角がこの角度以内なら首を上げず、
 * 眼の高さの真正面を向く（僅かな高低差は目・周辺視で捉える）。
 */
const PITCH_DEADZONE_DEG = 6;
const PITCH_DEADZONE_RAD = (PITCH_DEADZONE_DEG * Math.PI) / 180;

/**
 * 俯瞰→一人称のフライスルー時間（秒）。空間の対応付けを助ける短い移動。
 * prefers-reduced-motion 有効時は 0 として即時カットにする（WCAG 2.3.3 配慮）。
 */
const FLYTHROUGH_DURATION_S = 0.55;

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
  // 設置位置は一人称フライスルーの開始点と共有（単一ソース）
  const position = useMemo(
    () => calcOverviewCameraPosition(roomWidth, roomDepth),
    [roomWidth, roomDepth],
  );
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
      position={position}
      zoom={zoom}
      near={0.1}
      far={200}
    />
  );
});
IsometricCameraRig.displayName = 'IsometricCameraRig';

/**
 * 一人称カメラ（選択座席の目線位置）
 * 座席が変わるたびに位置・注視点・FOVを更新し、俯瞰視点から着座点への
 * 短いフライスルー（reduced-motion時は即時）で空間の対応付けを助ける。
 */
const FirstPersonCameraRig = memo<{
  selectedSeat: TheaterSeat;
  theater: Theater;
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
  reducedMotion: boolean;
}>(function FirstPersonCameraRig({
  selectedSeat,
  theater,
  roomWidth,
  roomDepth,
  roomHeight,
  reducedMotion,
}) {
  const cameraRef = useRef<PerspectiveCameraType | null>(null);
  const set = useThree((state) => state.set);

  /**
   * カメラ位置: 座席の目線。
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
   *   不感帯 YAW_DEADZONE_DEG 以内）。超過分だけスクリーン中心方向へ首を振り、
   *   上限角 MAX_YAW_DEG で頭打ちにする。
   * - Y（見上げ）: 旧実装の「眼+1.5m」固定をやめ、実際のスクリーン中心Yに追従する
   *   pitch-clamp に変更。フォーマットでスクリーン中心Yが大きく異なる
   *   （standard 4.35 / IMAX 10.45 等）ため、固定値では特にIMAX前列で見上げが
   *   過小表現された。上限角 MAX_PITCH_DEG で頭打ちにする（首を反らし過ぎない）。
   * - Z: スクリーン平面のZに固定。
   */
  const target = useMemo<[number, number, number]>(() => {
    const seatX = Number(selectedSeat.position_x);
    const screenX = Number(theater.screen_center_x);
    const seatZ = Number(selectedSeat.position_z);
    const screenZ = Number(theater.screen_center_z);
    const screenCenterY = Number(theater.screen_center_y);
    const eyeY = Number(selectedSeat.position_y) + SEATED_EYE_HEIGHT;
    const forwardDist = calcDistanceToScreen(seatZ, screenZ);
    const targetX = calcYawClampedTargetX(
      seatX,
      screenX,
      forwardDist,
      MAX_YAW_RAD,
      YAW_DEADZONE_RAD,
    );
    const targetY = calcPitchClampedTargetY(
      eyeY,
      screenCenterY,
      forwardDist,
      MAX_PITCH_RAD,
      PITCH_DEADZONE_RAD,
    );
    return [
      -targetX, // ミラー反転（カメラ位置と同じ補正）
      targetY,
      screenZ,
    ];
  }, [
    selectedSeat.position_x,
    selectedSeat.position_y,
    selectedSeat.position_z,
    theater.screen_center_x,
    theater.screen_center_y,
    theater.screen_center_z,
  ]);

  /**
   * FOV: スクリーン寸法/フォーマット・席距離に追従して可変（旧実装は 85° 固定）。
   * 眼→スクリーン中心の視聴距離とスクリーン高から、スクリーンが視野の一定割合を
   * 占めるFOVを算出し上下限でクランプする。IMAX等の大画面ほど広く、後列ほど狭くなる。
   */
  const fov = useMemo(() => {
    const eye = {
      x: Number(selectedSeat.position_x),
      y: Number(selectedSeat.position_y) + SEATED_EYE_HEIGHT,
      z: Number(selectedSeat.position_z),
    };
    const screenCenter = {
      x: Number(theater.screen_center_x),
      y: Number(theater.screen_center_y),
      z: Number(theater.screen_center_z),
    };
    const viewingDistance = calcDistance3D(eye, screenCenter);
    return calcFirstPersonFov(viewingDistance, Number(theater.screen_height));
  }, [
    selectedSeat.position_x,
    selectedSeat.position_y,
    selectedSeat.position_z,
    theater.screen_center_x,
    theater.screen_center_y,
    theater.screen_center_z,
    theater.screen_height,
  ]);

  // フライスルー開始点（俯瞰カメラと同じ設置位置・注視点＝俯瞰の見え方から着座へ繋ぐ）
  const overviewPos = useMemo(
    () => calcOverviewCameraPosition(roomWidth, roomDepth),
    [roomWidth, roomDepth],
  );
  const overviewTarget = useMemo<[number, number, number]>(
    () => [0, roomHeight / 2, 0],
    [roomHeight],
  );

  // フライスルーのアニメーション状態（useFrameで進める。R3F描画依存のため単体テスト対象外）
  const anim = useRef({
    elapsed: FLYTHROUGH_DURATION_S,
    from: new Vector3(),
    fromTarget: new Vector3(),
    started: false,
  });
  // 現在の注視点（座席切替時に「今向いている点」から補間を再開するため保持）
  const currentTarget = useRef(new Vector3());

  // 座席選択・切替時にフライスルーを（再）開始する。開始点の決定は
  // resolveFlythroughStart（純ロジック・単体テスト済み）に委譲する。
  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    cam.fov = fov;
    cam.updateProjectionMatrix();

    const start = resolveFlythroughStart({
      started: anim.current.started,
      reducedMotion,
      durationS: FLYTHROUGH_DURATION_S,
      overviewPos,
      overviewTarget,
      currentPos: [cam.position.x, cam.position.y, cam.position.z],
      currentTarget: [
        currentTarget.current.x,
        currentTarget.current.y,
        currentTarget.current.z,
      ],
    });
    anim.current.from.set(start.from[0], start.from[1], start.from[2]);
    anim.current.fromTarget.set(
      start.fromTarget[0],
      start.fromTarget[1],
      start.fromTarget[2],
    );
    anim.current.elapsed = start.elapsed;
    anim.current.started = true;
    set({ camera: cam });
  }, [seatPos, target, fov, overviewPos, overviewTarget, reducedMotion, set]);

  // 毎フレーム、開始点→着座点へ ease-out 補間する（満了後は着座点で静止＝冪等）
  useFrame((_, delta) => {
    const cam = cameraRef.current;
    if (!cam) return;
    const a = anim.current;
    if (a.elapsed < FLYTHROUGH_DURATION_S) {
      a.elapsed = Math.min(a.elapsed + delta, FLYTHROUGH_DURATION_S);
    }
    const t = easeOutCubic(a.elapsed / FLYTHROUGH_DURATION_S);
    cam.position.set(
      a.from.x + (seatPos[0] - a.from.x) * t,
      a.from.y + (seatPos[1] - a.from.y) * t,
      a.from.z + (seatPos[2] - a.from.z) * t,
    );
    currentTarget.current.set(
      a.fromTarget.x + (target[0] - a.fromTarget.x) * t,
      a.fromTarget.y + (target[1] - a.fromTarget.y) * t,
      a.fromTarget.z + (target[2] - a.fromTarget.z) * t,
    );
    cam.lookAt(currentTarget.current);
  });

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      position={overviewPos}
      fov={fov}
      near={0.05}
      far={200}
    />
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
  reducedMotion = false,
  children,
}) {
  const halfWidth = roomWidth / 2;
  const halfDepth = roomDepth / 2;
  // 壁・天井・スクリーン側壁の色をフォーマット別に出し分ける
  const palette = useMemo(
    () => getWallColors(theater.format),
    [theater.format],
  );

  return (
    <>
      {/* 座席選択時は一人称、未選択時は等角投影 */}
      {selectedSeat ? (
        <FirstPersonCameraRig
          selectedSeat={selectedSeat}
          theater={theater}
          roomWidth={roomWidth}
          roomDepth={roomDepth}
          roomHeight={roomHeight}
          reducedMotion={reducedMotion}
        />
      ) : (
        <IsometricCameraRig
          roomWidth={roomWidth}
          roomDepth={roomDepth}
          roomHeight={roomHeight}
        />
      )}

      {/*
        ライティング: 旧実装は ambient=1.0 優位（ambient:directional≈1.67:1）で
        キーライトが形を変調できず全体がフラットだった。ambient を下げ directional を
        上げて比を反転（≈1:2）し、座席・壁に陰影と接地感を出す。hemisphereLight で
        天井側の淡いフィル（sky→ground のグラデ）を加え、暗部が潰れ過ぎないようにする。
      */}
      <ambientLight intensity={0.5} />
      {/* args=[skyColor, groundColor, intensity]（groundColor はコンストラクタ引数で渡す） */}
      <hemisphereLight args={[COLOR_HEMI_SKY, COLOR_HEMI_GROUND, 0.35]} />
      <directionalLight
        position={[10, 20, 5]}
        intensity={1.15}
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

      {/*
        接地感は「強めた directionalLight の実影（castShadow）＋座席台座メッシュ」で担保する。
        以前はここに ContactShadows（drei）を敷いていたが、既定で毎フレーム影マップを
        再描画するため、CIのソフトウェアWebGL(SwiftShader)＋最大席数(IMAX 544席)で
        描画が重くなり E2E がタイムアウト/クラッシュ（#474 完了条件「E2Eをflaky化させない」に
        抵触）した。per-frame コストの大きい ContactShadows を撤去し安定性を優先する。
      */}

      {/* 床 */}
      <FloorMesh roomWidth={roomWidth} roomDepth={roomDepth} />

      {/* 壁（4面）— フォーマット別の壁色（Dolbyは黒基調） */}
      <WallMesh
        width={roomWidth}
        height={roomHeight}
        position={[0, roomHeight / 2, -halfDepth]}
        color={palette.wall}
      />
      <WallMesh
        width={roomDepth}
        height={roomHeight}
        position={[-halfWidth, roomHeight / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        color={palette.wall}
      />
      <WallMesh
        width={roomDepth}
        height={roomHeight}
        position={[halfWidth, roomHeight / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        color={palette.wall}
      />
      {/* スクリーン側壁（スクリーンを引き立てる暗色・フォーマット別） */}
      <WallMesh
        width={roomWidth}
        height={roomHeight}
        position={[0, roomHeight / 2, halfDepth]}
        rotation={[0, Math.PI, 0]}
        color={palette.screenWall}
      />

      {/* ステージ前縁バンド（スクリーン下の細い装飾帯でシアター感を強調） */}
      <mesh position={[0, 0.15, halfDepth - 0.05]}>
        <boxGeometry args={[roomWidth, 0.3, 0.1]} />
        <meshLambertMaterial color={COLOR_PROSCENIUM} />
      </mesh>

      {/* 天井（フォーマット別の暗色・投影光の反射を抑える） */}
      <CeilingMesh
        roomWidth={roomWidth}
        roomDepth={roomDepth}
        roomHeight={roomHeight}
        color={palette.ceiling}
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
