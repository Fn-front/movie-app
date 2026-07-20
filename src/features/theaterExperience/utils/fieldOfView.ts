/**
 * 視野・歪み計算ユーティリティ
 *
 * 設計書 Section 4 の見え方計算。
 * メトリクス（距離・視野占有率・歪み）は座席の3D位置(X/Y/Z)を考慮するため、
 * 同一列でも中央席と端席で値に差が出る。
 */

import type { FieldOfViewMetrics } from '../types';

/** 2D座標 */
export interface Point2D {
  x: number;
  y: number;
}

/** 3D座標 */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/** スクリーンの寸法と中心位置 */
export interface ScreenGeometry {
  width: number;
  height: number;
  center_x: number;
  center_y: number;
  center_z: number;
}

/**
 * 座席からスクリーン中心までの3Dユークリッド距離。
 * 水平オフセット(X)と高さ(Y)も含むため、同一列でも端席ほど距離が大きくなり、
 * スクリーンが高い位置にある前列では床上の見た目より距離が長くなる。
 */
export function calcDistance3D(seat: Point3D, screenCenter: Point3D): number {
  const dx = seat.x - screenCenter.x;
  const dy = seat.y - screenCenter.y;
  const dz = seat.z - screenCenter.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 座席からスクリーン平面までのZ方向（前後）距離。
 * カメラの前方距離など「スクリーン平面までの垂直距離」が必要な箇所で使う
 * （首振り注視点の計算等）。占有率・歪みの計算には calcDistance3D 等を使う。
 */
export function calcDistanceToScreen(
  seatZ: number,
  screenCenterZ: number,
): number {
  return Math.abs(screenCenterZ - seatZ);
}

/**
 * 視野占有率（水平・垂直, 0〜1）を座席の3D位置から計算する。
 *
 * スクリーンの端が座席から見込む角度(subtense)を求め、人間の視野 π(=180°)で
 * 正規化する。座席がスクリーン中心から左右にずれるほど水平の見込み角は
 * 小さくなる（横長スクリーンを斜めから見るため）ので、同一列でも端席は
 * 占有率が下がる。
 */
export function calcViewingFovRatios(
  seat: Point3D,
  screen: ScreenGeometry,
): { horizontal_ratio: number; vertical_ratio: number } {
  const halfW = screen.width / 2;
  const halfH = screen.height / 2;
  const dz = screen.center_z - seat.z;
  if (dz <= 0) return { horizontal_ratio: 0, vertical_ratio: 0 };

  // 水平: スクリーン左右端の見込み角の差（水平面で計算）
  const dxLeft = screen.center_x - halfW - seat.x;
  const dxRight = screen.center_x + halfW - seat.x;
  const hAngle = Math.atan2(dxRight, dz) - Math.atan2(dxLeft, dz);

  // 垂直: 水平面内の距離を実効距離として上下端の見込み角の差を計算
  const dx = screen.center_x - seat.x;
  const horizDist = Math.sqrt(dx * dx + dz * dz);
  const dyTop = screen.center_y + halfH - seat.y;
  const dyBottom = screen.center_y - halfH - seat.y;
  const vAngle = Math.atan2(dyTop, horizDist) - Math.atan2(dyBottom, horizDist);

  return {
    horizontal_ratio: Math.abs(hAngle) / Math.PI,
    vertical_ratio: Math.abs(vAngle) / Math.PI,
  };
}

/**
 * 歪みスコア（0〜1）。座席からスクリーンを見る視線が「正対」からどれだけ
 * 外れているか（＝台形歪みの強さ）を、水平の斜め角と垂直の見上げ角の合計を
 * 90°で正規化して表す。中央=0に近く、端・前列ほど大きい。
 * - 水平成分: スクリーン中心からの左右ズレ（端席ほど大）
 * - 垂直成分(keystone): スクリーンを見上げる角度。前列ほど近く見上げが急に
 *   なるため距離依存で大きくなる。
 */
export function calcViewingDistortion(
  seat: Point3D,
  screenCenter: Point3D,
): number {
  const dz = screenCenter.z - seat.z;
  if (dz <= 0) return 0;
  const dx = screenCenter.x - seat.x;
  const dy = screenCenter.y - seat.y;
  const horizObliqueness = Math.atan2(Math.abs(dx), dz);
  const horizDist = Math.sqrt(dx * dx + dz * dz);
  const verticalLookUp = Math.atan2(Math.abs(dy), horizDist);
  const total = horizObliqueness + verticalLookUp;
  return Math.min(total / (Math.PI / 2), 1);
}

/**
 * 一人称視点の水平注視点X（首振りの向き）を計算する。
 *
 * 実際の観客の挙動をモデル化する:
 * - スクリーン中心が正面から deadzoneYawRad 以内なら首を振らず真正面を向く
 *   （中央〜中央寄りの席。多少のズレは目・周辺視でカバーするため頭は動かさない）。
 * - それを超える分だけ首を振り、maxYawRad で頭打ちにする（端席が首を振り過ぎない）。
 *
 * ミラー反転前の実座標系で返す（呼び出し側で必要なら -x する）。
 *
 * @param seatX 座席X
 * @param screenCenterX スクリーン中心X
 * @param forwardDistance 座席→スクリーン平面の前方距離（>0 を想定）
 * @param maxYawRad 水平首振りの上限角（ラジアン、>=0）
 * @param deadzoneYawRad 首を振り始めない不感帯の角度（ラジアン、>=0、既定0）
 * @returns 注視点のX座標
 */
export function calcYawClampedTargetX(
  seatX: number,
  screenCenterX: number,
  forwardDistance: number,
  maxYawRad: number,
  deadzoneYawRad = 0,
): number {
  const lateralToCenter = screenCenterX - seatX;
  // 前方距離が取れない場合はスクリーン中心を向く（フォールバック）
  if (forwardDistance <= 0) return screenCenterX;
  // スクリーン中心方向の角度（正面=0）
  const yawToCenter = Math.atan(Math.abs(lateralToCenter) / forwardDistance);
  // 不感帯を超えた分だけ首を振り、上限角で頭打ちにする
  const headYaw = Math.min(
    Math.max(yawToCenter - deadzoneYawRad, 0),
    maxYawRad,
  );
  const lateral =
    Math.sign(lateralToCenter) * forwardDistance * Math.tan(headYaw);
  return seatX + lateral;
}

/**
 * 一人称視点の垂直FOV（度）を、視聴距離とスクリーン高から算出する。
 *
 * 旧実装は全フォーマット共通の fov=85° 固定で、広角すぎて魚眼的な歪みが出るうえ、
 * IMAX(スクリーン高18.9m)と standard(6.7m) のフォーマット差に追従しなかった。
 * ここではスクリーン高が視野に占める見込み角（垂直サブテンス）を基準に、
 * スクリーンが視野の一定割合(fillRatio)を占めるFOVを求め、上下限でクランプする。
 *
 * - 近い/大画面（IMAX最前列など）: サブテンスが大 → FOVは上限に張り付き、
 *   スクリーンがFOVを超えて「はみ出す」実態がそのまま表現される（過小表現しない）。
 * - 遠い/小画面（後列など）: サブテンスが小 → FOVは下限で頭打ちになり、
 *   スクリーンが小さく見える（＝距離感が残る。常に画面いっぱいに再フレームしない）。
 *
 * @param viewingDistance 眼からスクリーン中心までの視聴距離(m, >0想定)
 * @param screenHeight スクリーンの高さ(m)
 * @param options fillRatio: スクリーン高がFOVに占める目標割合 / min,maxFovDeg: FOV上下限(度)
 * @returns 垂直FOV(度)
 */
export function calcFirstPersonFov(
  viewingDistance: number,
  screenHeight: number,
  options: {
    fillRatio?: number;
    minFovDeg?: number;
    maxFovDeg?: number;
  } = {},
): number {
  const { fillRatio = 0.7, minFovDeg = 50, maxFovDeg = 75 } = options;
  if (viewingDistance <= 0 || screenHeight <= 0) return maxFovDeg;
  // スクリーン高の垂直サブテンス（上端・下端の見込み角の差）
  const subtenseRad = 2 * Math.atan(screenHeight / 2 / viewingDistance);
  const fovDeg = ((subtenseRad / fillRatio) * 180) / Math.PI;
  return Math.min(Math.max(fovDeg, minFovDeg), maxFovDeg);
}

/**
 * 一人称視点の垂直注視点Y（見上げの向き）を計算する。
 * calcYawClampedTargetX（水平首振り）の垂直版で、対称のロジック:
 * - スクリーン中心の仰角が deadzonePitchRad 以内なら首を上げず、眼の高さの真正面を向く。
 * - それを超える分だけ首を上向け、maxPitchRad で頭打ちにする（過度な首反りを防ぐ）。
 *
 * 旧実装は「眼の高さ+1.5m」固定で、スクリーン中心Yがフォーマットで大きく異なる
 * （standard 4.35 / IMAX 10.45 等）のに追従せず、特にIMAX前列で見上げが過小表現された。
 * 本関数は実際のスクリーン中心Yに追従し、上限角で頭打ちにする。
 *
 * @param eyeY 眼の高さ(m)
 * @param screenCenterY スクリーン中心のY(m)
 * @param forwardDistance 座席→スクリーン平面の前方距離(m, >0想定)
 * @param maxPitchRad 見上げ角の上限(rad, >=0)
 * @param deadzonePitchRad 首を上げ始めない不感帯(rad, >=0, 既定0)
 * @returns 注視点のY座標
 */
export function calcPitchClampedTargetY(
  eyeY: number,
  screenCenterY: number,
  forwardDistance: number,
  maxPitchRad: number,
  deadzonePitchRad = 0,
): number {
  const verticalToCenter = screenCenterY - eyeY;
  // 前方距離が取れない場合はスクリーン中心の高さを向く（フォールバック）
  if (forwardDistance <= 0) return screenCenterY;
  const pitchToCenter = Math.atan(Math.abs(verticalToCenter) / forwardDistance);
  // 不感帯を超えた分だけ首を上げ、上限角で頭打ちにする
  const headPitch = Math.min(
    Math.max(pitchToCenter - deadzonePitchRad, 0),
    maxPitchRad,
  );
  const vertical =
    Math.sign(verticalToCenter) * forwardDistance * Math.tan(headPitch);
  return eyeY + vertical;
}

/**
 * ease-out cubic 補間係数。俯瞰→一人称のフライスルーで、開始直後に速く動き
 * 着座点へ滑らかに減速して収束させる（0→1 を単調増加で写像）。
 * 範囲外入力は 0〜1 にクランプする。
 */
export function easeOutCubic(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - clamped, 3);
}

