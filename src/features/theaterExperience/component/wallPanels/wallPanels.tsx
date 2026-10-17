/**
 * WallPanelsコンポーネント
 * 壁の造作（縦リブ / 多面体ファセット）＋幅木＋コーブ照明
 *
 * 側壁2面と後壁に重ねる。スクリーン側壁は幕を引き立てるため素のままにする。
 * 造作形式は `theme.wallTreatment` で切り替える:
 *   - rib:   等間隔の縦リブ（standard / imax）
 *   - facet: 多面体ファセット（dolby_cinema）
 *
 * 配置計算は `utils/wallGeometry`（純ロジック・単体テスト済み）に委譲し、
 * ここは three への配置のみを行う。
 */

'use client';

import { memo, useMemo, useRef, useEffect } from 'react';
import {
  AdditiveBlending,
  Object3D,
  Color,
  type InstancedMesh as InstancedMeshType,
} from 'three';

import type { InteriorTheme } from '../../utils/theaterPalette';
import {
  calcFacetRadius,
  computeFacetPlacements,
  computeRibPlacements,
  isWallHiddenInOverview,
} from '../../utils/wallGeometry';
import { getGlowGradientTexture } from '../../utils/theaterTextures';

/**
 * コーブ照明の滲みの高さ (m)。
 *
 * 発光帯そのもの（COVE_HEIGHT）は細いが、実写では光が上下の壁面へ
 * 大きく滲む。均一な細帯だけだと「UIの枠線」に見えるため、
 * 減衰グラデーションの板を重ねる範囲をこの高さで取る。
 */
const COVE_GLOW_HEIGHT = 1.1;

/** 幅木の高さ (m) */
const DADO_HEIGHT = 0.6;
/** 幅木の壁からの出 (m) */
const DADO_DEPTH = 0.04;
/** コーブ照明を天井から下げる量 (m) */
const COVE_DROP = 0.25;
/** コーブ照明の帯の高さ (m) */
const COVE_HEIGHT = 0.06;
/** コーブ照明の壁からの出 (m) */
const COVE_OFFSET = 0.1;

/** 縦リブの間隔 (m) */
const RIB_SPACING = 0.35;
/** 縦リブの幅 (m) */
const RIB_WIDTH = 0.12;
/** 縦リブの壁からの出 (m) */
const RIB_DEPTH = 0.06;

/** ファセット1ユニットの目安サイズ (m) */
const FACET_UNIT = 1.6;

/**
 * コーブ照明の HDR 倍率。
 * 既存の通路灯・段差LEDと同じ作法で、Bloom の luminanceThreshold(0.9) を超えるよう
 * HDR 化しつつ toneMapped=false にする。点滅はさせない（WCAG 2.3.1）。
 */
const COVE_HDR_SCALE = 1.8;

/** 1つの壁面の寸法 */
interface WallFace {
  /** 壁の長さ (m) */
  length: number;
  /** 壁の中心位置 */
  position: [number, number, number];
  /** 壁の向き（planeGeometry と同じ回転。ローカル+Zが室内側） */
  rotation: [number, number, number];
}

/**
 * 描画する壁1面ぶんのエントリ。
 * `id` は React の key 用の識別子で、寸法を表す `WallFace` とは責務を分けている
 * （座標を key にすると壁が重なった場合に衝突しうるため、安定した名前を使う）。
 */
interface WallFaceEntry {
  id: 'left' | 'right' | 'back';
  face: WallFace;
  /** 造作（リブ/ファセット）を描くか */
  withRelief: boolean;
}

/**
 * 造作帯（幅木の上端〜コーブの下端）の寸法を返す。
 * 壁が低くて帯が取れない場合は高さ0を返し、呼び出し側で描画をスキップする。
 */
function calcReliefBand(roomHeight: number): {
  height: number;
  centerY: number;
} {
  const bottom = -roomHeight / 2 + DADO_HEIGHT;
  const top = roomHeight / 2 - COVE_DROP - COVE_HEIGHT / 2;
  const height = top - bottom;
  if (height <= 0) return { height: 0, centerY: 0 };
  return { height, centerY: (bottom + top) / 2 };
}

/**
 * 縦リブ（InstancedMesh）。壁1面ぶん。
 */
