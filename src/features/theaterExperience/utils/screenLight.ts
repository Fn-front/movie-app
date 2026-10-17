/**
 * スクリーン面光源（RectAreaLight）の配置計算
 *
 * 実際の映画館ではスクリーンが室内の主光源で、客席は幕に面した側だけが照らされ、
 * 背面は黒く落ちる。これを点光源や環境光で近似すると「一様に暗いだけ」の絵になり、
 * 立体感が出ない（改修前の状態）。幕と同じ大きさの矩形面光源を置くことで、
 * 幕に正対する面ほど明るいという方向性のある照明になる。
 *
 * メッシュ層（`component/theaterScene`）はカバレッジ除外のため、配置の算出は
 * ここへ置く。
 */

/** 面光源の配置 */
export interface ScreenLightPlacement {
  /** 光源の位置（m） */
  position: [number, number, number];
  /** 光が向く先。RectAreaLight は前面からのみ発光するため向きが要る */
  target: [number, number, number];
  /** 発光面の幅（m） */
  width: number;
  /** 発光面の高さ（m） */
  height: number;
}

/**
 * 幕のごく手前に光源を置くためのオフセット（m）。
 *
 * 幕と完全に同一平面だと、幕自身や黒マスキングが面光源に舐められて
 * 縁が不自然に明るくなる。客席側へ僅かに出す。
 */
const FORWARD_OFFSET = 0.15;

/**
 * スクリーンの寸法・位置から面光源の配置を返す。
 *
 * 座標系は `theater-experience-design.md` の規約どおり **+Z = スクリーン側**。
 * したがって光は -Z 方向（客席側）へ向ける。
 *
 * 湾曲スクリーン（IMAX）も**平面で近似する**。RectAreaLight は矩形しか扱えず、
 * 弧に沿って複数枚並べるとコストが席数ぶん効いてくるうえ、サジッタは 2.06m で
 * 客席までの距離に対して十分小さいため、照明の分布としては差が出ない。
 *
 * @param centerX スクリーン中心X（m）
 * @param centerY スクリーン中心Y（床からの高さ, m）
 * @param centerZ スクリーン中心Z（m）
 * @param width スクリーン幅（m）
 * @param height スクリーン高（m）
 */
export function computeScreenLightPlacement(
  centerX: number,
  centerY: number,
  centerZ: number,
  width: number,
  height: number,
): ScreenLightPlacement {
  const z = centerZ - FORWARD_OFFSET;
  return {
    position: [centerX, centerY, z],
    // 客席側（-Z）へ正対させる
    target: [centerX, centerY, z - 1],
    // 不正な寸法で光源が消えたり巨大化したりしないよう下限を敷く
    width: Math.max(0, width),
    height: Math.max(0, height),
  };
}

/**
 * 面光源を描画すべきかを返す。
 *
 * 強度が実質ゼロのときは光源自体をアンマウントして、俯瞰の描画コストを
 * 改修前と同じに保つ（RectAreaLight は全フラグメントに計算が乗るため、
 * 強度0でもマウントしたままだと無駄なコストになる）。
 *
 * @param intensity 面光源の強度
 * @param width 発光面の幅（m）
 * @param height 発光面の高さ（m）
 */
export function isScreenLightVisible(
  intensity: number,
  width: number,
  height: number,
): boolean {
  if (!Number.isFinite(intensity) || intensity <= 0.001) return false;
  return width > 0 && height > 0;
}
