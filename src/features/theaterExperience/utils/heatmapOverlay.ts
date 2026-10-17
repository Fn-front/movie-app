/**
 * 音響ヒートマップ表示中の座席の見せ方
 *
 * ヒートマップは床面に敷いているため、俯瞰では**座席に遮られて列と列の隙間しか
 * 見えなかった**。音響可視化は本機能の主要な指標のひとつなのに、実質成立して
 * いなかった。
 *
 * 面を座席より上へ浮かせる案も試したが、今度は座席が完全に隠れて「どの席が
 * どの音圧か」が読めなくなる。**席を選ぶための指標なので、音場と座席位置は
 * 両方見えている必要がある。** そこで面は床に置いたまま、ヒートマップ表示中だけ
 * 座席を半透明にして透かす。
 */

/**
 * ヒートマップ表示中の座席の不透明度。
 *
 * 下げすぎると座席の形が分からなくなり、上げすぎると床の音場が透けない。
 * 座席のシルエットは保ちつつ床の色が読める値にする。
 */
const DIMMED_SEAT_OPACITY = 0.35;

/**
 * 座席の不透明度を返す。
 *
 * @param isHeatmapVisible ヒートマップを表示中か
 */
export function calcSeatOpacity(isHeatmapVisible: boolean): number {
  return isHeatmapVisible ? DIMMED_SEAT_OPACITY : 1;
}

/**
 * 座席マテリアルを透過設定にすべきかを返す。
 *
 * `transparent` は常時 true にすると不要な描画順ソートが入るため、
 * 透過が要るときだけ立てる。
 *
 * @param isHeatmapVisible ヒートマップを表示中か
 */
export function isSeatTransparent(isHeatmapVisible: boolean): boolean {
  return isHeatmapVisible;
}
