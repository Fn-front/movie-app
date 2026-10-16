/**
 * 客席の占有（どの席に人が座っているか）の決定
 *
 * 占有率スライダーに応じて席を埋めるが、**決定論的に**決める。`Math.random()` を
 * 使うと再レンダリングのたびに並びが変わり、E2Eスクリーンショットも安定しない
 * （本機能群で一貫して守っている方針）。
 *
 * 席IDから [0,1) のスコアを導き、`score < 占有率` の席を埋める。これにより
 * **占有率を上げると席が増えるだけで減らない**（単調性）ため、スライダーの操作が
 * 直感どおりに見える。
 */

/** 文字列から [0,1) の決定論的なスコアを導くための定数（FNV-1a 由来の素数） */
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

/**
 * 席IDから [0,1) の決定論的なスコアを返す。
 *
 * FNV-1a でハッシュしたあと、32bit の最終撹拌（avalanche）を掛ける。
 * FNV-1a だけだと `seat-0`・`seat-1`… のような**似た短い文字列**で分散が偏り、
 * 占有席が塊になって実機らしく見えなかった（10区間中8区間にしか散らなかった）。
 *
 * @param seatId 座席ID
 */
export function calcSeatOccupancyScore(seatId: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < seatId.length; i++) {
    hash ^= seatId.charCodeAt(i);
    // Math.imul で 32bit 乗算のオーバーフローを正しく扱う
    hash = Math.imul(hash, FNV_PRIME);
  }
  // 最終撹拌（lowbias32）。入力が似ていても出力が十分ばらけるようにする
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  // 符号なし32bitへ畳んでから [0,1) へ
  return (hash >>> 0) / 4294967296;
}

/**
 * 占有率に応じて、人が座っている席のIDを返す。
 *
 * 選択中の席は常に空にする（そこに座っているのは利用者自身のため）。
 * 車椅子席も除外する（座席メッシュを持たないフラットなスペースのため、
 * そこに人型を置くと宙に浮く）。
 *
 * @param seats 座席一覧
 * @param rate 占有率（0〜1。範囲外はクランプ）
 * @param selectedSeatId 選択中の座席ID（常に空席にする）
 * @returns 人が座っている席IDの集合
 */
export function computeOccupiedSeatIds(
  seats: { id: string; seat_type: string }[],
  rate: number,
  selectedSeatId: string | null = null,
): Set<string> {
  const clamped = Math.min(Math.max(Number.isFinite(rate) ? rate : 0, 0), 1);
  const occupied = new Set<string>();
  if (clamped <= 0) return occupied;

  for (const seat of seats) {
    if (seat.id === selectedSeatId) continue;
    if (seat.seat_type === 'wheelchair') continue;
    if (calcSeatOccupancyScore(seat.id) < clamped) occupied.add(seat.id);
  }
  return occupied;
}

/** 観客の体格・首の傾きのバリエーション */
export interface AudienceVariant {
  /** 体格の倍率 */
  build: number;
  /** 首の傾き (rad) */
  headTilt: number;
}

/**
 * 観客の体格バリエーション。全員が同じ大きさ・同じ姿勢だと並びが不自然なため、
 * 席ごとに振り分ける。
 */
const AUDIENCE_VARIANTS: readonly AudienceVariant[] = [
  { build: 0.92, headTilt: -0.05 },
  { build: 1.0, headTilt: 0.02 },
  { build: 1.06, headTilt: 0.06 },
  { build: 0.97, headTilt: -0.01 },
];

/**
 * 席IDから観客の体格・首の傾きを決定論的に選ぶ。
 *
 * 占有判定と同じスコアを使うため、再レンダリングしても同じ席には同じ体格が割り当たる
 * （`Math.random()` を使うと毎フレーム体格が変わってちらつく）。
 *
 * @param seatId 座席ID
 */
export function calcAudienceVariant(seatId: string): AudienceVariant {
  const index =
    Math.floor(calcSeatOccupancyScore(seatId) * AUDIENCE_VARIANTS.length) %
    AUDIENCE_VARIANTS.length;
  return AUDIENCE_VARIANTS[index];
}