/** フライスルー補間の開始状態（開始位置・開始注視点・初期経過秒） */
export interface FlythroughStart {
  from: [number, number, number];
  fromTarget: [number, number, number];
  elapsed: number;
}

/**
 * 一人称フライスルーの開始状態を決定する（R3Fに依存しない純ロジック）。
 * - 初回（俯瞰→一人称）: 俯瞰カメラの位置・注視点から補間を始める（空間の対応付け）。
 * - 一人称中の席替え: 現在のカメラ位置・注視点から補間を始める（滑らかな席移動）。
 * - prefers-reduced-motion 時: elapsed を満了させて即時カット（アニメを飛ばす）。
 *
 * @param params.started 既に一人称カメラが起動済みか（false=初回）
 * @param params.reducedMotion reduced-motion 有効時 true
 * @param params.durationS フライスルー時間(秒)
 * @param params.overviewPos 俯瞰カメラ位置 / overviewTarget 俯瞰注視点
 * @param params.currentPos 現在のカメラ位置 / currentTarget 現在の注視点
 */
export function resolveFlythroughStart(params: {
  started: boolean;
  reducedMotion: boolean;
  durationS: number;
  overviewPos: [number, number, number];
  overviewTarget: [number, number, number];
  currentPos: [number, number, number];
  currentTarget: [number, number, number];
}): FlythroughStart {
  const {
    started,
    reducedMotion,
    durationS,
    overviewPos,
    overviewTarget,
    currentPos,
    currentTarget,
  } = params;
  return {
    from: started ? currentPos : overviewPos,
    fromTarget: started ? currentTarget : overviewTarget,
    elapsed: reducedMotion ? durationS : 0,
  };
}

