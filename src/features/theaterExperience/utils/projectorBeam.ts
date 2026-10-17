/**
 * 映写ビーム（投影光の光条）の形状計算
 *
 * 暗い客席では、映写窓からスクリーンへ伸びる光の筋が見える（Dolby Cinema 公式の
 * 客席写真でもはっきり写っている）。映写窓は PR #633 で追加したが、そこから出る
 * 光が無いため「窓があるだけ」の状態だった。
 *
 * 本物のボリュメトリックライトは高価なので、**映写窓からスクリーンへ広がる台形を
 * 2枚直交させて**加算合成する。どの角度から見ても光条として読める、ゲームでよく
 * 使われる近似。
 */

/** 2枚の台形の頂点（各 4頂点 × xyz = 12要素） */
export interface ProjectorBeamQuads {
  /** 水平方向に広がる台形（X方向に開く） */
  horizontal: number[];
  /** 垂直方向に広がる台形（Y方向に開く） */
  vertical: number[];
}

/** 映写窓のサイズ(m)。窓の描画とビームの根元で共有する単一ソース */
export const PROJECTION_PORT_WIDTH = 0.5;
export const PROJECTION_PORT_HEIGHT = 0.4;

/**
 * 映写窓の高さ(m)を返す。
 *
 * 窓そのもの（`BackWallFixtures`）とビームの根元で同じ値を使う必要がある。
 * 別々に計算すると、片方を変えたときにビームが窓からずれる。
 *
 * @param roomHeight 天井高(m)
 * @param walkwayY 最上段通路の高さ(m)
 */
export function calcProjectionPortY(
  roomHeight: number,
  walkwayY: number,
): number {
  return Math.min(roomHeight - 1.2, walkwayY + 2.6);
}

/**
 * ビームの根元の半幅(m)。映写窓の開口そのものなので窓幅から導く。
 * 0 にすると縮退三角形になり、根元が点に潰れて光条として読めない。
 */
const PORT_HALF_SPAN = PROJECTION_PORT_WIDTH / 2;

/**
 * ビームがスクリーンに届く位置の、幕に対する縮尺。
 *
 * 1.0 だと幕の端ちょうどに当たるが、実機の投影は幕より僅かに内側に収まる
 * （黒マスキングに掛からないよう調整されている）。
 */
const SCREEN_FIT = 0.96;

/**
 * ビームの先端を幕より手前で止める量(m)。
 *
 * 幕と同一平面で終わらせると、重なった縁がスクリーン面に線として焼き付く。
 * 僅かに手前で切る。
 */
const SCREEN_PULLBACK = 0.3;

/**
 * 映写窓からスクリーンへ伸びるビームの台形2枚を返す。
 *
 * 座標系は `theater-experience-design.md` の規約どおり **+Z = スクリーン側**。
 * 映写窓は後壁（-Z 側）にあり、スクリーンは +Z 側にある。
 *
 * @param portY 映写窓の高さ(m)
 * @param portZ 映写窓のZ座標(m、通常は後壁)
 * @param screenCenterY スクリーン中心の高さ(m)
 * @param screenCenterZ スクリーン中心のZ座標(m)
 * @param screenWidth スクリーン幅(m)
 * @param screenHeight スクリーン高(m)
 */
export function computeProjectorBeamQuads(
  portY: number,
  portZ: number,
  screenCenterY: number,
  screenCenterZ: number,
  screenWidth: number,
  screenHeight: number,
): ProjectorBeamQuads {
  const halfW = (Math.max(0, screenWidth) / 2) * SCREEN_FIT;
  const halfH = (Math.max(0, screenHeight) / 2) * SCREEN_FIT;
  const p = PORT_HALF_SPAN;
  // 幕と同一平面で終わらせない（縁が幕に線として出る）
  const endZ = screenCenterZ - SCREEN_PULLBACK;

  /*
    水平の台形: 映写窓側は幅 2p、スクリーン側は幅 2*halfW。
    高さ方向は窓とスクリーン中心を結ぶ線上に乗せる（ビームの中心軸）。
  */
  const horizontal = [
    -p,
    portY,
    portZ,
    p,
    portY,
    portZ,
    halfW,
    screenCenterY,
    endZ,
    -halfW,
    screenCenterY,
    endZ,
  ];

  /*
    垂直の台形: 映写窓側は高さ 2p、スクリーン側は高さ 2*halfH。
    X は中心（0）に固定し、水平の台形と直交させる。
  */
  const vertical = [
    0,
    portY - p,
    portZ,
    0,
    portY + p,
    portZ,
    0,
    screenCenterY + halfH,
    endZ,
    0,
    screenCenterY - halfH,
    endZ,
  ];

  return { horizontal, vertical };
}

/**
 * ビームを描画すべきかを返す。
 *
 * 映写窓がスクリーンより前（+Z 側）にあるような不正配置では、
 * 裏返った台形が出るだけなので描かない。
 *
 * @param portY 映写窓の高さ(m)
 * @param portZ 映写窓のZ座標(m)
 * @param screenCenterY スクリーン中心の高さ(m)
 * @param screenCenterZ スクリーン中心のZ座標(m)
 * @param screenWidth スクリーン幅(m)
 * @param screenHeight スクリーン高(m)
 */
export function isProjectorBeamVisible(
  portY: number,
  portZ: number,
  screenCenterY: number,
  screenCenterZ: number,
  screenWidth: number,
  screenHeight: number,
): boolean {
  /*
    非有限値を1つでも通すと NaN の頂点ができ、three の boundingSphere 計算が
    破綻してコンソール警告とカリング異常を起こす。全軸を検証する。
  */
  const finite = [portY, portZ, screenCenterY, screenCenterZ].every(
    Number.isFinite,
  );
  if (!finite) return false;
  if (portZ >= screenCenterZ) return false;
  return screenWidth > 0 && screenHeight > 0;
}
