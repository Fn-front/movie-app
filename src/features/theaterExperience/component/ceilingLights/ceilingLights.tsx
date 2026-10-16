/**
 * CeilingLightsコンポーネント
 * 天井の埋込ダウンライト（格子配置の小さな発光円盤）
 *
 * 参考写真ではどの劇場も、暗い天井にダウンライトが格子状に並んでいる。
 * 発光体は既存の通路灯・段差LEDと同じ作法（HDR＋toneMapped=false）で Bloom に乗せる。
 * 点滅はさせない（WCAG 2.3.1）。
 *
 * 天井面（片面の planeGeometry）は俯瞰でカリングされるが、灯体は立体なので
 * カリングされず俯瞰でも見える。壁の造作と違って客席の手前には来ないため
 * 遮蔽の問題がなく、俯瞰では暗い天井面に光点が散る演出として機能する。
 */

'use client';

import { memo, useMemo, useRef, useEffect } from 'react';
import {
  Object3D,
  Color,
  type InstancedMesh as InstancedMeshType,
} from 'three';

import type { InteriorTheme } from '../../utils/theaterPalette';
import {
  computeCeilingLightPlacements,
  computeCeilingReflectorPlacements,
  isWallHiddenInOverview,
} from '../../utils/wallGeometry';

/** ダウンライトの間隔 (m) */
const LIGHT_SPACING = 2.5;
/** 発光円盤の半径 (m) */
const LIGHT_RADIUS = 0.09;
/** 発光円盤の厚み (m) */
const LIGHT_THICKNESS = 0.02;
/** 天井面から下げる量 (m)。天井との Z-fighting を避ける */
const CEILING_DROP = 0.02;
/** HDR 倍率（コーブ照明より控えめ。点光が主張しすぎないようにする） */
const LIGHT_HDR_SCALE = 1.5;

/** 湾曲リフレクター器具の間隔 (m) */
const REFLECTOR_SPACING = 2.5;
/** リフレクターの外径・管径・円弧の長さ（rad） */
const REFLECTOR_RADIUS = 0.3;
const REFLECTOR_TUBE = 0.055;
const REFLECTOR_ARC = Math.PI * 0.55;
/** リフレクターを天井から下げる量 (m) */
const REFLECTOR_DROP = 0.25;
/** リフレクターの HDR 倍率（ダウンライトより明るい主照明） */
const REFLECTOR_HDR_SCALE = 1.9;

export interface CeilingLightsProps {
  /** 内装テーマ */
  theme: InteriorTheme;
  /** 一人称視点か（俯瞰では手前側の側壁のリフレクターを描かない） */
  isFirstPerson: boolean;
  /** 劇場の幅 (m) */
  roomWidth: number;
  /** 劇場の奥行 (m) */
  roomDepth: number;
  /** 劇場の高さ (m) */
  roomHeight: number;
}

/**
 * 天井の湾曲リフレクター照明（InstancedMesh）。
 *
 * TCX（日比谷）の写真では天井際に金色の湾曲したリフレクター器具が側壁に沿って
 * 並んでいる。平らな円盤のダウンライトとは別器具なので、側壁沿いにのみ置く。
 *
 * 形状は `TorusGeometry` の部分円弧。凹面を室内へ向けるため、配置計算が返す yaw で
 * 回したうえで、円弧の開口が下を向くよう X 軸まわりに倒す。
 */
