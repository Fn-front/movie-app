/**
 * occupancy テスト
 */

import { calcSeatOccupancyScore, computeOccupiedSeatIds } from './occupancy';

const makeSeats = (count: number, seatType = 'standard') =>
  Array.from({ length: count }, (_, i) => ({
    id: `seat-${i}`,
    seat_type: seatType,
  }));

describe('calcSeatOccupancyScore', () => {
  it('同じIDなら常に同じスコアを返す（決定論的）', () => {
    expect(calcSeatOccupancyScore('seat-1')).toBe(
      calcSeatOccupancyScore('seat-1'),
    );
  });

  it('IDが違えばスコアも分かれる', () => {
    expect(calcSeatOccupancyScore('seat-1')).not.toBe(
      calcSeatOccupancyScore('seat-2'),
    );
  });

  it('スコアは [0,1) に収まる', () => {
    for (let i = 0; i < 200; i++) {
      const score = calcSeatOccupancyScore(`seat-${i}`);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThan(1);
    }
  });

  it('スコアが十分にばらける（塊にならない）', () => {
    // 200席を10区間に分けて、どの区間にも入ることを確認する
    const buckets = new Set<number>();
    for (let i = 0; i < 200; i++) {
      buckets.add(Math.floor(calcSeatOccupancyScore(`seat-${i}`) * 10));
    }
    expect(buckets.size).toBe(10);
  });

  it('空文字でも例外を投げず [0,1) を返す', () => {
    const score = calcSeatOccupancyScore('');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(1);
  });
});

describe('computeOccupiedSeatIds', () => {
  const seats = makeSeats(200);

  it('占有率0なら誰も座っていない', () => {
    expect(computeOccupiedSeatIds(seats, 0).size).toBe(0);
  });

  it('占有率1なら（除外席を除き）全席が埋まる', () => {
    expect(computeOccupiedSeatIds(seats, 1).size).toBe(seats.length);
  });

  it('占有率を上げると席が増えるだけで減らない（単調性）', () => {
    const low = computeOccupiedSeatIds(seats, 0.3);
    const high = computeOccupiedSeatIds(seats, 0.7);
    expect(high.size).toBeGreaterThan(low.size);
    // 低い占有率で埋まっていた席は、高い占有率でも必ず埋まっている
    for (const id of low) expect(high.has(id)).toBe(true);
  });

  it('占有率にほぼ比例した席数になる', () => {
    const half = computeOccupiedSeatIds(seats, 0.5).size;
    expect(half).toBeGreaterThan(seats.length * 0.4);
    expect(half).toBeLessThan(seats.length * 0.6);
  });

  it('選択中の席は常に空席にする（利用者自身が座っているため）', () => {
    const occupied = computeOccupiedSeatIds(seats, 1, 'seat-5');
    expect(occupied.has('seat-5')).toBe(false);
    expect(occupied.size).toBe(seats.length - 1);
  });

  it('車椅子席は除外する（座席メッシュが無く人型が浮くため）', () => {
    const wheelchairs = makeSeats(10, 'wheelchair');
    expect(computeOccupiedSeatIds(wheelchairs, 1).size).toBe(0);
  });

  it('同じ入力なら同じ結果を返す（決定論的）', () => {
    expect([...computeOccupiedSeatIds(seats, 0.4)].sort()).toEqual(
      [...computeOccupiedSeatIds(seats, 0.4)].sort(),
    );
  });

  it('占有率が範囲外でもクランプする', () => {
    expect(computeOccupiedSeatIds(seats, -1).size).toBe(0);
    expect(computeOccupiedSeatIds(seats, 5).size).toBe(seats.length);
  });

  it('占有率が NaN なら誰も座らせない', () => {
    expect(computeOccupiedSeatIds(seats, NaN).size).toBe(0);
  });

  it('座席が空なら空集合を返す', () => {
    expect(computeOccupiedSeatIds([], 1).size).toBe(0);
  });
});
