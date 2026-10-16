/**
 * ScreenMeshコンポーネント
 * スクリーン矩形メッシュ + ベゼル（暗いフレーム）
 * 本体は投影風シェーダー（screenVertex/screenFragment）で「上映中の幕」を表現する。
 * prefers-reduced-motion 有効時はアニメ（フリッカー含む）を停止する。
 */

'use client';

import { memo, useMemo, useRef } from 'react';
import { Color, DoubleSide, Vector2 } from 'three';
import type { ShaderMaterial } from 'three';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';

import { screenVertexShader } from '../../shaders/screenVertex';
import { screenFragmentShader } from '../../shaders/screenFragment';
import type { InteriorTheme } from '../../utils/theaterPalette';
import {
  PERFORATION_TILE_METERS,
  getScreenPerforationTexture,
} from '../../utils/theaterTextures';

/**
 * 黒マスキングの太さ (m)。
 * 旧値 0.08 は実機の黒マスキング（0.3〜0.5m級）に対して細すぎ、幕と壁の境界が
 * 曖昧だった。太らせて幕を引き立てる。
 */
const BEZEL_THICKNESS = 0.35;
/** ベゼルの奥行き (m) */
const BEZEL_DEPTH = 0.05;
/** 黒マスキングの色（実機の遮光マスキングに寄せた純黒寄り） */
const BEZEL_COLOR = '#060608';
/** 幕外周の発光フレームの幅 (m)。Dolby Cinema の青い縁取り */
const GLOW_WIDTH = 0.12;
/** 発光フレームの HDR 倍率 */
const GLOW_HDR = 2.2;

export interface ScreenMeshProps {
  /** 内装テーマ（幕外周の発光フレーム色） */
  theme: InteriorTheme;
  /** スクリーン幅 (m) */
  width: number;
  /** スクリーン高さ (m) */
  height: number;
  /** スクリーン中心X座標 */
  centerX: number;
  /** スクリーン中心Y座標 */
  centerY: number;
  /** スクリーン中心Z座標 */
  centerZ: number;
  /** prefers-reduced-motion 有効時は true（投影アニメを停止する） */
  reducedMotion?: boolean;
}

/**
 * 投影シェーダーの経過時間を進める。
 * reducedMotion 有効時は現在値を維持してアニメ（12Hzフリッカー含む）を停止する
 * （WCAG 2.3.1 点滅/発作、prefers-reduced-motion への配慮）。
 */
export function advanceScreenTime(
  current: number,
  delta: number,
  reducedMotion: boolean,
): number {
  return reducedMotion ? current : current + delta;
}

