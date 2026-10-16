/**
 * スピーカーの向きの変換
 *
 * `theater_speakers` には正規化済みの正面方向ベクトル `direction_x/y/z` が既にあり、
 * 音響の指向性計算（`directivity_alpha` と併用）で実際に使われている。値は
 * `normalize(客席中央 - 設置位置)` で全室に追従して算出済み。
 *
 * 描画層だけがこのデータを無視して固定回転を使っていたため、本モジュールで
 * 方向ベクトル → オイラー角の変換だけを行う。客席重心を再計算しないことで、
 * 「見た目の向き」と「音響シミュレーションが仮定している指向性」が必ず一致し、
 * 二重のソースが生まれない。
 */

/** ゼロベクトルとみなす長さの閾値 */
const EPSILON = 1e-6;

/**
 * 正規化済みの方向ベクトルを、three のメッシュに適用するオイラー角
 * `[pitch, yaw, 0]` へ変換する。
 *
 * バッフル面を +Z 側に作る前提で、
 *   yaw   = Math.atan2(dx, dz)
 *   pitch = -Math.asin(clamp(dy, -1, 1))
 * とする。
 *
 * 俯角のクランプは行わない。DBの値は音響モデルが使っている実際の指向方向であり、
 * 見た目だけ丸めると二重ソース問題が戻るため。
 *
 * @param dx 方向ベクトルのx成分
 * @param dy 方向ベクトルのy成分
 * @param dz 方向ベクトルのz成分
 * @returns `[pitch, yaw, 0]`（rad）。ゼロベクトルなら `[0, 0, 0]`
 */
export function directionToEuler(
  dx: number,
  dy: number,
  dz: number,
): [number, number, number] {
  const length = Math.hypot(dx, dy, dz);
  // ゼロベクトル（未設定・不正データ）で NaN を描画層へ流さない
  if (!Number.isFinite(length) || length < EPSILON) return [0, 0, 0];

  // DBは real 型で丸め誤差が乗りうるため、正規化されていない入力も受け付ける
  const nx = dx / length;
  const ny = dy / length;
  const nz = dz / length;

  const yaw = Math.atan2(nx, nz);
  // clamp しないと丸め誤差で |ny| > 1 になった際に Math.asin が NaN を返す
  const pitch = -Math.asin(Math.min(1, Math.max(-1, ny)));

  return [pitch, yaw, 0];
}
