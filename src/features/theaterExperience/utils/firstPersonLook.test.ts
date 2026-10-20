/**
 * firstPersonLook テスト
 */

import {
  DEFAULT_LOOK_OFFSET,
  DRAG_RAD_PER_VIEWPORT_WIDTH,
  KEY_LOOK_STEP_RAD,
  KEY_ZOOM_STEP,
  MAX_FOV_DEG,
  MAX_TOTAL_PITCH_RAD,
  MAX_ZOOM,
  MIN_FOV_DEG,
  MIN_ZOOM,
  applyDragDelta,
  applyKeyboardLook,
  applyPinchZoom,
  applyWheelZoom,
  applyZoomToFov,
  calcBaseOrientation,
  clampTotalPitch,
  clampZoom,
} from './firstPersonLook';

const DEG = Math.PI / 180;

describe('calcBaseOrientation', () => {
  it('-Z方向（真正面）を向くとき yaw も pitch も 0', () => {
    const o = calcBaseOrientation([0, 1.1, 0], [0, 1.1, -10]);
    expect(o.yaw).toBeCloseTo(0, 6);
    expect(o.pitch).toBeCloseTo(0, 6);
  });

  it('注視点が上にあるほど pitch が正（見上げ）になる', () => {
    const o = calcBaseOrientation([0, 1.1, 0], [0, 1.1 + 10, -10]);
    expect(o.pitch).toBeCloseTo(45 * DEG, 6);
    expect(o.yaw).toBeCloseTo(0, 6);
  });

  it('注視点が下にあるほど pitch が負（見下ろし）になる', () => {
    const o = calcBaseOrientation([0, 1.1, 0], [0, 1.1 - 10, -10]);
    expect(o.pitch).toBeCloseTo(-45 * DEG, 6);
  });

  it('注視点が -X 側（画面左）にあると yaw が正になる', () => {
    const o = calcBaseOrientation([0, 1.1, 0], [-10, 1.1, -10]);
    expect(o.yaw).toBeCloseTo(45 * DEG, 6);
    expect(o.pitch).toBeCloseTo(0, 6);
  });

  it('注視点が +X 側（画面右）にあると yaw が負になる', () => {
    const o = calcBaseOrientation([0, 1.1, 0], [10, 1.1, -10]);
    expect(o.yaw).toBeCloseTo(-45 * DEG, 6);
  });

  it('真後ろ（+Z方向）を向くとき yaw は ±180°', () => {
    const o = calcBaseOrientation([0, 1.1, 0], [0, 1.1, 10]);
    expect(Math.abs(o.yaw)).toBeCloseTo(Math.PI, 6);
  });

  it('位置と注視点が同一でも NaN を返さない', () => {
    const o = calcBaseOrientation([1, 2, 3], [1, 2, 3]);
    expect(o.yaw).toBe(0);
    expect(o.pitch).toBe(0);
  });
});

describe('clampTotalPitch', () => {
  it('合計が上限内ならユーザー操作分をそのまま返す', () => {
    expect(clampTotalPitch(10 * DEG, 20 * DEG)).toBeCloseTo(20 * DEG, 6);
  });

  it('基準角と合算して上限を超える分を切り詰める', () => {
    // 基準 22° + ユーザー 80° = 102° > 85° なので 63° に切り詰める
    expect(clampTotalPitch(22 * DEG, 80 * DEG)).toBeCloseTo(63 * DEG, 6);
  });

  it('下向きも同じ上限で切り詰める', () => {
    // 基準 -5° + ユーザー -100° = -105° < -85° なので -80° に切り詰める
    expect(clampTotalPitch(-5 * DEG, -100 * DEG)).toBeCloseTo(-80 * DEG, 6);
  });

  it('基準角だけで上限に達していればユーザー操作分は 0 以下になる', () => {
    const clamped = clampTotalPitch(MAX_TOTAL_PITCH_RAD, 10 * DEG);
    expect(clamped).toBeCloseTo(0, 6);
  });
});

