/**
 * 通路と階段の配置計算
 *
 * 実映画館の縦通路（前後方向）は滑らかなスロープではなく、列ごとの段差に合わせた
 * 階段になっている。蹴込みには琥珀色のLED帯、段鼻には明るいラインが入る。
 * 本モジュールはその段の配置を、既存の座席座標から導出する（DB変更は不要）。
 *
 * 横通路（左右方向）は等高の通り道なので階段にはせず、平らなランディングとして扱う。
 *
 * メッシュ層（`component/aisleStairs`）は jsdom で検証できずカバレッジ除外になるため、
 * 判断を含む計算はすべてここへ置く。
 */

import type { SeatXSegment } from './theaterGeometry';

/** 縦通路のx範囲 */
export interface AisleXRange {
  /** 通路中心のx座標 */
  center: number;
  /** 通路の幅 (m) */
  width: number;
  /** 側壁に接する通路（サイド通路）か。手すりを立てるかの判断に使う */
  isSide: boolean;
}

/** 階段の1段（踏面＋蹴込み） */
export interface AisleStep {
  /** 踏面中心のx */
  centerX: number;
  /** 踏面の幅（通路幅） */
  width: number;
  /** 踏面中心のz */
  centerZ: number;
  /** 踏面の奥行 */
  depth: number;
  /** 踏面上面のY */
  topY: number;
  /** 蹴込みの高さ。0 なら蹴込み・LEDを描かない（最前列と横通路のランディング） */
  riseHeight: number;
  /** 蹴込み面のz（踏面の前端＝スクリーン側） */
  riserZ: number;
}

/** 横通路とみなす列間隔の倍率（通常間隔の何倍を超えたら横通路か） */
export const CROSS_AISLE_GAP_RATIO = 1.5;

/**
 * 列間隔が横通路（段差ではない通り道）かを判定する。
 *
 * 通常の列間隔を基準に、これを大きく超える間隔は段差ではなく横通路とみなす。
 * 段差LED（`StepLEDs`）と階段生成の双方で同じ基準を使うため共通化している。
 *
 * @param gap 判定対象の列間隔 (m)
 * @param normalGap 通常の列間隔 (m)
 * @param ratio 倍率（既定 1.5）
 */
export function isCrossAisleGap(
  gap: number,
  normalGap: number,
  ratio: number = CROSS_AISLE_GAP_RATIO,
): boolean {
  if (normalGap <= 0) return false;
  return gap > normalGap * ratio;
}

/**
 * 隣接する値の差のうち、最小の正の値を返す。
 *
 * 座席のx座標・列のz座標から「通常の間隔」を求めるために使う。
 * 有効な間隔が無い場合は 0 を返す（呼び出し側で判定をスキップする）。
 *
 * @param values 昇順・降順いずれでもよい数値列
 * @param epsilon これ以下の差は同一位置とみなす
 */
export function calcNormalGap(values: number[], epsilon = 0.01): number {
  let min = Infinity;
  for (let i = 1; i < values.length; i++) {
    const gap = Math.abs(values[i - 1] - values[i]);
    if (gap > epsilon && gap < min) min = gap;
  }
  return Number.isFinite(min) ? min : 0;
}

/**
 * 座席ブロックのxセグメントと部屋幅から、縦通路のx範囲を算出する。
 *
 * ブロック間の隙間に加え、両端のブロックと側壁の間（サイド通路）も通路として返す。
 * `minWidth` 未満の隙間は座席間の肘掛け程度の幅とみなし、通路にしない。
 *
 * @param segments 座席ブロックのxセグメント（`computeSeatXSegments` の戻り値）
 * @param roomWidth 室内幅 (m)
 * @param minWidth 通路とみなす最小幅 (m)。既定 0.7（席ピッチ 0.6 より広い）
 * @returns 縦通路のx範囲。座席が無ければ空配列
 */
