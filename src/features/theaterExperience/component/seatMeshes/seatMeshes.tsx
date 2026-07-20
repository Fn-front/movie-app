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
/** 座面下の台座（脚）。床(y)からクッション下端(y+0.24)までを埋め、座席の浮きを解消する */
const SEAT_BASE = { width: 0.2, height: 0.24, depth: 0.34 };
/** 肘掛けバー。クッション両脇に配置し、椅子のシルエットを立たせる */
const SEAT_ARMREST = { width: 0.05, height: 0.14, depth: 0.4 };
/** 肘掛けをクッション中心から左右に置くオフセット（席ピッチ0.6内に収める） */
const ARMREST_OFFSET_X = 0.27;

/** ドールハウス座席カラー（単色） */
const COLOR_SEAT = new Color('#bf4040');
const COLOR_SELECTED = new Color('#ffaa00');
/** 車椅子席カラー（他席と区別できる青系） */
const COLOR_WHEELCHAIR = new Color('#3b82f6');
/** 座席フレーム（脚・肘掛け）の暗色。座面/背もたれと分離し椅子構造を見せる */
const COLOR_FRAME = new Color('#3a2e30');
/** 背もたれは座面より一段暗くして、座面と背もたれの境界（椅子のシルエット）を立たせる */
const BACK_DARKEN = 0.78;
/**
 * ホバー強調枠の色（design-system の --warning-dark と一致させ、2Dリング色と揃える）。
 * 明色背景の2Dリングが WCAG 1.4.11(非テキスト3:1) を満たすよう、--warning-main(#f59e0b,
 * 2.06:1) ではなく --warning-dark(#d97706, 3.05:1) を採用し、3D枠も同色に統一する。
 */
const HOVER_FRAME_COLOR = '#d97706';

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

// 背もたれ用に一段暗くした色（座面との境界＝椅子のシルエットを立たせる）
const SEAT_BACK_COLOR_BY_KEY: Record<SeatColorKey, Color> = {
  selected: COLOR_SELECTED.clone().multiplyScalar(BACK_DARKEN),
  wheelchair: COLOR_WHEELCHAIR.clone().multiplyScalar(BACK_DARKEN),
  seat: COLOR_SEAT.clone().multiplyScalar(BACK_DARKEN),
};

function getSeatColor(seat: TheaterSeat, selectedSeatId: string | null): Color {
  return SEAT_COLOR_BY_KEY[getSeatColorKey(seat, selectedSeatId)];
}

/** 背もたれの色（座面より一段暗い）。座面/背もたれの輝度差でシルエットを立たせる。 */
export function getSeatBackColor(
  seat: TheaterSeat,
  selectedSeatId: string | null,
): Color {
  return SEAT_BACK_COLOR_BY_KEY[getSeatColorKey(seat, selectedSeatId)];
}

/**
 * ポインタが座席インスタンスに乗ったとき「ホバーとして通知すべき座席ID」を返す。
 * 一人称時（selectedSeatId あり）は俯瞰専用のホバー演出を出さないため null を返し、
 * 2Dリストへのホバー漏れ（意図しないリング点灯）とカーソル変化を防ぐ。
 * R3F描画に依存しない純粋関数としてテスト可能にする。
 */
export function resolveHoverEmitId(
  seats: TheaterSeat[],
  instanceId: number | undefined,
  selectedSeatId: string | null,
): string | null {
  if (selectedSeatId !== null) return null;
  if (instanceId === undefined) return null;
  return seats[instanceId]?.id ?? null;
}

/**
 * ホバー強調枠＋番号ラベルを描く座席を返す。俯瞰時（selectedSeatId===null）のみ有効で、
 * 一人称では視界を妨げないため常に null。R3F描画に依存しない純粋関数。
 */
export function getHoverHighlightSeat(
  seats: TheaterSeat[],
  highlightedSeatId: string | null,
  selectedSeatId: string | null,
): TheaterSeat | null {
  if (selectedSeatId !== null) return null;
  if (!highlightedSeatId) return null;
  return seats.find((s) => s.id === highlightedSeatId) ?? null;
}

export interface SeatMeshesProps {
  /** 座席データ一覧 */
  seats: TheaterSeat[];
  /** 選択中の座席ID */
  selectedSeatId: string | null;
  /** 強調表示する座席ID（ポインタホバー or キーボードフォーカス由来。2Dリストと相互連動） */
  highlightedSeatId: string | null;
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
      {/* Lambert(拡散のみ) → Standard(PBR)。強めた directional 光で微光沢と陰影が出る */}
      <meshStandardMaterial roughness={0.68} metalness={0.05} />
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

