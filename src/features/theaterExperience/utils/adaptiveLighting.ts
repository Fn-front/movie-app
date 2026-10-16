/**
 * 視点別ライティングの強度計算
 *
 * 実映画館は「暗闇＋局所照明」だが、俯瞰（等角投影）はそのまま座席選択UIなので、
 * ここを暗くすると座席の識別性（設計書 §2.3）と既存E2Eスクリーンショットが壊れる。
 * そこで**俯瞰は現状のまま据え置き、一人称だけ劇場照明に落とす**。
 *
 * メッシュ層（`component/theaterScene`）はカバレッジ除外のため、強度の決定と
 * 補間はここへ置く。
 */

import { easeOutCubic } from './fieldOfView';

/** 環境光・半球光・平行光の強度セット */
export interface LightIntensities {
  ambient: number;
  hemisphere: number;
  directional: number;
}

/**
 * 俯瞰時の強度。既存値をそのまま据え置く（変更すると座席選択UIの可用性と
 * E2Eスクリーンショットに影響するため）。
 */
export const OVERVIEW_INTENSITIES: LightIntensities = {
  ambient: 0.5,
  hemisphere: 0.35,
  directional: 1.15,
};

/** 一人称時の強度。着座した観客が見る「暗い客席」を再現する。 */
export const FIRST_PERSON_INTENSITIES: LightIntensities = {
  ambient: 0.12,
  hemisphere: 0.1,
  directional: 0.25,
};

/**
 * 視点に対応する目標強度を返す。
 *
 * @param isFirstPerson 一人称視点か
 */
export function getTargetIntensities(isFirstPerson: boolean): LightIntensities {
  return isFirstPerson ? FIRST_PERSON_INTENSITIES : OVERVIEW_INTENSITIES;
}

/**
 * 2つの強度セットを係数 t で線形補間する。
 *
 * @param from 開始強度
 * @param to 目標強度
 * @param t 0〜1（範囲外はクランプ）
 */
export function lerpIntensities(
  from: LightIntensities,
  to: LightIntensities,
  t: number,
): LightIntensities {
  const k = Math.min(1, Math.max(0, t));
  return {
    ambient: from.ambient + (to.ambient - from.ambient) * k,
    hemisphere: from.hemisphere + (to.hemisphere - from.hemisphere) * k,
    directional: from.directional + (to.directional - from.directional) * k,
  };
}

/**
 * 経過時間から、カメラのフライスルーと同じイージングで補間した強度を返す。
 *
 * 座席選択時には俯瞰→一人称のフライスルー（`easeOutCubic`）があるため、光量変化も
 * 同じ時間・同じイージングで進めてカメラ移動と同期させる。
 *
 * `prefers-reduced-motion` 有効時は `durationS` に 0 を渡して即時切替にする
 * （フライスルーと同じ扱い。WCAG 2.3.3 配慮）。
 *
 * @param from 開始強度
 * @param to 目標強度
 * @param elapsedS 経過時間（秒）
 * @param durationS 遷移時間（秒）。0 以下なら即時に to を返す
 */
export function calcLightIntensities(
  from: LightIntensities,
  to: LightIntensities,
  elapsedS: number,
  durationS: number,
): LightIntensities {
  if (durationS <= 0) return to;
  return lerpIntensities(from, to, easeOutCubic(elapsedS / durationS));
}
