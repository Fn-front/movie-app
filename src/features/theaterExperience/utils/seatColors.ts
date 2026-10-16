/**
 * 座席の色決定ロジック
 *
 * 座面・背もたれ・ヘッドレストの色を、内装テーマと座席の状態から決める。
 * メッシュ層（`component/seatMeshes`）はカバレッジ除外のため、判断を含む計算は
 * ここへ置く。
 *
 * 選択中・車椅子席の色は**機能色**であり、内装テーマでは変えない。
 * 俯瞰で3者が判別できることがアクセシビリティ要件（設計書 §2.3）のため。
 */

import { Color } from 'three';

import type { TheaterSeat } from '../types';
import type { InteriorTheme } from './theaterPalette';

/** 座席の色種別キー */
export type SeatColorKey = 'selected' | 'wheelchair' | 'seat';

/** 選択中の座席（機能色・テーマで変えない） */
export const COLOR_SELECTED = '#ffaa00';
/** 車椅子席（機能色・テーマで変えない。他席と区別できる青系） */
export const COLOR_WHEELCHAIR = '#3b82f6';

/** 背もたれは座面より一段暗くして、座面との境界（椅子のシルエット）を立たせる */
export const BACK_DARKEN = 0.78;
/** 機能色のヘッドレストは座面より僅かに明るくして枕を分離させる */
const FUNCTIONAL_HEADREST_LIGHTEN = 1.12;

/** 座面・背もたれ・ヘッドレストの色セット */
export interface SeatPalette {
  cushion: Record<SeatColorKey, Color>;
  back: Record<SeatColorKey, Color>;
  headrest: Record<SeatColorKey, Color>;
}

/**
 * テーマ単位の色セットのキャッシュ。
 *
 * 同一種別の呼び出しで同じ `Color` インスタンスを返すため（毎フレームの
 * `setColorAt` で新規生成しない）、テーマ参照をキーに事前計算した結果を保持する。
 * テーマはモジュールレベルの定数オブジェクトなので参照が安定している。
 */
const paletteCache = new WeakMap<InteriorTheme, SeatPalette>();

/**
 * 内装テーマに対応する座席の色セットを返す（テーマ単位でキャッシュ）。
 *
 * @param theme 内装テーマ
 */
export function getSeatPalette(theme: InteriorTheme): SeatPalette {
  const cached = paletteCache.get(theme);
  if (cached) return cached;

  const selected = new Color(COLOR_SELECTED);
  const wheelchair = new Color(COLOR_WHEELCHAIR);
  const seat = new Color(theme.seat.cushion);

  const palette: SeatPalette = {
    cushion: { selected, wheelchair, seat },
    back: {
      selected: selected.clone().multiplyScalar(BACK_DARKEN),
      wheelchair: wheelchair.clone().multiplyScalar(BACK_DARKEN),
      seat: seat.clone().multiplyScalar(BACK_DARKEN),
    },
    headrest: {
      selected: selected.clone().multiplyScalar(FUNCTIONAL_HEADREST_LIGHTEN),
      wheelchair: wheelchair
        .clone()
        .multiplyScalar(FUNCTIONAL_HEADREST_LIGHTEN),
      seat: new Color(theme.seat.headrest),
    },
  };

  paletteCache.set(theme, palette);
  return palette;
}

/**
 * 座席の色種別を決定する。優先度: 選択中 > 車椅子席 > 通常席（単色）。
 *
 * 旧実装は列ごとの2色交互だったが、輝度差が視認閾値未満（コントラスト比≈1.24:1）で
 * 列識別に寄与せず無効な配色だったため撤廃済み。列識別は2D座席一覧が担う。
 *
 * @param seat 座席
 * @param selectedSeatId 選択中の座席ID
 */
export function getSeatColorKey(
  seat: TheaterSeat,
  selectedSeatId: string | null,
): SeatColorKey {
  if (seat.id === selectedSeatId) return 'selected';
  if (seat.seat_type === 'wheelchair') return 'wheelchair';
  return 'seat';
}

/** 座面の色を返す */
export function getSeatCushionColor(
  seat: TheaterSeat,
  selectedSeatId: string | null,
  theme: InteriorTheme,
): Color {
  return getSeatPalette(theme).cushion[getSeatColorKey(seat, selectedSeatId)];
}

/** 背もたれの色（座面より一段暗い）を返す */
export function getSeatBackColor(
  seat: TheaterSeat,
  selectedSeatId: string | null,
  theme: InteriorTheme,
): Color {
  return getSeatPalette(theme).back[getSeatColorKey(seat, selectedSeatId)];
}

/** ヘッドレスト枕の色（座面より僅かに明るい）を返す */
export function getSeatHeadrestColor(
  seat: TheaterSeat,
  selectedSeatId: string | null,
  theme: InteriorTheme,
): Color {
  return getSeatPalette(theme).headrest[getSeatColorKey(seat, selectedSeatId)];
}