const RibRelief = memo<{
  theme: InteriorTheme;
  wallLength: number;
  bandHeight: number;
  bandCenterY: number;
}>(function RibRelief({ theme, wallLength, bandHeight, bandCenterY }) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);
  const ribs = useMemo(
    () => computeRibPlacements(wallLength, RIB_SPACING),
    [wallLength],
  );

  useEffect(() => {
    if (!meshRef.current) return;
    ribs.forEach((rib, i) => {
      tempObject.position.set(rib.offset, bandCenterY, RIB_DEPTH / 2);
      tempObject.rotation.set(0, 0, 0);
      tempObject.scale.set(1, 1, 1);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [ribs, bandCenterY, tempObject]);

  if (ribs.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, ribs.length]}
      frustumCulled={false}
    >
      {/* castShadow は付けない: 壁際の細い造作で影寄与は僅少、影マップの負荷を抑える */}
      <boxGeometry args={[RIB_WIDTH, bandHeight, RIB_DEPTH]} />
      <meshStandardMaterial
        color={theme.relief}
        roughness={0.7}
        metalness={0.2}
      />
    </instancedMesh>
  );
});
RibRelief.displayName = 'RibRelief';

/**
 * 多面体ファセット（InstancedMesh）。壁1面ぶん。
 *
 * 四角錐（ConeGeometry の radialSegments=4）を室内側へ向けて並べる。
 * ConeGeometry の軸は +Y なので、rotation=[π/2, spin, 0]（three の XYZ は
 * Rx*Ry*Rz の順に適用するため Ry が先＝錐の自軸まわりの自転）で室内側へ倒す。
 * 突出量は scale.y で与える（高さ1の錐を各インスタンスで伸縮させる）。
 */
const FacetRelief = memo<{
  theme: InteriorTheme;
  wallLength: number;
  bandHeight: number;
  bandCenterY: number;
}>(function FacetRelief({ theme, wallLength, bandHeight, bandCenterY }) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);
  const facets = useMemo(
    () => computeFacetPlacements(wallLength, bandHeight, FACET_UNIT),
    [wallLength, bandHeight],
  );
  const radius = useMemo(
    () => calcFacetRadius(wallLength, FACET_UNIT),
    [wallLength],
  );

  useEffect(() => {
    if (!meshRef.current) return;
    const bandBottom = bandCenterY - bandHeight / 2;
    facets.forEach((facet, i) => {
      tempObject.position.set(facet.offset, bandBottom + facet.height, 0);
      tempObject.rotation.set(Math.PI / 2, facet.spin, 0);
      tempObject.scale.set(1, facet.depth, 1);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [facets, bandCenterY, bandHeight, tempObject]);

  if (facets.length === 0 || radius <= 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, facets.length]}
      frustumCulled={false}
    >
      {/* 高さ1の四角錐。実際の突出量は各インスタンスの scale.y で与える */}
      <coneGeometry args={[radius, 1, 4]} />
      {/* 面ごとに法線が変わるため、既存の directionalLight だけで明暗の三角パターンが出る */}
      <meshStandardMaterial
        color={theme.relief}
        roughness={0.85}
        metalness={0.05}
        flatShading
      />
    </instancedMesh>
  );
});
FacetRelief.displayName = 'FacetRelief';

/**
 * 壁1面ぶんの造作一式（幅木・造作・コーブ）。
 *
 * 壁の position / rotation を持つ group の中で、ローカル +Z が室内側・ローカルXが
 * 壁に沿う方向・ローカルYが高さ（壁中心が原点）になる。
 */
