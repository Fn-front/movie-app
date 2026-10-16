/**
 * 弧状（扇形）座席列の計算
 *
 * 実在の映画館は座席列が弧を描いており、列内のどの席もスクリーンから概ね等距離に
 * なるよう配置されている。DB側は `theaters.row_curve_radius`（弧の半径）を持ち、
 * `theater_seats` の座標は既に極座標配置済み（`20261016093525_theater_curved_rows`）。
 *
 * 本モジュールは描画側で必要になる以下を担う。
 * - 座席を弧の接線方向へ向けるための回転角
 * - 通路や階段を同じ弧に沿わせるための前方シフト量
 *
 * メッシュ層はカバレッジ除外のため、判断を含む計算はここへ置く。
 */

/** 弧なし（直線列）とみなす半径の閾値 */
const STRAIGHT_THRESHOLD = 0.01;

/**
 * 弧状配置かを判定する。
 *
 * @param radius `theaters.row_curve_radius`
 */
export function isCurvedLayout(radius: number): boolean {
  return Number.isFinite(radius) && radius > STRAIGHT_THRESHOLD;
}

/**
 * 弧上の点（横位置 x）における、弧の中心へ向かう向きのY軸回転角を返す。
 *
 * 座席は弧の接線に対して直交する向き＝弧の中心（スクリーン側）を向く。マイグレーションで
 * `x = R * sin(θ)` としているため、`θ = asin(x / R)` で復元できる。three のメッシュを
 * 正面（-Z）向きから θ だけ回すと、弧の中心を向く。
 *
 * 半径が0（直線列）または x が半径を超える不正値の場合は 0 を返し、NaN を描画層へ
 * 流さない。
 *
 * @param x 座席の `position_x`
 * @param radius 弧の半径
 * @returns Y軸まわりの回転角 (rad)
 */
export function calcSeatYawOnArc(x: number, radius: number): number {
  if (!isCurvedLayout(radius)) return 0;
  if (!Number.isFinite(x)) return 0;
  // 丸め誤差や不正データで asin の定義域を外れないようクランプする
  const ratio = Math.min(1, Math.max(-1, x / radius));
  return Math.asin(ratio);
}

/**
 * 弧上の横位置 x における、列の中央席からの前方シフト量を返す。
 *
 * マイグレーションの `z = z_r + R * (1 - cos(θ))` と同じ式。通路の階段・手すり・腰壁を
 * 座席と同じ弧に乗せるために使う（これを使わないと、端ほど座席だけが前へ出て階段と
 * 前後位置がずれる）。
 *
 * @param x 対象の横位置
 * @param radius 弧の半径
 * @returns 前方（+Z, スクリーン側）へのシフト量。直線列なら 0
 */
export function calcArcForwardShift(x: number, radius: number): number {
  if (!isCurvedLayout(radius)) return 0;
  if (!Number.isFinite(x)) return 0;
  const clamped = Math.min(Math.abs(x), radius);
  return radius - Math.sqrt(radius * radius - clamped * clamped);
}

/**
 * 座席ローカルのオフセットを、座席の向き（Y軸回転）に合わせて回した世界オフセットを返す。
 *
 * 肘掛けや列記号プレートは座席中心から横（ローカル+X）・前後（ローカル+Z）にずらして
 * 置くため、座席を弧の接線方向へ向けるとオフセットも一緒に回す必要がある。回さないと
 * 端席ほど肘掛けが座面からずれて見える。
 *
 * three の Y軸回転は、ローカル +X を世界 (cos y, 0, -sin y) へ、ローカル +Z を
 * 世界 (sin y, 0, cos y) へ写す。
 *
 * @param localX ローカルX方向のオフセット
 * @param localZ ローカルZ方向のオフセット
 * @param yaw Y軸まわりの回転角 (rad)
 * @returns 世界座標系での [x, z] オフセット
 */
export function rotateLocalOffset(
  localX: number,
  localZ: number,
  yaw: number,
): [number, number] {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [localX * cos + localZ * sin, -localX * sin + localZ * cos];
}