const CeilingReflectors = memo<{
  theme: InteriorTheme;
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
  isFirstPerson: boolean;
}>(function CeilingReflectors({
  theme,
  roomWidth,
  roomDepth,
  roomHeight,
  isFirstPerson,
}) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  /*
    俯瞰では手前側（+X）の側壁の器具を描かない。

    壁本体は片面の planeGeometry なのでカリングされるが、リフレクターは立体なので
    カリングされず、そのまま描くと手前側の器具が客席の上に浮いて見える
    （壁の造作で同じ問題に対処したのと同根）。一人称では室内から見るため全数描く。
  */
  const reflectors = useMemo(() => {
    const all = computeCeilingReflectorPlacements(
      roomWidth,
      roomDepth,
      REFLECTOR_SPACING,
    );
    if (isFirstPerson) return all;
    // リフレクターは側壁沿いにしか無く z 方向のカリングは不要なので z には 0 を渡す
    return all.filter((r) => !isWallHiddenInOverview(r.x, 0));
  }, [roomWidth, roomDepth, isFirstPerson]);

  const color = useMemo(
    () => new Color(theme.cove).multiplyScalar(REFLECTOR_HDR_SCALE),
    [theme.cove],
  );

  useEffect(() => {
    if (!meshRef.current) return;
    const y = roomHeight - REFLECTOR_DROP;
    reflectors.forEach((r, i) => {
      tempObject.position.set(r.x, y, r.z);
      // 円弧の開口を下向きにしつつ、壁に沿う向きへ回す
      tempObject.rotation.set(Math.PI / 2, r.yaw, 0);
      tempObject.scale.set(1, 1, 1);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [reflectors, roomHeight, tempObject]);

  if (reflectors.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, reflectors.length]}
      frustumCulled={false}
    >
      {/* args=[radius, tube, radialSegments, tubularSegments, arc] */}
      <torusGeometry
        args={[REFLECTOR_RADIUS, REFLECTOR_TUBE, 6, 12, REFLECTOR_ARC]}
      />
      <meshBasicMaterial color={color} toneMapped={false} />
    </instancedMesh>
  );
});
CeilingReflectors.displayName = 'CeilingReflectors';

/**
 * 天井の埋込ダウンライト（InstancedMesh）。
 * 客席の手前には来ないため、俯瞰でも全数描いて問題ない。
 */
const CeilingDownlights = memo<{
  theme: InteriorTheme;
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
}>(function CeilingDownlights({ theme, roomWidth, roomDepth, roomHeight }) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  const lights = useMemo(
    () => computeCeilingLightPlacements(roomWidth, roomDepth, LIGHT_SPACING),
    [roomWidth, roomDepth],
  );

  const color = useMemo(
    () => new Color(theme.cove).multiplyScalar(LIGHT_HDR_SCALE),
    [theme.cove],
  );

  useEffect(() => {
    if (!meshRef.current) return;
    const y = roomHeight - CEILING_DROP;
    lights.forEach((light, i) => {
      tempObject.position.set(light.x, y, light.z);
      tempObject.rotation.set(0, 0, 0);
      tempObject.scale.set(1, 1, 1);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [lights, roomHeight, tempObject]);

  if (lights.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, lights.length]}
      frustumCulled={false}
    >
      {/* 軸が +Y の薄い円柱＝下から見ると円盤。castShadow は付けない */}
      <cylinderGeometry
        args={[LIGHT_RADIUS, LIGHT_RADIUS, LIGHT_THICKNESS, 10]}
      />
      <meshBasicMaterial color={color} toneMapped={false} />
    </instancedMesh>
  );
});
CeilingDownlights.displayName = 'CeilingDownlights';

/**
 * 天井照明をまとめる。ダウンライトとリフレクターはどちらも葉コンポーネントとして
 * 空配列時に null を返す形に揃えている。
 */
export const CeilingLights = memo<CeilingLightsProps>(function CeilingLights({
  theme,
  isFirstPerson,
  roomWidth,
  roomDepth,
  roomHeight,
}) {
  return (
    <group>
      <CeilingDownlights
        theme={theme}
        roomWidth={roomWidth}
        roomDepth={roomDepth}
        roomHeight={roomHeight}
      />
      <CeilingReflectors
        theme={theme}
        roomWidth={roomWidth}
        roomDepth={roomDepth}
        roomHeight={roomHeight}
        isFirstPerson={isFirstPerson}
      />
    </group>
  );
});

CeilingLights.displayName = 'CeilingLights';