  // 色は座席データと選択状態に依存（背もたれは座面より一段暗い色を使う）
  useEffect(() => {
    if (!meshRef.current) return;
    seats.forEach((seat, i) => {
      meshRef.current!.setColorAt(i, getSeatBackColor(seat, selectedSeatId));
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
      <meshStandardMaterial roughness={0.72} metalness={0.05} />
    </instancedMesh>
  );
});
SeatBacks.displayName = 'SeatBacks';

/**
 * 座面下の台座（脚）のInstancedMesh。
 * 床(position_y)からクッション下端までを埋め、座席が床から浮いて見えるのを解消する。
 * 車椅子席は座席構造が無いため scale=0 で描かない。
 */
const SeatBases = memo<{ seats: TheaterSeat[] }>(function SeatBases({ seats }) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (!meshRef.current) return;
    seats.forEach((seat, i) => {
      // 台座中心 = 床 + 高さ/2（床からクッション下端 y+0.24 を埋める）
      tempObject.position.set(
        seat.position_x,
        seat.position_y + SEAT_BASE.height / 2,
        seat.position_z,
      );
      tempObject.rotation.set(0, 0, 0);
      const hidden = seat.seat_type === 'wheelchair';
      tempObject.scale.set(1, hidden ? 0 : 1, 1);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [seats, tempObject]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, seats.length]}
      frustumCulled={false}
      receiveShadow
    >
      {/* castShadow は付けない: 床際の小さな台座で影寄与は僅少、影マップ描画コストを抑える
          （CIのソフトウェアWebGLでの負荷/flaky化を避けるため。座面・背もたれのみ影を落とす） */}
      <boxGeometry
        args={[SEAT_BASE.width, SEAT_BASE.height, SEAT_BASE.depth]}
      />
      <meshStandardMaterial
        color={COLOR_FRAME}
        roughness={0.6}
        metalness={0.15}
      />
    </instancedMesh>
  );
});
SeatBases.displayName = 'SeatBases';

/**
 * 肘掛けバーのInstancedMesh（1席につき左右2本 = seats.length * 2 インスタンス）。
 * クッション両脇に置き、椅子のシルエットを立たせる。車椅子席は scale=0 で描かない。
 */
const SeatArmrests = memo<{ seats: TheaterSeat[] }>(function SeatArmrests({
  seats,
}) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (!meshRef.current) return;
    seats.forEach((seat, i) => {
      const hidden = seat.seat_type === 'wheelchair';
      // 肘掛け高さ = クッション上面のやや上（座面 y+0.3・厚み0.12 → 上面 y+0.36）
      const armY = seat.position_y + 0.42;
      [-ARMREST_OFFSET_X, ARMREST_OFFSET_X].forEach((dx, side) => {
        tempObject.position.set(
          seat.position_x + dx,
          armY,
          seat.position_z + 0.02,
        );
        tempObject.rotation.set(0, 0, 0);
        tempObject.scale.set(1, hidden ? 0 : 1, 1);
        tempObject.updateMatrix();
        meshRef.current!.setMatrixAt(i * 2 + side, tempObject.matrix);
      });
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [seats, tempObject]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, seats.length * 2]}
      frustumCulled={false}
    >
      {/* castShadow は付けない: 肘掛けは細く影寄与は僅少。影マップ描画のジオメトリを抑える
          （instance数は seats*2 と多いため、castShadow 除外の効果が大きい） */}
      <boxGeometry
        args={[SEAT_ARMREST.width, SEAT_ARMREST.height, SEAT_ARMREST.depth]}
      />
      <meshStandardMaterial
        color={COLOR_FRAME}
        roughness={0.55}
        metalness={0.15}
      />
    </instancedMesh>
  );
});
SeatArmrests.displayName = 'SeatArmrests';

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
  highlightedSeatId,
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
      const seatId = resolveHoverEmitId(
        seats,
        event.instanceId,
        selectedSeatId,
      );
      if (!seatId) return;
      document.body.style.cursor = 'pointer';
      onHoverSeat(seatId);
    },
    [seats, onHoverSeat, selectedSeatId],
  );

  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = 'auto';
    onHoverSeat(null);
  }, [onHoverSeat]);

  // 俯瞰ホバーで付与したグローバルカーソル(document.body)を確実に戻す。
  // R3F はポインタ移動時のみ再判定するため、席を静止クリックして一人称に入ると
  // onPointerOut が発火せず 'pointer' が残る。選択遷移時とアンマウント時に 'auto' へ戻す。
  useEffect(() => {
    if (selectedSeatId !== null) {
      document.body.style.cursor = 'auto';
    }
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [selectedSeatId]);

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
    () => getHoverHighlightSeat(seats, highlightedSeatId, selectedSeatId),
    [seats, highlightedSeatId, selectedSeatId],
  );

  return (
    <group>
      <SeatBases seats={seats} />
      <SeatArmrests seats={seats} />
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
