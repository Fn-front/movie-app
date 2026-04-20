/**
 * 音響物理計算ユーティリティ（CPU参照実装）
 *
 * 設計書 Section 3.2 の物理モデルをCPUで実装。
 * audioHeatmap.frag.glsl と同一の式を使用すること。
 */

import type { FrequencyBand } from '../types';

/**
 * 大気吸収係数（ISO 9613-1 近似、エンタメ演出値）
 * 単位: 1/m
 */
export const ABSORPTION_COEFFICIENTS: Record<FrequencyBand, number> = {
  low: 0.0001, // 80 Hz
  mid: 0.001, // 1 kHz
  high: 0.003, // 8 kHz
} as const;

/** 音速 (m/s) */
export const SPEED_OF_SOUND = 343;

/** 周波数帯→周波数(Hz)マッピング */
export const FREQUENCY_MAP: Record<FrequencyBand, number> = {
  low: 80,
  mid: 1000,
  high: 8000,
} as const;

/**
 * 3D距離を計算する
 */
export function calcDistance(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 距離減衰（逆二乗則）
 * A_i(p) = P_i / (4π * d²)
 *
 * @param powerWatts スピーカー出力（ワット）
 * @param distance スピーカーとグリッド点の距離（m）
 * @returns 減衰後の強度
 */
export function calcDistanceAttenuation(
  powerWatts: number,
  distance: number,
): number {
  if (distance <= 0) return 0;
  return powerWatts / (4 * Math.PI * distance * distance);
}

/**
 * 大気吸収減衰
 * α(f, d) = exp(-k(f) * d)
 *
 * @param band 周波数帯
 * @param distance 距離（m）
 * @returns 減衰係数（0〜1）
 */
export function calcAtmosphericAbsorption(
  band: FrequencyBand,
  distance: number,
): number {
  const k = ABSORPTION_COEFFICIENTS[band];
  return Math.exp(-k * distance);
}

/**
 * 単一スピーカーの寄与（位相含む）
 * s_i(p, t) = √A_i(p) * α(f, d) * cos(2πft - k*d + φ_i)
 *
 * @param powerWatts スピーカー出力
 * @param distance 距離
 * @param band 周波数帯
 * @param time 時刻（秒）
 * @param phaseOffset 位相オフセット（ラジアン、デフォルト0）
 * @returns 寄与値（正負あり）
 */
export function calcSpeakerContribution(
  powerWatts: number,
  distance: number,
  band: FrequencyBand,
  time: number,
  phaseOffset: number = 0,
): number {
  if (distance <= 0) return 0;

  const attenuation = calcDistanceAttenuation(powerWatts, distance);
  const absorption = calcAtmosphericAbsorption(band, distance);
  const frequency = FREQUENCY_MAP[band];
  const waveNumber = (2 * Math.PI * frequency) / SPEED_OF_SOUND;
  const phase =
    2 * Math.PI * frequency * time - waveNumber * distance + phaseOffset;

  return Math.sqrt(attenuation) * absorption * Math.cos(phase);
}

/**
 * 合成強度（全スピーカーの寄与を合算）
 * I(p, t) = Σ_i s_i(p, t)
 *
 * @param speakers スピーカー配列
 * @param point グリッド点座標
 * @param band 周波数帯
 * @param time 時刻（秒）
 * @returns 合成強度
 */
export function calcTotalIntensity(
  speakers: ReadonlyArray<{
    position_x: number;
    position_y: number;
    position_z: number;
    power_watts: number;
  }>,
  point: { x: number; y: number; z: number },
  band: FrequencyBand,
  time: number,
): number {
  let total = 0;

  for (const speaker of speakers) {
    const distance = calcDistance(
      speaker.position_x,
      speaker.position_y,
      speaker.position_z,
      point.x,
      point.y,
      point.z,
    );

    total += calcSpeakerContribution(speaker.power_watts, distance, band, time);
  }

  return total;
}
