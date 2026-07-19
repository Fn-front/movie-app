/**
 * SeatMeshesコンポーネント
 * アイソメトリック ドールハウススタイル: フラットなRoundedBox座席 + エッジ強調
 * 列ごとに2色交互、選択座席はハイライト
 */

'use client';

import { memo, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  Object3D,
  Color,
  type InstancedMesh as InstancedMeshType,
} from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import { extend } from '@react-three/fiber';
import { Edges } from '@react-three/drei';

import type { TheaterSeat } from '../../types';

// R3FにRoundedBoxGeometryを登録
extend({ RoundedBoxGeometry });

// JSX型定義: extend()で登録したRoundedBoxGeometryのR3F型
declare module '@react-three/fiber' {
  interface ThreeElements {
    roundedBoxGeometry: {
      args?: ConstructorParameters<typeof RoundedBoxGeometry>;
      attach?: string;
    };
  }
}

/**
 * 座席パーツのサイズ定義
 * 席x間隔 0.6m に対しクッション幅 0.5m とし、隣接席間に 10cm の隙間を確保。
 * これが実際の映画館の肘掛けに相当するスペース。座席が個別に見える。
 */
const SEAT_CUSHION = { width: 0.5, height: 0.12, depth: 0.45 };
const SEAT_BACK = { width: 0.5, height: 0.5, depth: 0.08 };

/** ドールハウス座席カラー（列ごとに交互） */
const COLOR_SEAT_A = new Color('#c44545');
const COLOR_SEAT_B = new Color('#b03838');
const COLOR_SELECTED = new Color('#ffaa00');
/** 車椅子席カラー（他席と区別できる青系） */
const COLOR_WHEELCHAIR = new Color('#3b82f6');

/** 座席の色種別キー（純粋・テスト用にexport） */
export type SeatColorKey = 'selected' | 'wheelchair' | 'rowEven' | 'rowOdd';

/**
 * 座席の色種別を決定する。優先度: 選択中 > 車椅子席 > 列ごとの交互色。
 */
export function getSeatColorKey(
  seat: TheaterSeat,
  selectedSeatId: string | null,
): SeatColorKey {
  if (seat.id === selectedSeatId) return 'selected';
  if (seat.seat_type === 'wheelchair') return 'wheelchair';
  // 列ごとに2色交互（row_label文字コード偶奇）
  return seat.row_label.charCodeAt(0) % 2 === 0 ? 'rowEven' : 'rowOdd';
}

const SEAT_COLOR_BY_KEY: Record<SeatColorKey, Color> = {
  selected: COLOR_SELECTED,
  wheelchair: COLOR_WHEELCHAIR,
  rowEven: COLOR_SEAT_A,
  rowOdd: COLOR_SEAT_B,
};

function getSeatColor(seat: TheaterSeat, selectedSeatId: string | null): Color {
  return SEAT_COLOR_BY_KEY[getSeatColorKey(seat, selectedSeatId)];
}

export interface SeatMeshesProps {
  /** 座席データ一覧 */
  seats: TheaterSeat[];
  /** 選択中の座席ID */
  selectedSeatId: string | null;
  /** 座席クリック時コールバック */
  onSeatClick: (seat: TheaterSeat) => void;
}

/**
 * 座面のInstancedMesh
 */
const SeatCushions = memo<{
  seats: TheaterSeat[];
  selectedSeatId: string | null;
}>(function SeatCushions({ seats, selectedSeatId }) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (!meshRef.current) return;
    seats.forEach((seat, i) => {
      tempObject.position.set(
        seat.position_x,
        seat.position_y + 0.3,
        seat.position_z,
      );
      tempObject.rotation.set(0, 0, 0);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);

      meshRef.current!.setColorAt(i, getSeatColor(seat, selectedSeatId));
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [seats, selectedSeatId, tempObject]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, seats.length]}
      frustumCulled={false}
      castShadow
    >
      <roundedBoxGeometry
        args={[
          SEAT_CUSHION.width,
          SEAT_CUSHION.height,
          SEAT_CUSHION.depth,
          4,
          0.03,
        ]}
      />
      <meshLambertMaterial />
    </instancedMesh>
  );
});
SeatCushions.displayName = 'SeatCushions';

