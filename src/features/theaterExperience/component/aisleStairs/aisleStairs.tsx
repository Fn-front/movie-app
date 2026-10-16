/**
 * AisleStairsコンポーネント
 * 縦通路の階段（踏面・蹴込み・蹴込みLED・段鼻ライン）＋手すり＋横通路の腰壁
 *
 * 実映画館の縦通路は滑らかなスロープではなく列ごとの段差に合わせた階段で、
 * 蹴込みに琥珀色のLED帯、段鼻に明るいラインが入る。階段沿いには手すりが立ち、
 * 横通路の前縁には腰壁（上端にキャップレール）がある。
 *
 * 既存の `SlopedFloorMesh` は通路部分も滑らかに補間しているため、階段はその上に
 * 乗せるだけでよく、床側の改修は不要。
 *
 * 配置計算は `utils/aisleGeometry`（純ロジック・単体テスト済み）に委譲する。
 */

'use client';

import { memo, useMemo, useRef, useEffect } from 'react';
import {
  Object3D,
  Color,
  type InstancedMesh as InstancedMeshType,
} from 'three';

import type { AisleStep, CrossAisleRail } from '../../utils/aisleGeometry';
import type { InteriorTheme } from '../../utils/theaterPalette';

/** 踏面の厚み (m) */
const TREAD_THICKNESS = 0.04;
/** 踏面を床から浮かせる量 (m)。傾斜床との Z-fighting を避ける */
const TREAD_LIFT = 0.002;
/** 蹴込みの厚み (m) */
const RISER_THICKNESS = 0.04;
/** 蹴込みLEDの高さ (m) */
const LED_HEIGHT = 0.04;
/** 段鼻ラインの断面 (m) */
const NOSING_SIZE = 0.03;

/** 手すりの高さ (m) */
const RAIL_HEIGHT = 0.9;
/** 手すり支柱の断面 (m) */
const POST_SIZE = 0.04;
/** 手すり笠木の断面 (m) */
const HANDRAIL_SIZE = 0.05;

/** 腰壁の高さ (m) */
const PARAPET_HEIGHT = 0.9;
/** 腰壁の厚み (m) */
const PARAPET_THICKNESS = 0.08;
/** 腰壁上端のキャップの高さ (m) */
const CAP_HEIGHT = 0.05;

/** 蹴込みLEDの色（琥珀）とHDR倍率 */
const COLOR_RISER_LED = '#ffb060';
const RISER_LED_HDR = 2.0;
/** 段鼻ラインの色（温白）とHDR倍率 */
const COLOR_NOSING = '#ffe8c4';
const NOSING_HDR = 1.6;

/** 蹴込みを持つ段だけを抜き出す */
function withRiser(steps: AisleStep[]): AisleStep[] {
  return steps.filter((s) => s.riseHeight > 0);
}

/**
 * 踏面（InstancedMesh）。
 *
 * 色は床と同じ `carpet.base` にする。当初は `carpet.motif` を使ったが、通路が
 * 金色の帯に見えて主張しすぎた。実機の通路も床と同じカーペットで、段の存在は
 * 段鼻ラインと蹴込みLEDが示している。
 */
const Treads = memo<{ theme: InteriorTheme; steps: AisleStep[] }>(
  function Treads({ theme, steps }) {
    const meshRef = useRef<InstancedMeshType>(null);
    const tempObject = useMemo(() => new Object3D(), []);

    useEffect(() => {
      if (!meshRef.current) return;
      steps.forEach((step, i) => {
        tempObject.position.set(
          step.centerX,
          step.topY + TREAD_LIFT + TREAD_THICKNESS / 2,
          step.centerZ,
        );
        tempObject.rotation.set(0, 0, 0);
        // 幅と奥行は段ごとに違うのでスケールで与える（基準は 1m 角）
        tempObject.scale.set(step.width, 1, step.depth);
        tempObject.updateMatrix();
        meshRef.current!.setMatrixAt(i, tempObject.matrix);
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
    }, [steps, tempObject]);

    if (steps.length === 0) return null;

    return (
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, steps.length]}
        frustumCulled={false}
        receiveShadow
      >
        {/* castShadow は付けない: 床際の薄い板で影寄与は僅少 */}
        <boxGeometry args={[1, TREAD_THICKNESS, 1]} />
        <meshStandardMaterial
          color={theme.carpet.base}
          roughness={0.9}
          metalness={0}
        />
      </instancedMesh>
    );
  },
);
Treads.displayName = 'Treads';

