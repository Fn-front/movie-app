/**
 * 視野・歪み計算ユーティリティ
 *
 * 設計書 Section 4 の見え方計算。
 */

import type { FieldOfViewMetrics } from '../types';

/** 2D座標 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * 水平視野角（ラジアン）
 * θ_h = 2 * atan((screen_width / 2) / distance)
 */
export function calcHorizontalFov(
  screenWidth: number,
  distance: number,
): number {
  if (distance <= 0) return 0;
  return 2 * Math.atan(screenWidth / 2 / distance);
}

/**
 * 垂直視野角（ラジアン）
 * θ_v = 2 * atan((screen_height / 2) / distance)
 */
export function calcVerticalFov(
  screenHeight: number,
  distance: number,
): number {
  if (distance <= 0) return 0;
  return 2 * Math.atan(screenHeight / 2 / distance);
}

/**
 * 視野占有率を計算する
 * ratio = θ / π（人間の視野約180度で正規化）
 */
export function calcFovRatios(
  screenWidth: number,
  screenHeight: number,
  distance: number,
): { horizontal_ratio: number; vertical_ratio: number } {
  const hFov = calcHorizontalFov(screenWidth, distance);
  const vFov = calcVerticalFov(screenHeight, distance);
  return {
    horizontal_ratio: hFov / Math.PI,
    vertical_ratio: vFov / Math.PI,
  };
}

/**
 * 歪みスコア（0〜1）
 * 座席のX座標とスクリーン中心Xの差をスクリーン幅の半分で正規化。
 * 中央=0、端=1。
 */
export function calcDistortionScore(
  seatX: number,
  screenCenterX: number,
  screenWidth: number,
): number {
  if (screenWidth <= 0) return 0;
  const offset = Math.abs(seatX - screenCenterX);
  return Math.min(offset / (screenWidth / 2), 1);
}

/**
 * 座席からスクリーンまでのZ方向の距離を計算する
 */
export function calcDistanceToScreen(
  seatZ: number,
  screenCenterZ: number,
): number {
  return Math.abs(screenCenterZ - seatZ);
}

/**
 * 視野占有率メトリクスを一括計算する
 */
export function calcFieldOfViewMetrics(
  seat: { position_x: number; position_z: number },
  screen: {
    width: number;
    height: number;
    center_x: number;
    center_z: number;
  },
): FieldOfViewMetrics {
  const distance = calcDistanceToScreen(seat.position_z, screen.center_z);
  const ratios = calcFovRatios(screen.width, screen.height, distance);
  const distortion = calcDistortionScore(
    seat.position_x,
    screen.center_x,
    screen.width,
  );

  return {
    horizontal_ratio: ratios.horizontal_ratio,
    vertical_ratio: ratios.vertical_ratio,
    distance_to_screen: distance,
    distortion_score: distortion,
  };
}

/**
 * スクリーン四隅を座席視点で2D平面に投影する
 * → 台形歪みプレビュー用
 *
 * スクリーンは +Z 方向（前方）を向いていると仮定。
 * 座席視点からの見かけの角度で四隅を2D座標に変換する。
 *
 * @returns [左上, 右上, 右下, 左下] の2D座標
 */
export function projectScreenQuad(
  seat: { x: number; y: number; z: number },
  screen: {
    width: number;
    height: number;
    center_x: number;
    center_y: number;
    center_z: number;
  },
): [Point2D, Point2D, Point2D, Point2D] {
  const halfW = screen.width / 2;
  const halfH = screen.height / 2;

  // スクリーン四隅の3D座標
  const corners3D = [
    {
      x: screen.center_x - halfW,
      y: screen.center_y + halfH,
      z: screen.center_z,
    }, // 左上
    {
      x: screen.center_x + halfW,
      y: screen.center_y + halfH,
      z: screen.center_z,
    }, // 右上
    {
      x: screen.center_x + halfW,
      y: screen.center_y - halfH,
      z: screen.center_z,
    }, // 右下
    {
      x: screen.center_x - halfW,
      y: screen.center_y - halfH,
      z: screen.center_z,
    }, // 左下
  ];

  // 座席視点での透視投影（簡易版）
  const dz = screen.center_z - seat.z;
  if (dz <= 0) {
    // スクリーンが座席の後ろにある場合はゼロ
    return [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
  }

  return corners3D.map((corner) => {
    const dx = corner.x - seat.x;
    const dy = corner.y - seat.y;
    const cornerDz = corner.z - seat.z;
    // 透視除算: 角度ベースの2D射影
    return {
      x: Math.atan2(dx, cornerDz),
      y: Math.atan2(dy, cornerDz),
    };
  }) as [Point2D, Point2D, Point2D, Point2D];
}
