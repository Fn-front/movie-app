/**
 * スピーカーの種別判定・種別ごとの描画サイズ・可視判定ユーティリティ
 *
 * Atmos 9.1.6 の16chを「スクリーンch / サラウンド / 天井」に分類し、種別ごとに
 * 箱のサイズ・形状を差別化する。スクリーンch（L/C/R/LFE）は音響透過スクリーンの
 * 裏に隠れる想定で描画しない（幕の手前への露出を解消）。
 */

import type { SpeakerChannel } from '../types';

/** スピーカー種別 */
export type SpeakerKind = 'screen' | 'surround' | 'ceiling';

/** スクリーン背後のフロントch（音響透過スクリーンの裏＝描画しない） */
const SCREEN_CHANNELS: ReadonlySet<SpeakerChannel> = new Set([
  'L',
  'R',
  'C',
  'LFE',
]);

/** 天井Atmos ch */
const CEILING_CHANNELS: ReadonlySet<SpeakerChannel> = new Set([
  'LTF',
  'RTF',
  'LTM',
  'RTM',
  'LTR',
  'RTR',
]);

/**
 * チャンネルから種別を判定する。
 * スクリーン背後・天井以外（側壁/後壁）はすべてサラウンド扱い。
 */
export function getSpeakerKind(channel: SpeakerChannel): SpeakerKind {
  if (SCREEN_CHANNELS.has(channel)) return 'screen';
  if (CEILING_CHANNELS.has(channel)) return 'ceiling';
  return 'surround';
}

/** スピーカー箱の寸法（m） */
export interface SpeakerBoxSize {
  width: number;
  height: number;
  depth: number;
}

/**
 * 種別ごとの箱サイズ。
 * - surround: 壁掛けの小型縦箱（高さ＞幅）
 * - ceiling: 天井面に埋め込む薄い小型フラッシュ型（高さが薄い）
 * - screen: 非表示だがフォールバック用に従来サイズを保持
 */
const SIZE_BY_KIND: Record<SpeakerKind, SpeakerBoxSize> = {
  screen: { width: 0.6, height: 0.35, depth: 0.4 },
  surround: { width: 0.34, height: 0.5, depth: 0.24 },
  ceiling: { width: 0.5, height: 0.14, depth: 0.5 },
};

/** 種別に対応する箱サイズを返す */
export function getSpeakerSize(kind: SpeakerKind): SpeakerBoxSize {
  return SIZE_BY_KIND[kind];
}

/**
 * 描画すべきか（スクリーンchは幕裏想定で非表示）。
 * サラウンド・天井は目線より上にあり、俯瞰・着席いずれでも設備として表示する。
 */
export function isSpeakerVisible(kind: SpeakerKind): boolean {
  return kind !== 'screen';
}
