/**
 * 前席による視線遮蔽（sight line）の計算
 *
 * `theater-experience-design.md` の「含まないもの（将来拡張）」に記録されていた
 * **「前席による視線遮蔽（Dの視野遮蔽）」** に相当する。見え方の指標 A（視野占有率）/
 * B（歪み）/ C（一人称プレビュー）は実装済みで、D だけが未着手だった。
 *
 * 遮蔽は**前席に人が座っている前提（最悪ケース）**で評価する。席の良し悪しは
 * 「誰がたまたま座っているか」ではなく、段差・列ピッチ・頭の高さという**座席配置の
 * 性質**で決まるため。占有率スライダーは見た目の可視化であり、この指標は動かさない。
 */

/** 着座時の目の高さ（座席Y座標からのオフセット, m） */
export const SEATED_EYE_HEIGHT = 1.2;
/** 着座時の頭頂の高さ（座席Y座標からのオフセット, m） */
export const SEATED_HEAD_TOP_HEIGHT = 1.32;

/** 遮蔽計算に必要な座席の位置 */
export interface SightlineSeat {
  position_x: number;
  position_y: number;
  position_z: number;
}

/**
 * ある席の「前の列で最も近い席」を返す。
 *
 * 列は `row_label` でグループ化し、列の代表Z（列内の平均Z）が大きい順＝スクリーンに
 * 近い順に並べる。弧状列では列内でZが変わるため、単純なZ比較では列を特定できない。
 *
 * 前の列の中から、横位置が最も近い席を選ぶ（弧状列でも正面の席を拾える）。
 *
 * @param seat 対象の席
 * @param seats 全座席
 * @returns 前列の最も近い席。最前列なら null
 */
export function findFrontSeat<T extends SightlineSeat & { row_label: string }>(
  seat: T & { row_label: string },
  seats: T[],
): T | null {
  if (seats.length === 0) return null;

  // 列ごとの代表Z（平均）を求める
  const rowZSum = new Map<string, { sum: number; count: number }>();
  for (const s of seats) {
    const entry = rowZSum.get(s.row_label);
    if (entry) {
      entry.sum += Number(s.position_z);
      entry.count += 1;
    } else {
      rowZSum.set(s.row_label, { sum: Number(s.position_z), count: 1 });
    }
  }

  // スクリーンに近い順（Zが大きい順）＝前列から後列へ
  const orderedRows = [...rowZSum.entries()]
    .map(([label, v]) => ({ label, z: v.sum / v.count }))
    .sort((a, b) => b.z - a.z)
    .map((r) => r.label);

  const index = orderedRows.indexOf(seat.row_label);
  // 最前列（index 0）または列が見つからない場合は前席なし
  if (index <= 0) return null;

  const frontLabel = orderedRows[index - 1];
  let nearest: T | null = null;
  let nearestDistance = Infinity;
  for (const s of seats) {
    if (s.row_label !== frontLabel) continue;
    const distance = Math.abs(Number(s.position_x) - Number(seat.position_x));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = s;
    }
  }
  return nearest;
}

/**
 * 前席の頭によってスクリーンの下部が隠れる割合（0〜1）を返す。
 *
 * 眼から見た「幕の下端の仰角」と「前席の頭頂の仰角」を比べ、頭頂の方が高ければ
 * その差を幕の見込み角で正規化する。
 *
 * - 0: 前席の頭が幕の下端より下にある（遮蔽なし）
 * - 1: 幕が完全に隠れる
 *
 * 最前列など前席が無い場合は呼び出し側で 0 を渡す想定（本関数は前席ありを前提）。
 *
 * @param seat 対象の席
 * @param frontSeat 前列の席
 * @param screenCenterY 幕中心のY
 * @param screenHeight 幕の高さ
 * @param screenCenterZ 幕中心のZ
 * @returns 遮蔽率（0〜1）
 */
export function calcFrontRowOcclusion(
  seat: SightlineSeat,
  frontSeat: SightlineSeat,
  screenCenterY: number,
  screenHeight: number,
  screenCenterZ: number,
): number {
  const eyeY = Number(seat.position_y) + SEATED_EYE_HEIGHT;
  const distanceToScreen = screenCenterZ - Number(seat.position_z);
  const distanceToHead = Number(frontSeat.position_z) - Number(seat.position_z);

  // 幕が後方にある／前席が前方にない等の不正配置では遮蔽なしとして扱う
  if (!(distanceToScreen > 0) || !(distanceToHead > 0)) return 0;

  const screenBottomY = screenCenterY - screenHeight / 2;
  const screenTopY = screenCenterY + screenHeight / 2;
  const headTopY = Number(frontSeat.position_y) + SEATED_HEAD_TOP_HEIGHT;

  const bottomAngle = Math.atan2(screenBottomY - eyeY, distanceToScreen);
  const topAngle = Math.atan2(screenTopY - eyeY, distanceToScreen);
  const headAngle = Math.atan2(headTopY - eyeY, distanceToHead);

  const screenSubtense = topAngle - bottomAngle;
  if (!(screenSubtense > 0)) return 0;

  const blocked = headAngle - bottomAngle;
  if (blocked <= 0) return 0;
  return Math.min(blocked / screenSubtense, 1);
}
