/**
 * シアター3Dシーンのジオメトリ計算ユーティリティ
 */

/** 俯瞰カメラのズーム上限（中規模ルームで最適だった従来値） */
export const OVERVIEW_MAX_ZOOM = 28;
/** 俯瞰ズーム定数（= 上限28 × 基準fitSize≈25）。部屋が大きいほどズームアウトする */
export const OVERVIEW_ZOOM_CONSTANT = 700;

/**
 * 部屋サイズに応じた等角俯瞰カメラのズームを算出する。
 *
 * 正投影カメラでは距離ではなくズームが画角を決めるため、部屋が大きいほど
 * ズームを下げて（ズームアウトして）大型ルーム(IMAX等)でも劇場全体が画面に収まるようにする。
 * fitSize は床の対角(投影幅の目安)と天井高から算出し、大きい方で律速する。
 */
export function calcOverviewZoom(
  roomWidth: number,
  roomDepth: number,
  roomHeight: number,
): number {
  const fitSize = Math.max(
    (roomWidth + roomDepth) / Math.SQRT2,
    roomHeight * 1.2,
  );
  if (fitSize <= 0) return OVERVIEW_MAX_ZOOM;
  return Math.min(OVERVIEW_MAX_ZOOM, OVERVIEW_ZOOM_CONSTANT / fitSize);
}

/**
 * 各列の実Z(rowZs)・実Y(rowYs)から、指定Zにおける傾斜床の高さを線形補間する。
 *
 * 床が各列の座席Yを必ず通るため、座席が床面から浮かない。座席と同じ曲線
 * (シード側 t^1.3)や横通路によるZシフトにも自動追従する（床側で別式を持たない）。
 * rowZs は前(大きいz)→後(小さいz)の降順を想定。範囲外は端の高さにクランプ。
 * 横通路のような大きなZ間隔は緩やかなランプとして補間される。
 *
 * @param z 対象のワールドZ
 * @param rowZs 各列の代表Z（前→後の降順）
 * @param rowYs 各列の代表Y（rowZsと同順・同数）
 */
export function interpolateFloorHeight(
  z: number,
  rowZs: number[],
  rowYs: number[],
): number {
  const n = rowZs.length;
  if (n === 0) return 0;
  if (n === 1) return rowYs[0] ?? 0;
  if (z >= rowZs[0]) return rowYs[0];
  if (z <= rowZs[n - 1]) return rowYs[n - 1];
  for (let i = 0; i < n - 1; i++) {
    const zHi = rowZs[i];
    const zLo = rowZs[i + 1];
    if (z <= zHi && z >= zLo) {
      const span = zHi - zLo;
      const t = span > 0 ? (zHi - z) / span : 0;
      return rowYs[i] + t * (rowYs[i + 1] - rowYs[i]);
    }
  }
  return rowYs[n - 1];
}