/**
 * 視野占有率メトリクスを一括計算する（座席の3D位置を考慮）。
 */
export function calcFieldOfViewMetrics(
  seat: { position_x: number; position_y: number; position_z: number },
  screen: ScreenGeometry,
): FieldOfViewMetrics {
  const seatPoint: Point3D = {
    x: seat.position_x,
    y: seat.position_y,
    z: seat.position_z,
  };
  const screenCenter: Point3D = {
    x: screen.center_x,
    y: screen.center_y,
    z: screen.center_z,
  };
  const ratios = calcViewingFovRatios(seatPoint, screen);

  return {
    horizontal_ratio: ratios.horizontal_ratio,
    vertical_ratio: ratios.vertical_ratio,
    distance_to_screen: calcDistance3D(seatPoint, screenCenter),
    distortion_score: calcViewingDistortion(seatPoint, screenCenter),
  };
}

/**
 * スクリーン四隅を座席視点で2D平面に投影する
 * → 台形歪みプレビュー用
 *
 * スクリーンは +Z 方向（前方）を向いていると仮定。
 * 座席視点からの見かけの角度で四隅を2D座標に変換する。
 *
 * @returns [左上, 右上, 右下, 左下] の2D座標
 */
export function projectScreenQuad(
  seat: { x: number; y: number; z: number },
  screen: ScreenGeometry,
): [Point2D, Point2D, Point2D, Point2D] {
  const halfW = screen.width / 2;
  const halfH = screen.height / 2;

  // スクリーン四隅の3D座標
  const corners3D = [
    {
      x: screen.center_x - halfW,
      y: screen.center_y + halfH,
      z: screen.center_z,
    }, // 左上
    {
      x: screen.center_x + halfW,
      y: screen.center_y + halfH,
      z: screen.center_z,
    }, // 右上
    {
      x: screen.center_x + halfW,
      y: screen.center_y - halfH,
      z: screen.center_z,
    }, // 右下
    {
      x: screen.center_x - halfW,
      y: screen.center_y - halfH,
      z: screen.center_z,
    }, // 左下
  ];

  // 座席視点での透視投影（簡易版）
  const dz = screen.center_z - seat.z;
  if (dz <= 0) {
    // スクリーンが座席の後ろにある場合はゼロ
    return [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
  }

  return corners3D.map((corner) => {
    const dx = corner.x - seat.x;
    const dy = corner.y - seat.y;
    const cornerDz = corner.z - seat.z;
    // 透視除算: 角度ベースの2D射影
    return {
      x: Math.atan2(dx, cornerDz),
      y: Math.atan2(dy, cornerDz),
    };
  }) as [Point2D, Point2D, Point2D, Point2D];
}
