/**
 * 一人称視点のユーザー操作（見回し・ズーム）の純ロジック。
 *
 * カメラ位置（＝選択座席の目線）は動かさず、**向きとFOVだけ**をユーザー操作で
 * 上乗せする。ここは R3F に依存しない計算のみを持ち、入力イベントの扱いは
 * `hooks/useFirstPersonLook`、3Dへの適用は `component/theaterScene` が担う。
 *
 * 角度の定義（three.js の Euler 'YXZ' に合わせる）:
 * - カメラは自身のローカル -Z 方向を見る。
 * - yaw が正 = 画面左へ向く（-X 側）、pitch が正 = 見上げる（+Y 側）。
 */

/** ユーザー操作による視点のずれ（基準の向きからの差分）とズーム倍率 */
export interface LookOffset {
  /** 水平の首振り量 (rad)。正で画面左を向く */
  yaw: number;
  /** 上下の首振り量 (rad)。正で見上げる */
  pitch: number;
  /** 自動算出FOVに対するズーム倍率。1 が等倍 */
  zoom: number;
}

/** 視点の向き（基準の姿勢） */
export interface LookOrientation {
  yaw: number;
  pitch: number;
}

/**
 * 3Dカメラと入力フックで共有する視点状態。
 * フック（`hooks/useFirstPersonLook`）が操作量を書き込み、カメラ
 * （`component/theaterScene`）が毎フレーム読んで姿勢に反映する。
 */
export interface FirstPersonLookState extends LookOffset {
  /**
   * カメラ側が毎フレーム書き込む、自動算出された基準の上下角 (rad)。
   * ユーザー操作分を「基準＋操作分」の合計でクランプするために参照する。
   */
  basePitch: number;
  /**
   * リセット要求の通し番号。値が変わったらカメラ側が現在の向きから
   * 初期視点へイーズで戻す。
   */
  resetToken: number;
}

/** 操作していない初期状態 */
export const DEFAULT_LOOK_OFFSET: LookOffset = { yaw: 0, pitch: 0, zoom: 1 };

/**
 * 上下角（基準＋ユーザー操作の合計）の上限 (rad)。
 * 真上・真下に近づくと Euler 'YXZ' の表現で天地が反転して見えるため、
 * 90°の手前で頭打ちにする。
 */
export const MAX_TOTAL_PITCH_RAD = (85 * Math.PI) / 180;

/** ズーム倍率の下限・上限 */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.5;

/**
 * ズーム適用後のFOV(度)の下限・上限。
 * 倍率だけで決めると、基準FOVがフォーマットで変わる（IMAXは広い）ぶん
 * 極端な望遠・魚眼になりうるので、最終的な画角でも歯止めをかける。
 */
export const MIN_FOV_DEG = 20;
export const MAX_FOV_DEG = 100;

/** キー1打あたりの回転角 (rad) */
export const KEY_LOOK_STEP_RAD = (3 * Math.PI) / 180;

/** キー1打あたりのズーム倍率 */
export const KEY_ZOOM_STEP = 1.1;

/** ドラッグとクリック（席替え）を区別する移動量のしきい値 (px) */
export const DRAG_THRESHOLD_PX = 5;

/**
 * 画面幅いっぱいのドラッグで回る角度 (rad)。
 * 縦方向も同じ「幅あたりの角度」で換算するため、斜めドラッグでも
 * 縦横の感度が食い違わない。
 */
export const DRAG_RAD_PER_VIEWPORT_WIDTH = Math.PI;

/** ホイールの deltaY 1 あたりのズーム指数係数 */
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

/**
 * カメラ位置と注視点から、基準となる yaw/pitch を求める。
 *
 * 既存実装は毎フレーム `camera.lookAt()` で姿勢を決めていたが、ユーザーの
 * 首振りを上乗せするには角度として扱える必要があるため、同じ姿勢を
 * Euler 'YXZ' の角度に置き換える。
 *
 * @param position カメラ位置 [x, y, z]
 * @param target 注視点 [x, y, z]
 */
export function calcBaseOrientation(
  position: readonly [number, number, number],
  target: readonly [number, number, number],
): LookOrientation {
  const dx = target[0] - position[0];
  const dy = target[1] - position[1];
  const dz = target[2] - position[2];
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  // 位置と注視点が同一だと向きが定まらない。真正面にフォールバックする
  if (length === 0 || !Number.isFinite(length)) return { yaw: 0, pitch: 0 };

  return {
    pitch: Math.asin(dy / length),
    // カメラの前方は -Z なので、符号を反転した成分から水平角を取る
    yaw: Math.atan2(-dx, -dz),
  };
}