export function computeAisleXRanges(
  segments: SeatXSegment[],
  roomWidth: number,
  minWidth = 0.7,
): AisleXRange[] {
  if (segments.length === 0 || roomWidth <= 0) return [];

  const sorted = [...segments].sort((a, b) => a.center - b.center);
  const halfWidth = roomWidth / 2;
  const ranges: AisleXRange[] = [];

  const pushIfWideEnough = (from: number, to: number, isSide: boolean) => {
    const width = to - from;
    if (width >= minWidth) {
      ranges.push({ center: (from + to) / 2, width, isSide });
    }
  };

  // 左側壁と最初のブロックの間
  pushIfWideEnough(-halfWidth, sorted[0].center - sorted[0].width / 2, true);

  // ブロック間
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].center + sorted[i - 1].width / 2;
    const curStart = sorted[i].center - sorted[i].width / 2;
    pushIfWideEnough(prevEnd, curStart, false);
  }

  // 最後のブロックと右側壁の間
  const last = sorted[sorted.length - 1];
  pushIfWideEnough(last.center + last.width / 2, halfWidth, true);

  return ranges;
}

/**
 * 縦通路の階段（踏面＋蹴込み）を算出する。
 *
 * 列 i の踏面は、その列の床高 `rowYs[i]` に、`rowZs[i]` を中心として通常列間隔ぶんの
 * 奥行で生成する。蹴込みは踏面の前端（スクリーン側）に立ち、高さは前列との高低差。
 *
 * 前列とのZ間隔が横通路とみなされる場合は蹴込みを立てず、踏面だけを置く
 * （`riseHeight = 0`）。横通路の区間は既存の傾斜床が緩やかなランプとして
 * 繋ぐため、ここを塞ぐ必要はない。最前列も前段が無いため 0。
 *
 * `rowZs` は前（大きいz）→後（小さいz）の降順を想定する。
 *
 * @param aisles 縦通路のx範囲
 * @param rowZs 各列の代表Z（前→後の降順）
 * @param rowYs 各列の代表Y（rowZs と同順・同数）
 * @param ratio 横通路判定の倍率
 * @returns 階段の段の配列。通路が無い・列が無い場合は空配列
 */
export function computeAisleSteps(
  aisles: AisleXRange[],
  rowZs: number[],
  rowYs: number[],
  ratio: number = CROSS_AISLE_GAP_RATIO,
): AisleStep[] {
  if (aisles.length === 0) return [];
  if (rowZs.length === 0 || rowZs.length !== rowYs.length) return [];

  const normalGap = calcNormalGap(rowZs);
  // 列が1本しかない等で間隔が取れない場合は、踏面の奥行として妥当な既定値を使う
  const depth = normalGap > 0 ? normalGap : 1;

  const steps: AisleStep[] = [];
  for (const aisle of aisles) {
    for (let i = 0; i < rowZs.length; i++) {
      const gap = i > 0 ? Math.abs(rowZs[i - 1] - rowZs[i]) : 0;
      // 最前列と横通路の手前には蹴込みを立てない
      const noRiser = i === 0 || isCrossAisleGap(gap, normalGap, ratio);

      steps.push({
        centerX: aisle.center,
        width: aisle.width,
        centerZ: rowZs[i],
        depth,
        topY: rowYs[i],
        riseHeight: noRiser ? 0 : rowYs[i] - rowYs[i - 1],
        riserZ: rowZs[i] + depth / 2,
      });
    }
  }
  return steps;
}

/** 横通路の腰壁1枚ぶんの配置 */
export interface CrossAisleRail {
  /** 腰壁中心のx */
  centerX: number;
  /** 腰壁の幅（座席ブロックの幅） */
  width: number;
  /** 腰壁の前面のz（スクリーン側） */
  z: number;
  /** 腰壁下端のY（その位置の床高） */
  baseY: number;
}