/** 蹴込み（InstancedMesh）。踏面の前端に立つ垂直面 */
const Risers = memo<{ theme: InteriorTheme; steps: AisleStep[] }>(
  function Risers({ theme, steps }) {
    const meshRef = useRef<InstancedMeshType>(null);
    const tempObject = useMemo(() => new Object3D(), []);

    useEffect(() => {
      if (!meshRef.current) return;
      steps.forEach((step, i) => {
        tempObject.position.set(
          step.centerX,
          step.topY - step.riseHeight / 2,
          step.riserZ,
        );
        tempObject.rotation.set(0, 0, 0);
        tempObject.scale.set(step.width, step.riseHeight, 1);
        tempObject.updateMatrix();
        meshRef.current!.setMatrixAt(i, tempObject.matrix);
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
    }, [steps, tempObject]);

    if (steps.length === 0) return null;

    return (
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, steps.length]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, RISER_THICKNESS]} />
        <meshStandardMaterial color={theme.dado} roughness={0.85} />
      </instancedMesh>
    );
  },
);
Risers.displayName = 'Risers';

/** 蹴込みLED（InstancedMesh）。蹴込み面の中ほどを走る琥珀の光帯 */
const RiserLeds = memo<{ steps: AisleStep[] }>(function RiserLeds({ steps }) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);
  const color = useMemo(
    () => new Color(COLOR_RISER_LED).multiplyScalar(RISER_LED_HDR),
    [],
  );

  useEffect(() => {
    if (!meshRef.current) return;
    steps.forEach((step, i) => {
      tempObject.position.set(
        step.centerX,
        step.topY - step.riseHeight / 2,
        step.riserZ + RISER_THICKNESS / 2,
      );
      tempObject.rotation.set(0, 0, 0);
      // 通路幅いっぱいに広げず、やや内側に収める
      tempObject.scale.set(step.width * 0.8, 1, 1);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [steps, tempObject]);

  if (steps.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, steps.length]}
      frustumCulled={false}
    >
      <boxGeometry args={[1, LED_HEIGHT, 0.02]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </instancedMesh>
  );
});
RiserLeds.displayName = 'RiserLeds';

/** 段鼻ライン（InstancedMesh）。踏面の前端を縁取る細い光帯 */
const Nosings = memo<{ steps: AisleStep[] }>(function Nosings({ steps }) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);
  const color = useMemo(
    () => new Color(COLOR_NOSING).multiplyScalar(NOSING_HDR),
    [],
  );

  useEffect(() => {
    if (!meshRef.current) return;
    steps.forEach((step, i) => {
      tempObject.position.set(
        step.centerX,
        step.topY + TREAD_LIFT + TREAD_THICKNESS,
        step.riserZ,
      );
      tempObject.rotation.set(0, 0, 0);
      tempObject.scale.set(step.width * 0.9, 1, 1);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [steps, tempObject]);

  if (steps.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, steps.length]}
      frustumCulled={false}
    >
      <boxGeometry args={[1, NOSING_SIZE, NOSING_SIZE]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </instancedMesh>
  );
});
Nosings.displayName = 'Nosings';

/**
 * 手すりの支柱（InstancedMesh）。
 * 段ごとに、通路の座席ブロック側の縁へ1本ずつ立てる。
 */
const RailPosts = memo<{
  theme: InteriorTheme;
  steps: AisleStep[];
  /** 支柱を立てる側のオフセット符号（通路中心からの向き） */
  sideSign: number;
}>(function RailPosts({ theme, steps, sideSign }) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (!meshRef.current) return;
    steps.forEach((step, i) => {
      tempObject.position.set(
        step.centerX + (sideSign * step.width) / 2,
        step.topY + RAIL_HEIGHT / 2,
        step.centerZ,
      );
      tempObject.rotation.set(0, 0, 0);
      tempObject.scale.set(1, 1, 1);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [steps, sideSign, tempObject]);

  if (steps.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, steps.length]}
      frustumCulled={false}
    >
      <boxGeometry args={[POST_SIZE, RAIL_HEIGHT, POST_SIZE]} />
      <meshStandardMaterial
        color={theme.speaker.cabinet}
        roughness={0.4}
        metalness={0.6}
      />
    </instancedMesh>
  );
});
RailPosts.displayName = 'RailPosts';

/**
 * 手すりの笠木（InstancedMesh）。
 * 支柱の上端を結ぶ。段の勾配に沿わせるため、段ごとに短い区間を傾けて置く。
 */
