/**
 * 視野・歪み計算ユーティリティ
 *
 * 設計書 Section 4 の見え方計算。
 * メトリクス（距離・視野占有率・歪み）は座席の3D位置(X/Y/Z)を考慮するため、
 * 同一列でも中央席と端席で値に差が出る。
 */

import type { FieldOfViewMetrics } from '../types';

/** 2D座標 */
export interface Point2D {
  x: number;
  y: number;
}

/** 3D座標 */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * 座席からスクリーン中心までの3Dユークリッド距離。
 * 水平オフセット(X)と高さ(Y)も含むため、同一列でも端席ほど距離が大きくなり、
 * スクリーンが高い位置にある前列では床上の見た目より距離が長くなる。
 */
export function calcDistance3D(seat: Point3D, screenCenter: Point3D): number {
  const dx = seat.x - screenCenter.x;
  const dy = seat.y - screenCenter.y;
  const dz = seat.z - screenCenter.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 座席からスクリーン平面までのZ方向（前後）距離。
 * カメラの前方距離など「スクリーン平面までの垂直距離」が必要な箇所で使う
 * （首振り注視点の計算等）。占有率・歪みの計算には calcDistance3D 等を使う。
 */
export function calcDistanceToScreen(
  seatZ: number,
  screenCenterZ: number,
): number {
  return Math.abs(screenCenterZ - seatZ);
}

/**
 * 視野占有率（水平・垂直, 0〜1）を座席の3D位置から計算する。
 *
 * スクリーンの端が座席から見込む角度(subtense)を求め、人間の視野 π(=180°)で
 * 正規化する。座席がスクリーン中心から左右にずれるほど水平の見込み角は
 * 小さくなる（横長スクリーンを斜めから見るため）ので、同一列でも端席は
 * 占有率が下がる。
 */
export function calcViewingFovRatios(
  seat: Point3D,
  screen: {
    width: number;
    height: number;
    center_x: number;
    center_y: number;
    center_z: number;
  },
): { horizontal_ratio: number; vertical_ratio: number } {
  const halfW = screen.width / 2;
  const halfH = screen.height / 2;
  const dz = screen.center_z - seat.z;
  if (dz <= 0) return { horizontal_ratio: 0, vertical_ratio: 0 };

  // 水平: スクリーン左右端の見込み角の差（水平面で計算）
  const dxLeft = screen.center_x - halfW - seat.x;
  const dxRight = screen.center_x + halfW - seat.x;
  const hAngle = Math.atan2(dxRight, dz) - Math.atan2(dxLeft, dz);

  // 垂直: 水平面内の距離を実効距離として上下端の見込み角の差を計算
  const dx = screen.center_x - seat.x;
  const horizDist = Math.sqrt(dx * dx + dz * dz);
  const dyTop = screen.center_y + halfH - seat.y;
  const dyBottom = screen.center_y - halfH - seat.y;
  const vAngle = Math.atan2(dyTop, horizDist) - Math.atan2(dyBottom, horizDist);

  return {
    horizontal_ratio: Math.abs(hAngle) / Math.PI,
    vertical_ratio: Math.abs(vAngle) / Math.PI,
  };
}

/**
 * 歪みスコア（0〜1）。座席からスクリーンを見る視線が「正対」からどれだけ
 * 外れているか（＝台形歪みの強さ）を、水平の斜め角と垂直の見上げ角の合計を
 * 90°で正規化して表す。中央=0に近く、端・前列ほど大きい。
 * - 水平成分: スクリーン中心からの左右ズレ（端席ほど大）
 * - 垂直成分(keystone): スクリーンを見上げる角度。前列ほど近く見上げが急に
 *   なるため距離依存で大きくなる。
 */
export function calcViewingDistortion(
  seat: Point3D,
  screenCenter: Point3D,
): number {
  const dz = screenCenter.z - seat.z;
  if (dz <= 0) return 0;
  const dx = screenCenter.x - seat.x;
  const dy = screenCenter.y - seat.y;
  const horizObliqueness = Math.atan2(Math.abs(dx), dz);
  const horizDist = Math.sqrt(dx * dx + dz * dz);
  const verticalLookUp = Math.atan2(Math.abs(dy), horizDist);
  const total = horizObliqueness + verticalLookUp;
  return Math.min(total / (Math.PI / 2), 1);
}

/**
 * 一人称視点の水平注視点X（首振りの向き）を計算する。
 *
 * 実際の観客の挙動をモデル化する:
 * - スクリーン中心が正面から deadzoneYawRad 以内なら首を振らず真正面を向く
 *   （中央〜中央寄りの席。多少のズレは目・周辺視でカバーするため頭は動かさない）。
 * - それを超える分だけ首を振り、maxYawRad で頭打ちにする（端席が首を振り過ぎない）。
 *
 * ミラー反転前の実座標系で返す（呼び出し側で必要なら -x する）。
 *
 * @param seatX 座席X
 * @param screenCenterX スクリーン中心X
 * @param forwardDistance 座席→スクリーン平面の前方距離（>0 を想定）
 * @param maxYawRad 水平首振りの上限角（ラジアン、>=0）
 * @param deadzoneYawRad 首を振り始めない不感帯の角度（ラジアン、>=0、既定0）
 * @returns 注視点のX座標
 */
export function calcYawClampedTargetX(
  seatX: number,
  screenCenterX: number,
  forwardDistance: number,
  maxYawRad: number,
  deadzoneYawRad = 0,
): number {
  const lateralToCenter = screenCenterX - seatX;
  // 前方距離が取れない場合はスクリーン中心を向く（フォールバック）
  if (forwardDistance <= 0) return screenCenterX;
  // スクリーン中心方向の角度（正面=0）
  const yawToCenter = Math.atan(Math.abs(lateralToCenter) / forwardDistance);
  // 不感帯を超えた分だけ首を振り、上限角で頭打ちにする
  const headYaw = Math.min(
    Math.max(yawToCenter - deadzoneYawRad, 0),
    maxYawRad,
  );
  const lateral =
    Math.sign(lateralToCenter) * forwardDistance * Math.tan(headYaw);
  return seatX + lateral;
}

/**
 * 視野占有率メトリクスを一括計算する（座席の3D位置を考慮）。
 */
export function calcFieldOfViewMetrics(
  seat: { position_x: number; position_y: number; position_z: number },
  screen: {
    width: number;
    height: number;
    center_x: number;
    center_y: number;
    center_z: number;
  },
): FieldOfViewMetrics {
  const seatPoint: Point3D = {
    x: seat.position_x,
    y: seat.position_y,
    z: seat.position_z,
  };
  const screenCenter: Point3D = {
    x: screen.center_x,
    y: screen.center_y,
    z: screen.center_z,
  };
  const ratios = calcViewingFovRatios(seatPoint, screen);

  return {
    horizontal_ratio: ratios.horizontal_ratio,
    vertical_ratio: ratios.vertical_ratio,
    distance_to_screen: calcDistance3D(seatPoint, screenCenter),
    distortion_score: calcViewingDistortion(seatPoint, screenCenter),
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