const WallFacePanels = memo<{
  theme: InteriorTheme;
  face: WallFace;
  roomHeight: number;
  coveColor: Color;
  /** 造作（リブ/ファセット）を描くか。後壁は非常口誘導灯と干渉するため描かない */
  withRelief: boolean;
}>(function WallFacePanels({ theme, face, roomHeight, coveColor, withRelief }) {
  const band = useMemo(() => calcReliefBand(roomHeight), [roomHeight]);
  const glowGradient = useMemo(() => getGlowGradientTexture(), []);

  return (
    <group position={face.position} rotation={face.rotation}>
      {/* 幅木（ダド） */}
      <mesh
        position={[0, -roomHeight / 2 + DADO_HEIGHT / 2, DADO_DEPTH / 2]}
        receiveShadow
      >
        <boxGeometry args={[face.length, DADO_HEIGHT, DADO_DEPTH]} />
        <meshStandardMaterial
          color={theme.dado}
          roughness={0.85}
          metalness={0}
        />
      </mesh>

      {/* 造作（縦リブ or 多面体ファセット） */}
      {withRelief && band.height > 0 && theme.wallTreatment === 'rib' && (
        <RibRelief
          theme={theme}
          wallLength={face.length}
          bandHeight={band.height}
          bandCenterY={band.centerY}
        />
      )}
      {withRelief && band.height > 0 && theme.wallTreatment === 'facet' && (
        <FacetRelief
          theme={theme}
          wallLength={face.length}
          bandHeight={band.height}
          bandCenterY={band.centerY}
        />
      )}

      {/*
        コーブ照明の滲み。発光帯の手前に、上下へ減衰するグラデーションの板を
        重ねる。加算合成なので下の壁の陰影を保ったまま光だけが乗る。
        発光帯より僅かに手前へ出して、帯自体に食い込まないようにする。
      */}
      <mesh position={[0, roomHeight / 2 - COVE_DROP, COVE_OFFSET - 0.01]}>
        <planeGeometry args={[face.length, COVE_GLOW_HEIGHT]} />
        <meshBasicMaterial
          map={glowGradient}
          color={coveColor}
          blending={AdditiveBlending}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* コーブ照明（天井際を走る発光帯） */}
      <mesh position={[0, roomHeight / 2 - COVE_DROP, COVE_OFFSET]}>
        <boxGeometry args={[face.length, COVE_HEIGHT, COVE_HEIGHT]} />
        <meshBasicMaterial color={coveColor} toneMapped={false} />
      </mesh>
    </group>
  );
});
WallFacePanels.displayName = 'WallFacePanels';

export interface WallPanelsProps {
  /** 内装テーマ */
  theme: InteriorTheme;
  /** 一人称視点か（俯瞰では手前側の壁の造作を描かない） */
  isFirstPerson: boolean;
  /** 劇場の幅 (m) */
  roomWidth: number;
  /** 劇場の奥行 (m) */
  roomDepth: number;
  /** 劇場の高さ (m) */
  roomHeight: number;
}

export const WallPanels = memo<WallPanelsProps>(function WallPanels({
  theme,
  isFirstPerson,
  roomWidth,
  roomDepth,
  roomHeight,
}) {
  const halfWidth = roomWidth / 2;
  const halfDepth = roomDepth / 2;
  const centerY = roomHeight / 2;

  const coveColor = useMemo(
    () => new Color(theme.cove).multiplyScalar(COVE_HDR_SCALE),
    [theme.cove],
  );

  // 側壁2面＋後壁。スクリーン側壁(+Z)は幕を引き立てるため造作を入れない
  const faces = useMemo<WallFaceEntry[]>(
    () => [
      {
        id: 'left',
        face: {
          length: roomDepth,
          position: [-halfWidth, centerY, 0],
          rotation: [0, Math.PI / 2, 0],
        },
        withRelief: true,
      },
      {
        id: 'right',
        face: {
          length: roomDepth,
          position: [halfWidth, centerY, 0],
          rotation: [0, -Math.PI / 2, 0],
        },
        withRelief: true,
      },
      {
        // 後壁: 非常口誘導灯(ExitSigns)と干渉するため造作は入れない
        id: 'back',
        face: {
          length: roomWidth,
          position: [0, centerY, -halfDepth],
          rotation: [0, 0, 0],
        },
        withRelief: false,
      },
    ],
    [roomWidth, roomDepth, halfWidth, halfDepth, centerY],
  );

  return (
    <group>
      {faces
        .filter(
          ({ face }) =>
            isFirstPerson ||
            !isWallHiddenInOverview(face.position[0], face.position[2]),
        )
        .map(({ id, face, withRelief }) => (
          <WallFacePanels
            key={id}
            theme={theme}
            face={face}
            roomHeight={roomHeight}
            coveColor={coveColor}
            withRelief={withRelief}
          />
        ))}
    </group>
  );
});

WallPanels.displayName = 'WallPanels';