/**
 * ユーザー操作分の上下角を、基準角との合計が上限に収まるよう切り詰める。
 *
 * @param basePitch 自動算出された基準の上下角 (rad)
 * @param userPitch ユーザー操作による上下角 (rad)
 * @returns 切り詰めた userPitch
 */
export function clampTotalPitch(basePitch: number, userPitch: number): number {
  const min = -MAX_TOTAL_PITCH_RAD - basePitch;
  const max = MAX_TOTAL_PITCH_RAD - basePitch;
  return Math.min(Math.max(userPitch, min), max);
}

/** ズーム倍率を上下限に収める（非有限値は等倍へフォールバック） */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
}

/**
 * ドラッグ量（px）を視点のずれに反映する。
 *
 * 「世界を掴んで動かす」向き（360°ビューアと同じ）にする:
 * 右へドラッグすると視界は左へ流れ、下へドラッグすると上を見る。
 *
 * @param offset 現在のずれ
 * @param dxPx 前フレームからの水平移動量 (px、右が正)
 * @param dyPx 前フレームからの垂直移動量 (px、下が正)
 * @param viewportWidth 操作領域の幅 (px)。感度を画面サイズに依存させないための基準
 * @param basePitch 現在の基準の上下角 (rad)。合計角のクランプに使う
 */
export function applyDragDelta(
  offset: LookOffset,
  dxPx: number,
  dyPx: number,
  viewportWidth: number,
  basePitch: number,
): LookOffset {
  // 幅が取れない状況（未レイアウト等）では感度が定まらないので動かさない
  if (!(viewportWidth > 0)) return offset;
  const radPerPx = DRAG_RAD_PER_VIEWPORT_WIDTH / viewportWidth;
  return {
    yaw: offset.yaw + dxPx * radPerPx,
    pitch: clampTotalPitch(basePitch, offset.pitch + dyPx * radPerPx),
    zoom: offset.zoom,
  };
}

/**
 * キー操作を視点のずれに反映する。
 *
 * 矢印キーは**矢印の向きに視線を動かす**（ドラッグの「掴んで動かす」とは逆の
 * 対応付け）。地図アプリ等と同じ一般的な慣習に合わせている。
 *
 * @returns 対象外のキーなら null（呼び出し側はページの既定動作を妨げないこと）
 */
export function applyKeyboardLook(
  offset: LookOffset,
  key: string,
  basePitch: number,
): LookOffset | null {
  switch (key) {
    case 'ArrowLeft':
      return { ...offset, yaw: offset.yaw + KEY_LOOK_STEP_RAD };
    case 'ArrowRight':
      return { ...offset, yaw: offset.yaw - KEY_LOOK_STEP_RAD };
    case 'ArrowUp':
      return {
        ...offset,
        pitch: clampTotalPitch(basePitch, offset.pitch + KEY_LOOK_STEP_RAD),
      };
    case 'ArrowDown':
      return {
        ...offset,
        pitch: clampTotalPitch(basePitch, offset.pitch - KEY_LOOK_STEP_RAD),
      };
    // '=' / '_' はシフト無しでも増減できるようにするための別名
    case '+':
    case '=':
      return { ...offset, zoom: clampZoom(offset.zoom * KEY_ZOOM_STEP) };
    case '-':
    case '_':
      return { ...offset, zoom: clampZoom(offset.zoom / KEY_ZOOM_STEP) };
    default:
      return null;
  }
}

/**
 * ホイール操作をズームに反映する。
 * 指数で変化させることで、どの倍率でも「1ノッチあたりの見た目の変化量」が揃う。
 */
export function applyWheelZoom(offset: LookOffset, deltaY: number): LookOffset {
  if (!Number.isFinite(deltaY)) return offset;
  return {
    ...offset,
    zoom: clampZoom(offset.zoom * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY)),
  };
}

/**
 * ピンチ操作をズームに反映する。
 * @param ratio 2点間距離の変化比（前回距離に対する今回距離）
 */
export function applyPinchZoom(offset: LookOffset, ratio: number): LookOffset {
  if (!Number.isFinite(ratio) || ratio <= 0) return offset;
  return { ...offset, zoom: clampZoom(offset.zoom * ratio) };
}

/**
 * ズーム倍率を適用した実FOV(度)を求める。
 * 倍率を上げる（ズームイン）ほど画角は狭くなる。
 */
export function applyZoomToFov(baseFovDeg: number, zoom: number): number {
  const safeZoom = clampZoom(zoom);
  const fov = baseFovDeg / safeZoom;
  return Math.min(Math.max(fov, MIN_FOV_DEG), MAX_FOV_DEG);
}
