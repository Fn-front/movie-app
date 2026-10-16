/**
 * AudienceMeshesコンポーネント
 * 着席した観客（頭＋肩）のローポリ表現
 *
 * 参考写真（Dolby Cinema 公式の観客カット）で確認したとおり、座席後方から見える人は
 * **頭と肩の上部だけ**で、しかもスクリーン逆光でほぼ黒いシルエットになる。俯瞰では
 * 1人が数pxしかない。そのため精細なモデルは不要で、頭（球）＋肩（テーパーした箱）で
 * シルエットを作る。
 *
 * 外部の3Dモデルは読み込まない。実行時フェッチによるE2E flaky 化とライセンス確認を
 * 避けるため（設計書 §2.2 の「外部アセットを追加しない」方針と同じ理由）。
 *
 * 体格・首の傾きは席IDから決定論的に振る（`Math.random()` を使わない）。
 */

'use client';

import { memo, useMemo, useRef, useEffect } from 'react';
import { Object3D, type InstancedMesh as InstancedMeshType } from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import { extend } from '@react-three/fiber';

// R3FにRoundedBoxGeometryを登録
extend({ RoundedBoxGeometry });

import type { TheaterSeat } from '../../types';
import { calcSeatOccupancyScore } from '../../utils/occupancy';
import { calcSeatYawOnArc } from '../../utils/rowCurve';
import type { InteriorTheme } from '../../utils/theaterPalette';

/** 頭の半径 (m) */
const HEAD_RADIUS = 0.105;
/** 肩の寸法 (m) */
const SHOULDER = { width: 0.42, height: 0.2, depth: 0.2 };
/** 座席Y座標から肩中心までの高さ (m) */
const SHOULDER_Y = 1.02;
/** 座席Y座標から頭中心までの高さ (m) */
const HEAD_Y = 1.21;
/** 背もたれに預けるぶん、座席中心より後方へ寄せる量 (m) */
const BODY_Z_OFFSET = -0.1;

/** 体格のばらつき（席IDのスコアから選ぶ倍率） */
const BUILD_SCALES = [0.92, 1.0, 1.06, 0.97];
/** 首の傾きのばらつき (rad) */
const HEAD_TILTS = [-0.05, 0.02, 0.06, -0.01];

export interface AudienceMeshesProps {
  /** 内装テーマ（人の色は暗いシルエットなので座席フレーム色を流用する） */
  theme: InteriorTheme;
  /** 座席一覧 */
  seats: TheaterSeat[];
  /** 人が座っている席のID */
  occupiedSeatIds: Set<string>;
  /** 座席列の弧の半径 (m)。0 なら直線列 */
  rowCurveRadius: number;
}

export const AudienceMeshes = memo<AudienceMeshesProps>(
  function AudienceMeshes({ theme, seats, occupiedSeatIds, rowCurveRadius }) {
    const headRef = useRef<InstancedMeshType>(null);
    const shoulderRef = useRef<InstancedMeshType>(null);
    const tempObject = useMemo(() => new Object3D(), []);

    const occupants = useMemo(
      () => seats.filter((s) => occupiedSeatIds.has(s.id)),
      [seats, occupiedSeatIds],
    );

    useEffect(() => {
      occupants.forEach((seat, i) => {
        const yaw = calcSeatYawOnArc(seat.position_x, rowCurveRadius);
        // 体格・首の傾きは席IDから決定論的に振る（再レンダリングで変わらない）
        const variant = Math.floor(calcSeatOccupancyScore(seat.id) * 4) % 4;
        const build = BUILD_SCALES[variant];
        const tilt = HEAD_TILTS[variant];
        // 背もたれに預けるぶん後方へ。弧状列では座席の向きに合わせて回す
        const dz = BODY_Z_OFFSET;
        const ox = dz * Math.sin(yaw);
        const oz = dz * Math.cos(yaw);

        if (shoulderRef.current) {
          tempObject.position.set(
            seat.position_x + ox,
            seat.position_y + SHOULDER_Y * build,
            seat.position_z + oz,
          );
          tempObject.rotation.set(0, yaw, 0);
          tempObject.scale.set(build, build, build);
          tempObject.updateMatrix();
          shoulderRef.current.setMatrixAt(i, tempObject.matrix);
        }
        if (headRef.current) {
          tempObject.position.set(
            seat.position_x + ox,
            seat.position_y + HEAD_Y * build,
            seat.position_z + oz,
          );
          tempObject.rotation.set(tilt, yaw, 0);
          tempObject.scale.set(build, build, build);
          tempObject.updateMatrix();
          headRef.current.setMatrixAt(i, tempObject.matrix);
        }
      });
      if (shoulderRef.current) {
        shoulderRef.current.instanceMatrix.needsUpdate = true;
      }
      if (headRef.current) headRef.current.instanceMatrix.needsUpdate = true;
    }, [occupants, rowCurveRadius, tempObject]);

    if (occupants.length === 0) return null;

    return (
      <group>
        {/* 肩（テーパーした角丸箱）。castShadow は付けない（座席で足りている） */}
        <instancedMesh
          ref={shoulderRef}
          args={[undefined, undefined, occupants.length]}
          frustumCulled={false}
        >
          <roundedBoxGeometry
            args={[SHOULDER.width, SHOULDER.height, SHOULDER.depth, 3, 0.07]}
          />
          <meshStandardMaterial
            color={theme.seat.frame}
            roughness={0.85}
            metalness={0}
          />
        </instancedMesh>

        {/* 頭（球） */}
        <instancedMesh
          ref={headRef}
          args={[undefined, undefined, occupants.length]}
          frustumCulled={false}
        >
          <sphereGeometry args={[HEAD_RADIUS, 10, 8]} />
          <meshStandardMaterial
            color={theme.seat.frame}
            roughness={0.8}
            metalness={0}
          />
        </instancedMesh>
      </group>
    );
  },
);

AudienceMeshes.displayName = 'AudienceMeshes';