const Handrails = memo<{
  theme: InteriorTheme;
  steps: AisleStep[];
  sideSign: number;
}>(function Handrails({ theme, steps, sideSign }) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (!meshRef.current) return;
    steps.forEach((step, i) => {
      // この段の上端から次の段の上端へ向かう区間を1本で表す
      const next = steps[i + 1];
      const dz = next ? next.centerZ - step.centerZ : -step.depth;
      const dy = next ? next.topY - step.topY : 0;
      const length = Math.hypot(dz, dy);

      tempObject.position.set(
        step.centerX + (sideSign * step.width) / 2,
        step.topY + RAIL_HEIGHT + dy / 2,
        step.centerZ + dz / 2,
      );
      // YZ平面内での傾き（X軸まわりの回転）
      tempObject.rotation.set(Math.atan2(dy, dz), 0, 0);
      tempObject.scale.set(1, 1, length);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [steps, sideSign, tempObject]);

  if (steps.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, steps.length]}
      frustumCulled={false}
    >
      <boxGeometry args={[HANDRAIL_SIZE, HANDRAIL_SIZE, 1]} />
      <meshStandardMaterial
        color={theme.speaker.cabinet}
        roughness={0.35}
        metalness={0.7}
      />
    </instancedMesh>
  );
});
Handrails.displayName = 'Handrails';

/** 横通路の腰壁（本体＋キャップ） */
const CrossAisleParapets = memo<{
  theme: InteriorTheme;
  rails: CrossAisleRail[];
}>(function CrossAisleParapets({ theme, rails }) {
  const bodyRef = useRef<InstancedMeshType>(null);
  const capRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  useEffect(() => {
    rails.forEach((rail, i) => {
      if (bodyRef.current) {
        tempObject.position.set(
          rail.centerX,
          rail.baseY + PARAPET_HEIGHT / 2,
          rail.z,
        );
        tempObject.rotation.set(0, 0, 0);
        tempObject.scale.set(rail.width, 1, 1);
        tempObject.updateMatrix();
        bodyRef.current.setMatrixAt(i, tempObject.matrix);
      }
      if (capRef.current) {
        tempObject.position.set(
          rail.centerX,
          rail.baseY + PARAPET_HEIGHT + CAP_HEIGHT / 2,
          rail.z,
        );
        tempObject.rotation.set(0, 0, 0);
        tempObject.scale.set(rail.width, 1, 1);
        tempObject.updateMatrix();
        capRef.current.setMatrixAt(i, tempObject.matrix);
      }
    });
    if (bodyRef.current) bodyRef.current.instanceMatrix.needsUpdate = true;
    if (capRef.current) capRef.current.instanceMatrix.needsUpdate = true;
  }, [rails, tempObject]);

  if (rails.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={bodyRef}
        args={[undefined, undefined, rails.length]}
        frustumCulled={false}
        receiveShadow
      >
        <boxGeometry args={[1, PARAPET_HEIGHT, PARAPET_THICKNESS]} />
        <meshStandardMaterial color={theme.dado} roughness={0.85} />
      </instancedMesh>
      {/* 上端のキャップレール（参考写真の木製キャップに相当。一段明るい） */}
      <instancedMesh
        ref={capRef}
        args={[undefined, undefined, rails.length]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, CAP_HEIGHT, PARAPET_THICKNESS * 1.3]} />
        <meshStandardMaterial
          color={theme.relief}
          roughness={0.6}
          metalness={0.1}
        />
      </instancedMesh>
    </group>
  );
});
CrossAisleParapets.displayName = 'CrossAisleParapets';

export interface AisleStairsProps {
  /** 内装テーマ */
  theme: InteriorTheme;
  /** 縦通路の階段 */
  steps: AisleStep[];
  /** 横通路の腰壁 */
  rails: CrossAisleRail[];
  /** 手すりを立てる通路の階段（サイド通路は壁が役目を果たすので含めない） */
  railedSteps: AisleStep[];
}

export const AisleStairs = memo<AisleStairsProps>(function AisleStairs({
  theme,
  steps,
  rails,
  railedSteps,
}) {
  const risered = useMemo(() => withRiser(steps), [steps]);

  return (
    <group>
      <Treads theme={theme} steps={steps} />
      <Risers theme={theme} steps={risered} />
      <RiserLeds steps={risered} />
      <Nosings steps={risered} />
      {/* 手すりは通路の両側に立てる */}
      <RailPosts theme={theme} steps={railedSteps} sideSign={-1} />
      <RailPosts theme={theme} steps={railedSteps} sideSign={1} />
      <Handrails theme={theme} steps={railedSteps} sideSign={-1} />
      <Handrails theme={theme} steps={railedSteps} sideSign={1} />
      <CrossAisleParapets theme={theme} rails={rails} />
    </group>
  );
});

AisleStairs.displayName = 'AisleStairs';
