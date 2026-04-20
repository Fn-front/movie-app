/**
 * SeatMeshesコンポーネント
 * InstancedMeshで座席を効率的に描画、クリック選択に対応
 */

'use client';

import { memo, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  Object3D,
  Color,
  type InstancedMesh as InstancedMeshType,
} from 'three';

import type { TheaterSeat } from '../../types';

const SEAT_SIZE = { width: 0.6, height: 0.5, depth: 0.5 };
const COLOR_DEFAULT = new Color('#4a4e69');
const COLOR_SELECTED = new Color('#f72585');
const COLOR_HOVER = new Color('#7209b7');

export interface SeatMeshesProps {
  /** 座席データ一覧 */
  seats: TheaterSeat[];
  /** 選択中の座席ID */
  selectedSeatId: string | null;
  /** 座席クリック時コールバック */
  onSeatClick: (seat: TheaterSeat) => void;
}

export const SeatMeshes = memo<SeatMeshesProps>(function SeatMeshes({
  seats,
  selectedSeatId,
  onSeatClick,
}) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  // 座席の位置を更新
  useEffect(() => {
    if (!meshRef.current) return;

    seats.forEach((seat, i) => {
      tempObject.position.set(
        seat.position_x,
        seat.position_y + SEAT_SIZE.height / 2,
        seat.position_z,
      );
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);

      // 色を設定
      const color = seat.id === selectedSeatId ? COLOR_SELECTED : COLOR_DEFAULT;
      meshRef.current!.setColorAt(i, color);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [seats, selectedSeatId, tempObject]);

  const handlePointerOver = useCallback(
    (event: { instanceId?: number }) => {
      if (event.instanceId === undefined || !meshRef.current) return;
      const seat = seats[event.instanceId];
      if (seat && seat.id !== selectedSeatId) {
        meshRef.current.setColorAt(event.instanceId, COLOR_HOVER);
        if (meshRef.current.instanceColor) {
          meshRef.current.instanceColor.needsUpdate = true;
        }
      }
    },
    [seats, selectedSeatId],
  );

  const handlePointerOut = useCallback(
    (event: { instanceId?: number }) => {
      if (event.instanceId === undefined || !meshRef.current) return;
      const seat = seats[event.instanceId];
      if (seat && seat.id !== selectedSeatId) {
        meshRef.current.setColorAt(event.instanceId, COLOR_DEFAULT);
        if (meshRef.current.instanceColor) {
          meshRef.current.instanceColor.needsUpdate = true;
        }
      }
    },
    [seats, selectedSeatId],
  );

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

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, seats.length]}
      frustumCulled={false}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <boxGeometry
        args={[SEAT_SIZE.width, SEAT_SIZE.height, SEAT_SIZE.depth]}
      />
      <meshStandardMaterial />
    </instancedMesh>
  );
});

SeatMeshes.displayName = 'SeatMeshes';
