/**
 * ScreenMeshコンポーネント
 * スクリーン矩形メッシュ + ベゼル（暗いフレーム）
 * 本体は投影風シェーダー（screenVertex/screenFragment）で「上映中の幕」を表現する。
 * prefers-reduced-motion 有効時はアニメ（フリッカー含む）を停止する。
 */

'use client';

import { memo, useMemo, useRef } from 'react';
import { Color, DoubleSide, PlaneGeometry, Vector2 } from 'three';
import type { ShaderMaterial } from 'three';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';

import { screenVertexShader } from '../../shaders/screenVertex';
import { screenFragmentShader } from '../../shaders/screenFragment';
import type { InteriorTheme } from '../../utils/theaterPalette';
import { calcScreenArcPoint, isCurvedScreen } from '../../utils/screenCurve';
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

/**
 * 弧に沿って頂点変位させた板のジオメトリを作る。
 *
 * 幕本体と上下のマスキングで共用する。湾曲時に上下のマスキングを直線の箱のままに
 * すると、弧から外れて飛び出してしまうため。
 *
 * UVは変えないので、幕本体に貼る投影シェーダー（vUv ベース）はそのまま動く。
 * 平面時は分割不要なので 1x1 セグメントで返す（頂点数を増やさない）。
 *
 * @param stripWidth 板の幅（弧長として扱う）
 * @param stripHeight 板の高さ
 * @param curvature 湾曲半径 (m)。0 なら平面
 */
function createArcStrip(
  stripWidth: number,
  stripHeight: number,
  curvature: number,
): PlaneGeometry {
  if (!isCurvedScreen(curvature)) {
    return new PlaneGeometry(stripWidth, stripHeight);
  }
  // 弧を滑らかに見せるぶんだけ横方向を分割する（幅1mあたり1分割、8〜32の範囲）
  const segments = Math.min(32, Math.max(8, Math.round(stripWidth)));
  const geo = new PlaneGeometry(stripWidth, stripHeight, segments, 1);
  const posAttr = geo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    // localX は -stripWidth/2 .. +stripWidth/2（幕に沿った弧長として扱う）
    const point = calcScreenArcPoint(posAttr.getX(i), 0, 0, curvature);
    posAttr.setX(i, point.x);
    posAttr.setZ(i, point.z);
  }
  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export interface ScreenMeshProps {
  /** 内装テーマ（幕外周の発光フレーム色） */
  theme: InteriorTheme;
  /** 湾曲半径 (m)。0 なら平面（IMAX のみ値を持つ） */
  curvature: number;
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
  curvature,
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

  /** 幕の左右端の位置（group ローカル。平面なら ±halfW / z=0） */
  const leftEdge = useMemo(
    () => calcScreenArcPoint(-width / 2, 0, 0, curvature),
    [width, curvature],
  );
  const rightEdge = useMemo(
    () => calcScreenArcPoint(width / 2, 0, 0, curvature),
    [width, curvature],
  );

  /** 幕本体のジオメトリ（湾曲時は弧に沿う） */
  const screenGeometry = useMemo(
    () => createArcStrip(width, height, curvature),
    [width, height, curvature],
  );

  /** 上下マスキングのジオメトリ（幕より左右へベゼル分はみ出す） */
  const horizontalBezelGeometry = useMemo(
    () =>
      createArcStrip(width + BEZEL_THICKNESS * 2, BEZEL_THICKNESS, curvature),
    [width, curvature],
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
      {/* スクリーン本体（投影風シェーダー）。湾曲時は頂点を弧上へ変位させる */}
      <mesh geometry={screenGeometry}>
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

      {/* ベゼル（上）。湾曲時は幕と同じ弧に沿わせる（直線の箱だと弧から飛び出す） */}
      <mesh
        geometry={horizontalBezelGeometry}
        position={[0, halfH + BEZEL_THICKNESS / 2, 0]}
      >
        <meshLambertMaterial color={BEZEL_COLOR} side={DoubleSide} />
      </mesh>

      {/* ベゼル（下） */}
      <mesh
        geometry={horizontalBezelGeometry}
        position={[0, -halfH - BEZEL_THICKNESS / 2, 0]}
      >
        <meshLambertMaterial color={BEZEL_COLOR} side={DoubleSide} />
      </mesh>

      {/* ベゼル（左）。湾曲時は弧の端点に合わせて客席側へ寄せる */}
      <mesh
        position={[
          leftEdge.x - BEZEL_THICKNESS / 2,
          0,
          leftEdge.z - BEZEL_DEPTH / 2,
        ]}
      >
        <boxGeometry args={[BEZEL_THICKNESS, height, BEZEL_DEPTH]} />
        <meshLambertMaterial color={BEZEL_COLOR} />
        <Edges color={BEZEL_COLOR} lineWidth={1} />
      </mesh>

      {/* ベゼル（右）。湾曲時は弧の端点に合わせて客席側へ寄せる */}
      <mesh
        position={[
          rightEdge.x + BEZEL_THICKNESS / 2,
          0,
          rightEdge.z - BEZEL_DEPTH / 2,
        ]}
      >
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
