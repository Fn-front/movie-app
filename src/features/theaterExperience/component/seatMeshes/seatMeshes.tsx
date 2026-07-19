/**
 * SeatMeshesコンポーネント
 * アイソメトリック ドールハウススタイル: フラットなRoundedBox座席 + エッジ強調
 * 通常席は単色。ホバー席は枠＋席番号ラベルで強調し、2Dリストと相互連動する。
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
import { Edges, Html } from '@react-three/drei';

import type { TheaterSeat } from '../../types';

import styles from './seatMeshes.module.scss';

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

/** ドールハウス座席カラー（単色） */
const COLOR_SEAT = new Color('#bf4040');
const COLOR_SELECTED = new Color('#ffaa00');
/** 車椅子席カラー（他席と区別できる青系） */
const COLOR_WHEELCHAIR = new Color('#3b82f6');
/** ホバー強調枠の色（design-system の --warning-main と一致させ、2Dリング色と揃える） */
const HOVER_FRAME_COLOR = '#f59e0b';

/** 座席の色種別キー（純粋・テスト用にexport） */
export type SeatColorKey = 'selected' | 'wheelchair' | 'seat';

/**
 * 座席の色種別を決定する。優先度: 選択中 > 車椅子席 > 通常席（単色）。
 * 旧実装は列ごとの2色交互だったが、輝度差が視認閾値未満（コントラスト比≈1.24:1）で
 * 列識別に寄与せず無効な配色だったため撤廃。列識別は2D座席一覧が担う。
 */
export function getSeatColorKey(
  seat: TheaterSeat,
  selectedSeatId: string | null,
): SeatColorKey {
  if (seat.id === selectedSeatId) return 'selected';
  if (seat.seat_type === 'wheelchair') return 'wheelchair';
  return 'seat';
}

const SEAT_COLOR_BY_KEY: Record<SeatColorKey, Color> = {
  selected: COLOR_SELECTED,
  wheelchair: COLOR_WHEELCHAIR,
  seat: COLOR_SEAT,
};

function getSeatColor(seat: TheaterSeat, selectedSeatId: string | null): Color {
  return SEAT_COLOR_BY_KEY[getSeatColorKey(seat, selectedSeatId)];
}

export interface SeatMeshesProps {
  /** 座席データ一覧 */
  seats: TheaterSeat[];
  /** 選択中の座席ID */
  selectedSeatId: string | null;
  /** ホバー中の座席ID（2Dリストと相互ハイライト） */
  hoveredSeatId: string | null;
  /** 座席クリック時コールバック */
  onSeatClick: (seat: TheaterSeat) => void;
  /** 座席ホバー変化コールバック（null=ホバー解除） */
  onHoverSeat: (seatId: string | null) => void;
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

  // 位置行列は座席データにのみ依存（選択変更では再計算しない）
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
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [seats, tempObject]);

  // 色は座席データと選択状態に依存（選択変更時はここだけ再実行）
  useEffect(() => {
    if (!meshRef.current) return;
    seats.forEach((seat, i) => {
      meshRef.current!.setColorAt(i, getSeatColor(seat, selectedSeatId));
    });
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [seats, selectedSeatId]);

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
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [seats, tempObject]);

  // 色は座席データと選択状態に依存（選択変更時はここだけ再実行）
  useEffect(() => {
    if (!meshRef.current) return;
    seats.forEach((seat, i) => {
      meshRef.current!.setColorAt(i, getSeatColor(seat, selectedSeatId));
    });
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [seats, selectedSeatId]);

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
 * ホバー席のハイライト枠（Edges）＋席番号ラベル
 * 旧 SelectedSeatHighlight は「選択即一人称遷移」で俯瞰に一度も現れないデッド演出
 * だった。これをホバー強調に転用し、俯瞰3Dで席の識別（枠＋番号）を可能にする。
 * InstancedMesh は per-instance のラベルを持てないため、ホバー中の1席だけ
 * drei Html で番号をオーバーレイする（席数に依らず overlay は常に1つ）。
 */
const HoverHighlight = memo<{ seat: TheaterSeat | null }>(
  function HoverHighlight({ seat }) {
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
            color={HOVER_FRAME_COLOR}
            transparent
            opacity={0.0}
            depthWrite={false}
          />
          <Edges color={HOVER_FRAME_COLOR} lineWidth={2.5} />
        </mesh>
        {/* pointerEvents:none はラッパーdivを3Dのポインタ判定に透過させるための
            機能指定（見た目のスタイルはCSS Module側 c_seat_meshes__label に集約） */}
        <Html
          center
          position={[0, 0.75, 0]}
          style={{ pointerEvents: 'none' }}
          zIndexRange={[100, 0]}
        >
          <span className={styles.c_seat_meshes__label}>
            {seat.row_label}
            {seat.seat_number}
          </span>
        </Html>
      </group>
    );
  },
);
HoverHighlight.displayName = 'HoverHighlight';

export const SeatMeshes = memo<SeatMeshesProps>(function SeatMeshes({
  seats,
  selectedSeatId,
  hoveredSeatId,
  onSeatClick,
  onHoverSeat,
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
      if (!seat) return;
      document.body.style.cursor = 'pointer';
      onHoverSeat(seat.id);
    },
    [seats, onHoverSeat],
  );

  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = 'auto';
    onHoverSeat(null);
  }, [onHoverSeat]);

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

  // ホバー中の席（俯瞰時のみ枠＋番号ラベルを表示）。
  // 一人称時（selectedSeatId あり）は視界を妨げないため表示しない。
  const hoveredSeat = useMemo(
    () =>
      selectedSeatId
        ? null
        : (seats.find((s) => s.id === hoveredSeatId) ?? null),
    [seats, hoveredSeatId, selectedSeatId],
  );

  return (
    <group>
      <SeatCushions seats={seats} selectedSeatId={selectedSeatId} />
      <SeatBacks seats={seats} selectedSeatId={selectedSeatId} />
      <HoverHighlight seat={hoveredSeat} />

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