export const ScreenMesh = memo<ScreenMeshProps>(function ScreenMesh({
  theme,
  width,
  height,
  centerX,
  centerY,
  centerZ,
  reducedMotion = false,
}) {
  const halfW = width / 2;
  const halfH = height / 2;

  const materialRef = useRef<ShaderMaterial>(null);
  /**
   * パーフォレーションは実寸基準でタイリングする（幕のサイズが変わっても孔の
   * 大きさが変わらないようにする）。
   */
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPerfMap: { value: getScreenPerforationTexture() },
      uPerfRepeat: {
        value: new Vector2(
          width / PERFORATION_TILE_METERS,
          height / PERFORATION_TILE_METERS,
        ),
      },
    }),
    [width, height],
  );

  /** 幕外周の発光フレーム（screenGlow を持つフォーマットのみ） */
  const glowColor = useMemo(
    () =>
      theme.screenGlow
        ? new Color(theme.screenGlow).multiplyScalar(GLOW_HDR)
        : null,
    [theme.screenGlow],
  );

  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.uTime.value = advanceScreenTime(
      material.uniforms.uTime.value,
      delta,
      reducedMotion,
    );
  });

  return (
    /*
      スクリーンZを後壁から 0.1m 手前にオフセットして Z-fighting を回避。
      後壁はシーンの halfDepth (= room_depth/2) 位置にあり、screen_center_z が
      同じ値だと両者が同一平面に重なってシマ模様のアーティファクトが発生する。
    */
    <group position={[centerX, centerY, centerZ - 0.1]}>
      {/* スクリーン本体（投影風シェーダー） */}
      <mesh>
        <planeGeometry args={[width, height]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={screenVertexShader}
          fragmentShader={screenFragmentShader}
          uniforms={uniforms}
          side={DoubleSide}
          toneMapped={false}
        />
        <Edges color={BEZEL_COLOR} lineWidth={1.5} />
      </mesh>

      {/* ベゼル（上） */}
      <mesh position={[0, halfH + BEZEL_THICKNESS / 2, -BEZEL_DEPTH / 2]}>
        <boxGeometry
          args={[width + BEZEL_THICKNESS * 2, BEZEL_THICKNESS, BEZEL_DEPTH]}
        />
        <meshLambertMaterial color={BEZEL_COLOR} />
        <Edges color={BEZEL_COLOR} lineWidth={1} />
      </mesh>

      {/* ベゼル（下） */}
      <mesh position={[0, -halfH - BEZEL_THICKNESS / 2, -BEZEL_DEPTH / 2]}>
        <boxGeometry
          args={[width + BEZEL_THICKNESS * 2, BEZEL_THICKNESS, BEZEL_DEPTH]}
        />
        <meshLambertMaterial color={BEZEL_COLOR} />
        <Edges color={BEZEL_COLOR} lineWidth={1} />
      </mesh>

      {/* ベゼル（左） */}
      <mesh position={[-halfW - BEZEL_THICKNESS / 2, 0, -BEZEL_DEPTH / 2]}>
        <boxGeometry args={[BEZEL_THICKNESS, height, BEZEL_DEPTH]} />
        <meshLambertMaterial color={BEZEL_COLOR} />
        <Edges color={BEZEL_COLOR} lineWidth={1} />
      </mesh>

      {/* ベゼル（右） */}
      <mesh position={[halfW + BEZEL_THICKNESS / 2, 0, -BEZEL_DEPTH / 2]}>
        <boxGeometry args={[BEZEL_THICKNESS, height, BEZEL_DEPTH]} />
        <meshLambertMaterial color={BEZEL_COLOR} />
        <Edges color={BEZEL_COLOR} lineWidth={1} />
      </mesh>

      {/*
        幕外周の発光フレーム（Dolby Cinema の青い縁取り）。
        黒マスキングのさらに外側を四辺で囲う。HDR＋toneMapped=false で Bloom に乗せ、
        点滅はさせない（WCAG 2.3.1）。screenGlow を持たないフォーマットでは描かない。
      */}
      {glowColor && (
        <group>
          {[1, -1].map((sign) => (
            <mesh
              key={`glow-h-${sign}`}
              position={[
                0,
                sign * (halfH + BEZEL_THICKNESS + GLOW_WIDTH / 2),
                -BEZEL_DEPTH / 2,
              ]}
            >
              <boxGeometry
                args={[
                  width + (BEZEL_THICKNESS + GLOW_WIDTH) * 2,
                  GLOW_WIDTH,
                  BEZEL_DEPTH,
                ]}
              />
              <meshBasicMaterial color={glowColor} toneMapped={false} />
            </mesh>
          ))}
          {[1, -1].map((sign) => (
            <mesh
              key={`glow-v-${sign}`}
              position={[
                sign * (halfW + BEZEL_THICKNESS + GLOW_WIDTH / 2),
                0,
                -BEZEL_DEPTH / 2,
              ]}
            >
              <boxGeometry
                args={[GLOW_WIDTH, height + BEZEL_THICKNESS * 2, BEZEL_DEPTH]}
              />
              <meshBasicMaterial color={glowColor} toneMapped={false} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
});

ScreenMesh.displayName = 'ScreenMesh';