/**
 * 横通路の前縁に立てる腰壁の配置を算出する。
 *
 * 参考写真では、段上がりの客席ブロックの前縁に高さ 0.9m 程度の腰壁（上端に
 * キャップレール）が立っている。俯瞰でスタジアム客席の段構成を読み取りやすくする
 * 効果もある。通路部分は開口させるため、座席ブロックのxセグメントぶんだけ立てる。
 *
 * @param segments 座席ブロックのxセグメント
 * @param rowZs 各列の代表Z（前→後の降順）
 * @param rowYs 各列の代表Y
 * @param ratio 横通路判定の倍率
 * @returns 腰壁の配置。横通路が無ければ空配列
 */
export function computeCrossAisleRails(
  segments: SeatXSegment[],
  rowZs: number[],
  rowYs: number[],
  ratio: number = CROSS_AISLE_GAP_RATIO,
): CrossAisleRail[] {
  if (segments.length === 0) return [];
  if (rowZs.length < 2 || rowZs.length !== rowYs.length) return [];

  const normalGap = calcNormalGap(rowZs);
  const rails: CrossAisleRail[] = [];

  for (let i = 1; i < rowZs.length; i++) {
    const gap = Math.abs(rowZs[i - 1] - rowZs[i]);
    if (!isCrossAisleGap(gap, normalGap, ratio)) continue;

    // 横通路の後ろ側（高い側）の列の前縁に立てる
    for (const seg of segments) {
      rails.push({
        centerX: seg.center,
        width: seg.width,
        z: rowZs[i] + normalGap / 2,
        baseY: rowYs[i],
      });
    }
  }
  return rails;
}

/**
 * 座席ブロックの端（通路に面する席）と、その席から見て通路がある向きを返す。
 *
 * 参考写真では通路側座席の肘掛けに丸い列記号プレートが付いている。一人称視点で
 * 現在位置を把握する手がかりになるため、どの席のどちら側に付けるかを判定する。
 *
 * 各列 × 各ブロックについて、x の最小・最大にあたる席を端とみなす。列ごとに独立して
 * 判定するので、列によって席数が違う（最前列が短い等）レイアウトでも端を拾える。
 *
 * 向きは**ブロック中心からの外向き**で決める。室中心（x=0）基準にすると、中央通路に
 * 面する内側端の席でプレートが通路と逆側に付いてしまう。
 *
 * @param seats 座席一覧（`id` / `row_label` / `position_x` を使う）
 * @param segments 座席ブロックのxセグメント
 * @returns 座席ID → 通路のある向き（-1 = 左, +1 = 右）
 */
export function computeAisleSideSeatIds(
  seats: { id: string; row_label: string; position_x: number }[],
  segments: SeatXSegment[],
): Map<string, -1 | 1> {
  const result = new Map<string, -1 | 1>();
  if (seats.length === 0 || segments.length === 0) return result;

  type Seat = (typeof seats)[number];
  const buckets = new Map<string, { block: number; min: Seat; max: Seat }>();

  for (const seat of seats) {
    // この席が属するブロックを探す（複数に含まれる場合は中心が近い方）
    let blockIndex = -1;
    let bestDistance = Infinity;
    segments.forEach((seg, i) => {
      const distance = Math.abs(seat.position_x - seg.center);
      if (distance <= seg.width / 2 && distance < bestDistance) {
        bestDistance = distance;
        blockIndex = i;
      }
    });
    if (blockIndex < 0) continue;

    const key = `${seat.row_label}:${blockIndex}`;
    const bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, { block: blockIndex, min: seat, max: seat });
      continue;
    }
    if (seat.position_x < bucket.min.position_x) bucket.min = seat;
    if (seat.position_x > bucket.max.position_x) bucket.max = seat;
  }

  for (const { min, max } of buckets.values()) {
    // ブロックの左端は左が通路、右端は右が通路
    result.set(min.id, -1);
    // 1席しかない列では max と min が同一。右側を優先して上書きしない
    if (max.id !== min.id) result.set(max.id, 1);
  }
  return result;
}