/**
 * 背もたれのInstancedMesh
 */
const SeatBacks = memo<{
  seats: TheaterSeat[];
  selectedSeatId: string | null;
}>(function SeatBacks({ seats, selectedSeatId }) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (!meshRef.current) return;
    seats.forEach((seat, i) => {
      tempObject.position.set(
        seat.position_x,
        seat.position_y + 0.6,
        seat.position_z - SEAT_CUSHION.depth / 2,
      );
      tempObject.rotation.set(-0.1, 0, 0);
      // 車椅子席は背もたれを描かない（フラットな車椅子スペース＝色以外の形状差でも区別）
      const noBack = seat.seat_type === 'wheelchair';
      tempObject.scale.set(1, noBack ? 0 : 1, 1);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);

      meshRef.current!.setColorAt(i, getSeatColor(seat, selectedSeatId));
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [seats, selectedSeatId, tempObject]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, seats.length]}
      frustumCulled={false}
      castShadow
    >
      <roundedBoxGeometry
        args={[SEAT_BACK.width, SEAT_BACK.height, SEAT_BACK.depth, 4, 0.02]}
      />
      <meshLambertMaterial />
    </instancedMesh>
  );
});
SeatBacks.displayName = 'SeatBacks';

/**
 * 選択座席のハイライト枠（emissive + Edges）
 */
const SelectedSeatHighlight = memo<{ seat: TheaterSeat | null }>(
  function SelectedSeatHighlight({ seat }) {
    if (!seat) return null;
    return (
      <group
        position={[
          seat.position_x,
          seat.position_y + 0.45,
          seat.position_z + 0.05,
        ]}
      >
        <mesh>
          <boxGeometry args={[0.7, 0.85, 0.6]} />
          <meshBasicMaterial
            color='#ffaa00'
            transparent
            opacity={0.0}
            depthWrite={false}
          />
          <Edges color='#ffaa00' lineWidth={2.5} />
        </mesh>
      </group>
    );
  },
);
SelectedSeatHighlight.displayName = 'SelectedSeatHighlight';

export const SeatMeshes = memo<SeatMeshesProps>(function SeatMeshes({
  seats,
  selectedSeatId,
  onSeatClick,
}) {
  /** 透明なクリック判定用InstancedMesh */
  const hitRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (!hitRef.current) return;
    seats.forEach((seat, i) => {
      tempObject.position.set(
        seat.position_x,
        seat.position_y + 0.45,
        seat.position_z,
      );
      tempObject.rotation.set(0, 0, 0);
      tempObject.updateMatrix();
      hitRef.current!.setMatrixAt(i, tempObject.matrix);
    });
    hitRef.current.instanceMatrix.needsUpdate = true;
  }, [seats, tempObject]);

  const handlePointerOver = useCallback(
    (event: { instanceId?: number }) => {
      if (event.instanceId === undefined) return;
      const seat = seats[event.instanceId];
      if (seat && seat.id !== selectedSeatId) {
        document.body.style.cursor = 'pointer';
      }
    },
    [seats, selectedSeatId],
  );

  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = 'auto';
  }, []);

  const handleClick = useCallback(
    (event: { instanceId?: number; stopPropagation: () => void }) => {
      event.stopPropagation();
      if (event.instanceId === undefined) return;
      const seat = seats[event.instanceId];
      if (seat) {
        onSeatClick(seat);
      }
    },
    [seats, onSeatClick],
  );

  const selectedSeat = useMemo(
    () => seats.find((s) => s.id === selectedSeatId) ?? null,
    [seats, selectedSeatId],
  );

  return (
    <group>
      <SeatCushions seats={seats} selectedSeatId={selectedSeatId} />
      <SeatBacks seats={seats} selectedSeatId={selectedSeatId} />
      <SelectedSeatHighlight seat={selectedSeat} />

      {/* 透明なクリック判定メッシュ */}
      <instancedMesh
        ref={hitRef}
        args={[undefined, undefined, seats.length]}
        frustumCulled={false}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <boxGeometry args={[0.55, 0.7, 0.55]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </instancedMesh>
    </group>
  );
});

SeatMeshes.displayName = 'SeatMeshes';
