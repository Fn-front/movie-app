/**
 * シアター3Dシーンのジオメトリ計算ユーティリティ
 */

/** 俯瞰カメラのズーム上限（中規模ルームで最適だった従来値） */
export const OVERVIEW_MAX_ZOOM = 28;
/** 俯瞰ズーム定数（= 上限28 × 基準fitSize≈25）。部屋が大きいほどズームアウトする */
export const OVERVIEW_ZOOM_CONSTANT = 700;
/** 俯瞰カメラの引き距離係数（部屋の最大辺に対する倍率。等角3方向とも同値） */
export const OVERVIEW_CAMERA_DISTANCE_FACTOR = 1.2;

/**
 * 等角俯瞰カメラの設置位置を算出する（3軸とも同じ引き距離のアイソメトリック視点）。
 * 一人称遷移のフライスルー開始点（俯瞰視点）と、俯瞰カメラリグの設置位置で
 * 同一値を共有するため、単一ソースとして切り出している。
 */
export function calcOverviewCameraPosition(
  roomWidth: number,
  roomDepth: number,
): [number, number, number] {
  const distance =
    Math.max(roomWidth, roomDepth) * OVERVIEW_CAMERA_DISTANCE_FACTOR;
  return [distance, distance, distance];
}

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

/** 段差LEDの1セグメント（縦通路で区切られた1つの座席ブロックに対応）。中心xと幅。 */
export interface SeatXSegment {
  /** ブロック中心のx座標 */
  center: number;
  /** ブロックの幅（端席の外側への張り出しを含む） */
  width: number;
}

/**
 * 座席のx座標群から、縦通路で分割された座席ブロックのxセグメントを算出する。
 *
 * 段差LEDを「全幅1本」ではなく座席ブロック単位で分割配置するために使う（座席を貫通する
 * 光線や通路の暗部まで伸びる帯を防ぐ）。隣接するユニークx間隔の最小を「通常の座席間隔」と
 * みなし、これを aisleGapRatio 倍を超える間隔を縦通路とみなしてブロックを分割する
 * （行の横通路判定と同じデータ駆動の考え方）。各ブロックは端席の外側へ seatHalf だけ
 * 張り出し、座席下を自然に照らす。
 *
 * @param xValues 座席のx座標（重複可・順不同）
 * @param seatHalf 端席の外側への張り出し（座席半幅の目安, m）
 * @param aisleGapRatio 通常間隔の何倍を超えたら縦通路とみなすか
 * @returns 各座席ブロックの {center, width}。座席が空なら []
 */
export function computeSeatXSegments(
  xValues: number[],
  seatHalf = 0.3,
  aisleGapRatio = 1.5,
): SeatXSegment[] {
  const xs = Array.from(new Set(xValues)).sort((a, b) => a - b);
  if (xs.length === 0) return [];
  if (xs.length === 1) {
    return [{ center: xs[0], width: seatHalf * 2 }];
  }

  // 通常の座席間隔（最小の正の間隔）を基準にする
  let normalGap = Infinity;
  for (let i = 1; i < xs.length; i++) {
    const g = xs[i] - xs[i - 1];
    if (g > 0.01 && g < normalGap) normalGap = g;
  }
  if (!Number.isFinite(normalGap)) normalGap = 0;

  const segments: SeatXSegment[] = [];
  let blockStart = xs[0];
  let blockEnd = xs[0];
  const pushBlock = () => {
    segments.push({
      center: (blockStart + blockEnd) / 2,
      width: blockEnd - blockStart + seatHalf * 2,
    });
  };
  for (let i = 1; i < xs.length; i++) {
    const g = xs[i] - xs[i - 1];
    if (normalGap > 0 && g > normalGap * aisleGapRatio) {
      // 縦通路 → ここまでを1ブロックとして確定し、新ブロックを開始
      pushBlock();
      blockStart = xs[i];
    }
    blockEnd = xs[i];
  }
  pushBlock();
  return segments;
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
