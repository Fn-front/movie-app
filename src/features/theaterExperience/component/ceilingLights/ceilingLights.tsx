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
import { computeCeilingLightPlacements } from '../../utils/wallGeometry';

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

export interface CeilingLightsProps {
  /** 内装テーマ */
  theme: InteriorTheme;
  /** 劇場の幅 (m) */
  roomWidth: number;
  /** 劇場の奥行 (m) */
  roomDepth: number;
  /** 劇場の高さ (m) */
  roomHeight: number;
}

export const CeilingLights = memo<CeilingLightsProps>(function CeilingLights({
  theme,
  roomWidth,
  roomDepth,
  roomHeight,
}) {
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

CeilingLights.displayName = 'CeilingLights';
