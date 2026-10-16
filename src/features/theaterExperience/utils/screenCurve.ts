/**
 * カーブドスクリーン（湾曲スクリーン）の形状計算
 *
 * IMAX公式のシアター構成図は「IMAXスクリーン＝湾曲」「従来のスクリーン＝平面」として
 * 明示的に描き分けている。一方 Dolby Cinema の公式内観、TCX（日比谷）の写真では幕の
 * 上辺・側辺とも直線で湾曲は確認できないため、湾曲は IMAX のみに適用する。
 * 半径は `theaters.screen_curvature`（0 = 平面）が持つ。
 *
 * 湾曲は**水平方向のみ**（円筒の軸は垂直）。実機の映画館スクリーンは客席側へ凹
 * （客席を包む向き）なので、弧の中心を客席側 `(center_x, center_z - R)` に置く。
 * これにより両端ほど z が小さくなる＝客席に近づく。
 *
 * 高さ方向は曲げない。実機も縦方向は直線のため。
 *
 * `theaters.screen_width` は**幕の実寸＝弧長**として解釈する（物理的な幕の寸法表記は
 * 布の長さであり、弦ではないため）。したがって端点のサジッタは弦の式
 * `R - sqrt(R^2 - (W/2)^2)` ではなく `R * (1 - cos((W/2)/R))` で求まる。
 */

/** 平面（湾曲なし）とみなす半径の閾値 */
const FLAT_THRESHOLD = 0.01;

/** 幕上の一点（ワールドのXZ） */
export interface ScreenArcPoint {
  x: number;
  z: number;
}

/**
 * 湾曲しているかを判定する。
 *
 * @param curvature `theaters.screen_curvature`
 */
export function isCurvedScreen(curvature: number): boolean {
  return Number.isFinite(curvature) && curvature > FLAT_THRESHOLD;
}

/**
 * 幕上の横方向オフセットに対応するワールド座標(XZ)を返す。
 *
 * `lateralOffset` は幕の中央を 0 とした**幕に沿った距離**（弧長）。平面の場合は
 * そのままXオフセットになる。
 *
 * 半径が0（平面）の場合は `{ x: centerX + lateralOffset, z: centerZ }` を返し、
 * 既存の平面計算と完全に一致する。
 *
 * @param lateralOffset 幕中央からの横方向オフセット（弧長, m）
 * @param centerX 幕中心のX
 * @param centerZ 幕中心のZ
 * @param curvature 湾曲半径 (m)。0 なら平面
 */
export function calcScreenArcPoint(
  lateralOffset: number,
  centerX: number,
  centerZ: number,
  curvature: number,
): ScreenArcPoint {
  if (!isCurvedScreen(curvature) || !Number.isFinite(lateralOffset)) {
    return {
      x: centerX + (Number.isFinite(lateralOffset) ? lateralOffset : 0),
      z: centerZ,
    };
  }
  const theta = lateralOffset / curvature;
  return {
    x: centerX + curvature * Math.sin(theta),
    // 客席側へ凹ませる（両端が客席に近づく）
    z: centerZ - curvature * (1 - Math.cos(theta)),
  };
}

/**
 * 幕の両端のせり出し量（サジッタ）を返す。
 *
 * 幕の両端が中央よりどれだけ客席側へ出るか。最前列との干渉を確認するのに使う。
 *
 * @param width 幕の幅 (m)
 * @param curvature 湾曲半径 (m)。0 なら平面
 * @returns せり出し量 (m)。平面なら 0
 */
export function calcScreenSagitta(width: number, curvature: number): number {
  if (!isCurvedScreen(curvature) || !Number.isFinite(width) || width <= 0) {
    return 0;
  }
  const theta = width / 2 / curvature;
  return curvature * (1 - Math.cos(theta));
}