describe('applyDragDelta', () => {
  const viewportWidth = 800;

  it('右へドラッグすると yaw が増える（世界を掴んで動かす向き）', () => {
    const next = applyDragDelta(DEFAULT_LOOK_OFFSET, 100, 0, viewportWidth, 0);
    expect(next.yaw).toBeGreaterThan(0);
  });

  it('下へドラッグすると pitch が増える（見上げる）', () => {
    const next = applyDragDelta(DEFAULT_LOOK_OFFSET, 0, 100, viewportWidth, 0);
    expect(next.pitch).toBeGreaterThan(0);
  });

  it('画面幅いっぱいのドラッグでちょうど規定角だけ回る', () => {
    const next = applyDragDelta(
      DEFAULT_LOOK_OFFSET,
      viewportWidth,
      0,
      viewportWidth,
      0,
    );
    expect(next.yaw).toBeCloseTo(DRAG_RAD_PER_VIEWPORT_WIDTH, 6);
  });

  it('縦も横と同じ画角レートで回る（斜めドラッグが歪まない）', () => {
    const next = applyDragDelta(DEFAULT_LOOK_OFFSET, 120, 120, viewportWidth, 0);
    expect(next.pitch).toBeCloseTo(next.yaw, 6);
  });

  it('yaw は一周を超えても制限しない（左右は無制限）', () => {
    const next = applyDragDelta(
      { yaw: 3 * Math.PI, pitch: 0, zoom: 1 },
      10,
      0,
      viewportWidth,
      0,
    );
    expect(next.yaw).toBeGreaterThan(3 * Math.PI);
  });

  it('pitch は基準角との合計で上限クランプされる', () => {
    const next = applyDragDelta(
      DEFAULT_LOOK_OFFSET,
      0,
      100000,
      viewportWidth,
      20 * DEG,
    );
    expect(next.pitch).toBeCloseTo(MAX_TOTAL_PITCH_RAD - 20 * DEG, 6);
  });

  it('ズーム倍率は変化しない', () => {
    const next = applyDragDelta(
      { yaw: 0, pitch: 0, zoom: 1.8 },
      50,
      50,
      viewportWidth,
      0,
    );
    expect(next.zoom).toBe(1.8);
  });

  it('画面幅が取得できない（0以下）場合は回転させない', () => {
    const next = applyDragDelta(DEFAULT_LOOK_OFFSET, 100, 100, 0, 0);
    expect(next.yaw).toBe(0);
    expect(next.pitch).toBe(0);
  });
});

describe('applyKeyboardLook', () => {
  it('ArrowRight は右を向く（yaw が減る）', () => {
    const next = applyKeyboardLook(DEFAULT_LOOK_OFFSET, 'ArrowRight', 0);
    expect(next?.yaw).toBeCloseTo(-KEY_LOOK_STEP_RAD, 6);
  });

  it('ArrowLeft は左を向く（yaw が増える）', () => {
    const next = applyKeyboardLook(DEFAULT_LOOK_OFFSET, 'ArrowLeft', 0);
    expect(next?.yaw).toBeCloseTo(KEY_LOOK_STEP_RAD, 6);
  });

  it('ArrowUp は見上げる（pitch が増える）', () => {
    const next = applyKeyboardLook(DEFAULT_LOOK_OFFSET, 'ArrowUp', 0);
    expect(next?.pitch).toBeCloseTo(KEY_LOOK_STEP_RAD, 6);
  });

  it('ArrowDown は見下ろす（pitch が減る）', () => {
    const next = applyKeyboardLook(DEFAULT_LOOK_OFFSET, 'ArrowDown', 0);
    expect(next?.pitch).toBeCloseTo(-KEY_LOOK_STEP_RAD, 6);
  });

  it('ArrowUp も基準角との合計で上限クランプされる', () => {
    const next = applyKeyboardLook(
      { yaw: 0, pitch: MAX_TOTAL_PITCH_RAD, zoom: 1 },
      'ArrowUp',
      10 * DEG,
    );
    expect(next?.pitch).toBeCloseTo(MAX_TOTAL_PITCH_RAD - 10 * DEG, 6);
  });

  it('+ キーでズームインする', () => {
    const next = applyKeyboardLook(DEFAULT_LOOK_OFFSET, '+', 0);
    expect(next?.zoom).toBeCloseTo(KEY_ZOOM_STEP, 6);
  });

  it('= キーも + と同じ扱いにする（シフト無しのキーボード配列向け）', () => {
    const next = applyKeyboardLook(DEFAULT_LOOK_OFFSET, '=', 0);
    expect(next?.zoom).toBeCloseTo(KEY_ZOOM_STEP, 6);
  });

  it('- キーでズームアウトする', () => {
    const next = applyKeyboardLook(DEFAULT_LOOK_OFFSET, '-', 0);
    expect(next?.zoom).toBeCloseTo(1 / KEY_ZOOM_STEP, 6);
  });

  it('ズームは上下限でクランプされる', () => {
    expect(
      applyKeyboardLook({ yaw: 0, pitch: 0, zoom: MAX_ZOOM }, '+', 0)?.zoom,
    ).toBe(MAX_ZOOM);
    expect(
      applyKeyboardLook({ yaw: 0, pitch: 0, zoom: MIN_ZOOM }, '-', 0)?.zoom,
    ).toBe(MIN_ZOOM);
  });

  it('対象外のキーは null を返す（ページ側の既定動作を妨げない）', () => {
    expect(applyKeyboardLook(DEFAULT_LOOK_OFFSET, 'Tab', 0)).toBeNull();
    expect(applyKeyboardLook(DEFAULT_LOOK_OFFSET, 'a', 0)).toBeNull();
  });
});

