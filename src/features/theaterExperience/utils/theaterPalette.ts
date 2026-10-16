/**
 * シアター3Dシーンの内装テーマ（フォーマット別）
 *
 * 壁・天井・床・座席・スピーカーの色と、壁の造作形式を `TheaterFormat` ごとに
 * 出し分け、タイプ間の内装アイデンティティを表現する。
 *
 * 値はTOHOシネマズの公式内観写真・シアター構成図を参照して決めている。
 * 詳細な根拠と各色の意図は `.claude/documents/theater-interior-design.md` §3 を参照。
 */

import type { TheaterFormat } from '../types';

/** カーペット柄の種別 */
export type CarpetPattern = 'dots' | 'swoop' | 'diagonal';

/** 壁グラフィックの種別（'none' は下地のみでテクスチャを貼らない） */
export type WallGraphic = 'dots' | 'swoop' | 'none';

/**
 * 壁の造作形式。
 * - `rib`: 等間隔の縦リブ（ルーバー）。TCX・標準館の意匠
 * - `facet`: 多面体ファセット（折り紙状の三角面）。Dolby Cinema の意匠
 */
export type WallTreatment = 'rib' | 'facet';

/** 内装テーマ（フォーマット単位の色・造作の一式） */
export interface InteriorTheme {
  /** 側壁・後壁の下地色 */
  wall: string;
  /** 天井色 */
  ceiling: string;
  /** スクリーン側壁の色 */
  screenWall: string;
  /** 幅木（床から 0.6m の帯）の色 */
  dado: string;
  /** 壁の造作形式 */
  wallTreatment: WallTreatment;
  /** 造作の明部（リブ正面 / ファセット明面）の色 */
  relief: string;
  /** 造作の暗部（リブ側面 / ファセット暗面）の色 */
  reliefShade: string;
  /** コーブ照明の色（HDR化して Bloom に乗せる） */
  cove: string;
  /** 幕外周の発光フレーム色。null なら描かない */
  screenGlow: string | null;
  /** 壁グラフィック */
  wallGraphic: { kind: WallGraphic; color: string };
  /** カーペット */
  carpet: { base: string; motif: string; pattern: CarpetPattern };
  /** 座席 */
  seat: { cushion: string; headrest: string; frame: string };
  /** スピーカー（筐体・バッフル面・ドライバーコーン） */
  speaker: { cabinet: string; baffle: string; driver: string };
}

/**
 * フォーマット別の内装テーマ。
 *
 * - `standard`: 濃紺地に金のボケ円。暗色基調で統一するための意図的な配色であり、
 *   実在の標準館（紫壁＋緑と山吹の三角パネル）の再現ではない。「実物と違う」と
 *   いう理由だけで変更しないこと（設計書 §3.1 参照）
 * - `imax`: 装飾グラフィックを持たない素のグラファイト。縦リブとコーブのみで構成する
 * - `dolby_cinema`: 中濃グレーの多面体ファセット壁＋シアンのコーブ。幕外周に青い
 *   発光フレームを持つ。ブラックアウトの黒い部屋ではない
 */
const THEMES: Record<TheaterFormat, InteriorTheme> = {
  standard: {
    wall: '#23242e',
    ceiling: '#15161a',
    screenWall: '#08070a',
    dado: '#15161c',
    wallTreatment: 'rib',
    relief: '#4a4036',
    reliefShade: '#2a241e',
    cove: '#ffcf9a',
    screenGlow: null,
    wallGraphic: { kind: 'dots', color: '#8a6a2e' },
    carpet: { base: '#1b1d2a', motif: '#6b5426', pattern: 'dots' },
    seat: { cushion: '#8c5a56', headrest: '#9a6762', frame: '#2e2a28' },
    speaker: { cabinet: '#1a1a1c', baffle: '#34343a', driver: '#0e0e10' },
  },
  imax: {
    wall: '#2b2a2e',
    ceiling: '#1a1b1f',
    screenWall: '#08080a',
    dado: '#16161a',
    wallTreatment: 'rib',
    relief: '#55555c',
    reliefShade: '#303036',
    cove: '#ffd8b0',
    screenGlow: null,
    wallGraphic: { kind: 'none', color: '#000000' },
    // 当初 base は #2a1420 だったが、チャコールの座席との輝度比が 1.64 しか
    // 取れず識別性の基準（1.8:1）を割ったため暗い側へ振った（設計書 §3.4）
    carpet: { base: '#1d0e16', motif: '#4a1d26', pattern: 'swoop' },
    seat: { cushion: '#3a3a3e', headrest: '#46464b', frame: '#232326' },
    speaker: { cabinet: '#17171a', baffle: '#2e2e34', driver: '#0c0c0e' },
  },
  dolby_cinema: {
    wall: '#2a2b2f',
    ceiling: '#1e1f22',
    screenWall: '#26272b',
    dado: '#1a1b1e',
    wallTreatment: 'facet',
    relief: '#3a3b40',
    reliefShade: '#1c1d20',
    cove: '#2a9ff0',
    screenGlow: '#1f7fe0',
    wallGraphic: { kind: 'none', color: '#000000' },
    carpet: { base: '#161719', motif: '#202126', pattern: 'diagonal' },
    seat: { cushion: '#44454a', headrest: '#4e4f55', frame: '#1a1b1e' },
    speaker: { cabinet: '#141214', baffle: '#6b5327', driver: '#2a2010' },
  },
};

/** 未知フォーマット時のフォールバック（標準トーン） */
const FALLBACK: InteriorTheme = THEMES.standard;

/**
 * フォーマットに応じた内装テーマを返す。
 * 未知の値が来た場合は標準トーンにフォールバックする（描画が破綻しない）。
 *
 * @param format 劇場フォーマット
 * @returns 内装テーマ
 */
export function getInteriorTheme(format: TheaterFormat): InteriorTheme {
  return THEMES[format] ?? FALLBACK;
}
