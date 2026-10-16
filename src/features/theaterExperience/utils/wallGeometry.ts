/**
 * 壁・天井の造作の配置計算
 *
 * 縦リブ・多面体ファセット・天井ダウンライトの配置を算出する純ロジック。
 * メッシュ層（`component/wallPanels` / `component/ceilingLights`）は jsdom で
 * 検証できずカバレッジ除外になるため、判断を含む計算はすべてここへ置く。
 *
 * 配置はすべて決定論的に決める（`Math.random()` を使わない）。部屋サイズが同じなら
 * 毎回同じ見た目になり、E2Eスクリーンショットが安定する。
 */

/** 縦リブ1本の配置（壁に沿った方向のオフセット） */
export interface RibPlacement {
  /** 壁中央を原点とした、壁に沿う方向の位置 (m) */
  offset: number;
}

/** ファセット1ユニットの配置 */
export interface FacetPlacement {
  /** 壁中央を原点とした、壁に沿う方向の位置 (m) */
  offset: number;
  /** 造作帯の下端を原点とした高さ方向の位置 (m) */
  height: number;
  /** 四角錐の自転角 (rad)。0 か π/4 で正方形／菱形のシルエットを切り替える */
  spin: number;
  /** 室内側への突出量 (m) */
  depth: number;
}

/** 天井ダウンライト1灯の配置 */
export interface CeilingLightPlacement {
  x: number;
  z: number;
}

/**
 * 縦リブの配置を算出する。
 *
 * 壁長を本数で等分し、各区画の中央にリブを置く。両端には半ピッチの余白が残るため、
 * 壁の入隅でリブが潰れない。
 *
 * @param wallLength 壁の長さ (m)
 * @param spacing リブの間隔の目安 (m)
 * @returns 壁中央を原点としたオフセットの配列。壁長が間隔未満なら空配列
 */
export function computeRibPlacements(
  wallLength: number,
  spacing: number,
): RibPlacement[] {
  if (wallLength <= 0 || spacing <= 0) return [];
  const count = Math.floor(wallLength / spacing);
  if (count < 1) return [];

  const step = wallLength / count;
  const placements: RibPlacement[] = [];
  for (let i = 0; i < count; i++) {
    placements.push({ offset: -wallLength / 2 + step * (i + 0.5) });
  }
  return placements;
}

/** ファセットの突出量のバリエーション (m)。インデックスから決定論的に選ぶ */
const FACET_DEPTHS = [0.34, 0.22, 0.4, 0.28];

/**
 * 多面体ファセット（Dolby Cinema の折り紙状の壁）の配置を算出する。
 *
 * 造作帯を格子に分割し、各セルに四角錐を1つ置く。すべて同じ向き・同じ高さだと
 * 規則的な反復に見えてしまうため、自転角（正方形／菱形）と突出量をインデックスから
 * 決定論的に振り分けて不規則さを出す。
 *
 * @param wallLength 壁の長さ (m)
 * @param bandHeight 造作帯の高さ (m)
 * @param unitSize 1ユニットの目安サイズ (m)
 * @returns ファセットの配置配列。寸法が不正なら空配列
 */
export function computeFacetPlacements(
  wallLength: number,
  bandHeight: number,
  unitSize: number,
): FacetPlacement[] {
  if (wallLength <= 0 || bandHeight <= 0 || unitSize <= 0) return [];

  const cols = Math.max(1, Math.round(wallLength / unitSize));
  const rows = Math.max(1, Math.round(bandHeight / unitSize));
  const cellW = wallLength / cols;
  const cellH = bandHeight / rows;

  const placements: FacetPlacement[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // 行と列に互いに素な係数を掛けて、縦にも横にも同じ並びが続かないようにする
      const variant = (col * 3 + row * 5) % 4;
      placements.push({
        offset: -wallLength / 2 + cellW * (col + 0.5),
        height: cellH * (row + 0.5),
        spin: variant % 2 === 0 ? 0 : Math.PI / 4,
        depth: FACET_DEPTHS[variant],
      });
    }
  }
  return placements;
}

/**
 * ファセット1ユニットの四角錐の外接円半径を返す。
 *
 * three の `ConeGeometry` は radialSegments=4 のとき、半径を外接円とする正方形底面に
 * なる。底面の一辺をセル幅に合わせるため、半径は一辺の 1/√2 とする。
 *
 * @param wallLength 壁の長さ (m)
 * @param unitSize 1ユニットの目安サイズ (m)
 */
export function calcFacetRadius(wallLength: number, unitSize: number): number {
  if (wallLength <= 0 || unitSize <= 0) return 0;
  const cols = Math.max(1, Math.round(wallLength / unitSize));
  return wallLength / cols / Math.SQRT2;
}

/**
 * 天井ダウンライトの格子配置を算出する。
 *
 * 幅・奥行をそれぞれ灯数で等分し、各区画の中央に1灯置く。両端に半ピッチの余白が
 * 残るため、壁際に灯が寄りすぎない。
 *
 * @param roomWidth 室内幅 (m)
 * @param roomDepth 室内奥行 (m)
 * @param spacing 灯の間隔の目安 (m)
 * @returns 室中心を原点とした座標の配列
 */
export function computeCeilingLightPlacements(
  roomWidth: number,
  roomDepth: number,
  spacing: number,
): CeilingLightPlacement[] {
  if (roomWidth <= 0 || roomDepth <= 0 || spacing <= 0) return [];

  const cols = Math.max(1, Math.floor(roomWidth / spacing));
  const rows = Math.max(1, Math.floor(roomDepth / spacing));
  const stepX = roomWidth / cols;
  const stepZ = roomDepth / rows;

  const placements: CeilingLightPlacement[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      placements.push({
        x: -roomWidth / 2 + stepX * (col + 0.5),
        z: -roomDepth / 2 + stepZ * (row + 0.5),
      });
    }
  }
  return placements;
}

/**
 * 俯瞰（等角投影）時に、その壁の造作を描画すべきでないかを返す。
 *
 * 俯瞰カメラは `calcOverviewCameraPosition` により常に (+X, +Y, +Z) 側に置かれる。
 * 壁本体は片面の `planeGeometry` なので手前側（+X / +Z）は自動でカリングされ、
 * ドールハウスとして室内が見通せる。
 *
 * 一方、幅木・リブ・ファセット・コーブは**立体**なのでカリングされず、そのまま描くと
 * 手前側の造作が客席を覆い隠す。俯瞰では手前側の壁の造作を描かないことで、
 * 壁本体のカリングと見え方を揃える。一人称では室内から見るため全面を描く。
 *
 * @param x 壁中心のx座標
 * @param z 壁中心のz座標
 * @returns 俯瞰で隠すべきなら true
 */
export function isWallHiddenInOverview(x: number, z: number): boolean {
  return x > 0 || z > 0;
}