describe('applyWheelZoom', () => {
  it('手前へのホイール（deltaY > 0）でズームアウトする', () => {
    const next = applyWheelZoom(DEFAULT_LOOK_OFFSET, 100);
    expect(next.zoom).toBeLessThan(1);
  });

  it('奥へのホイール（deltaY < 0）でズームインする', () => {
    const next = applyWheelZoom(DEFAULT_LOOK_OFFSET, -100);
    expect(next.zoom).toBeGreaterThan(1);
  });

  it('上下限を超えない', () => {
    expect(applyWheelZoom(DEFAULT_LOOK_OFFSET, -100000).zoom).toBe(MAX_ZOOM);
    expect(applyWheelZoom(DEFAULT_LOOK_OFFSET, 100000).zoom).toBe(MIN_ZOOM);
  });

  it('向きは変えない', () => {
    const next = applyWheelZoom({ yaw: 0.3, pitch: -0.2, zoom: 1 }, 100);
    expect(next.yaw).toBe(0.3);
    expect(next.pitch).toBe(-0.2);
  });
});

describe('applyPinchZoom', () => {
  it('指を広げる（比が1超）とズームインする', () => {
    expect(applyPinchZoom(DEFAULT_LOOK_OFFSET, 1.5).zoom).toBeCloseTo(1.5, 6);
  });

  it('指を狭める（比が1未満）とズームアウトする', () => {
    expect(applyPinchZoom(DEFAULT_LOOK_OFFSET, 0.5).zoom).toBeCloseTo(0.5, 6);
  });

  it('上下限を超えない', () => {
    expect(applyPinchZoom(DEFAULT_LOOK_OFFSET, 100).zoom).toBe(MAX_ZOOM);
    expect(applyPinchZoom(DEFAULT_LOOK_OFFSET, 0.001).zoom).toBe(MIN_ZOOM);
  });

  it('比が不正（0以下・非有限）なら何もしない', () => {
    expect(applyPinchZoom({ yaw: 0, pitch: 0, zoom: 1.3 }, 0).zoom).toBe(1.3);
    expect(applyPinchZoom({ yaw: 0, pitch: 0, zoom: 1.3 }, NaN).zoom).toBe(1.3);
  });
});

describe('clampZoom', () => {
  it('範囲内はそのまま', () => {
    expect(clampZoom(1.4)).toBe(1.4);
  });

  it('範囲外は上下限に丸める', () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
  });

  it('非有限値は等倍にフォールバックする', () => {
    expect(clampZoom(NaN)).toBe(1);
  });
});

describe('applyZoomToFov', () => {
  it('等倍なら基準FOVのまま', () => {
    expect(applyZoomToFov(60, 1)).toBeCloseTo(60, 6);
  });

  it('ズームインするほどFOVが狭くなる', () => {
    expect(applyZoomToFov(60, 2)).toBeCloseTo(30, 6);
  });

  it('ズームアウトするほどFOVが広くなる', () => {
    expect(applyZoomToFov(50, 0.8)).toBeCloseTo(62.5, 6);
  });

  it('FOVの上下限でクランプする', () => {
    // 40 / 2.5 = 16 → 下限 20 に丸める
    expect(applyZoomToFov(40, MAX_ZOOM)).toBe(MIN_FOV_DEG);
    // 60 / 0.5 = 120 → 上限 100 に丸める
    expect(applyZoomToFov(60, MIN_ZOOM)).toBe(MAX_FOV_DEG);
  });
});
