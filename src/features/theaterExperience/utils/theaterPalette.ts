/**
 * シアター3Dシーンの内装カラーパレット（フォーマット別）
 *
 * 壁・天井・スクリーン側壁の色を `TheaterFormat` ごとに出し分け、タイプ間の
 * 内装アイデンティティを表現する。特に Dolby Cinema はブラックアウト内装が特徴の
 * ため黒基調にする。床・傾斜床（カーペット）は素材共通のためここでは扱わない。
 */

import type { TheaterFormat } from '../types';

/** 壁・天井・スクリーン側壁の色セット */
export interface WallColors {
  /** 側壁・後壁の色 */
  wall: string;
  /** 天井の色（投影光の反射を抑える暗色） */
  ceiling: string;
  /** スクリーン側壁の色（スクリーンを引き立てる） */
  screenWall: string;
}

/**
 * フォーマット別の内装パレット。
 * - standard: 従来のやや暖かみのあるモーブ灰（汎用シアターの標準トーン）
 * - imax: 反射を抑えたクールなグラファイト（IMAXの中立的な暗内装）
 * - dolby_cinema: ブラックアウト内装を再現する黒マット基調
 */
const PALETTE: Record<TheaterFormat, WallColors> = {
  standard: {
    wall: '#6a5d68',
    ceiling: '#252028',
    screenWall: '#2d2540',
  },
  imax: {
    wall: '#34363d',
    ceiling: '#1c1d22',
    screenWall: '#23252e',
  },
  dolby_cinema: {
    wall: '#141216',
    ceiling: '#0e0d10',
    screenWall: '#0d0c0f',
  },
};

/** 未知フォーマット時のフォールバック（標準トーン） */
const FALLBACK: WallColors = PALETTE.standard;

/**
 * フォーマットに応じた壁・天井・スクリーン側壁の色を返す。
 * 未知の値が来た場合は標準トーンにフォールバックする（描画が破綻しない）。
 *
 * @param format 劇場フォーマット
 * @returns 壁・天井・スクリーン側壁の色セット
 */
export function getWallColors(format: TheaterFormat): WallColors {
  return PALETTE[format] ?? FALLBACK;
}
