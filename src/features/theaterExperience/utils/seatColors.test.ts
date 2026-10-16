/**
 * seatColors テスト
 */

import type { TheaterSeat } from '../types';
import { getInteriorTheme } from './theaterPalette';
import {
  BACK_DARKEN,
  COLOR_SELECTED,
  COLOR_WHEELCHAIR,
  getSeatBackColor,
  getSeatColorKey,
  getSeatCushionColor,
  getSeatHeadrestColor,
  getSeatPalette,
} from './seatColors';

const base: TheaterSeat = {
  id: 's1',
  row_label: 'A',
  seat_number: 1,
  position_x: 0,
  position_y: 0,
  position_z: 0,
  seat_type: 'standard',
};

const theme = getInteriorTheme('standard');

describe('getSeatColorKey', () => {
  it('選択中の席は selected（車椅子より優先）', () => {
    expect(getSeatColorKey({ ...base, seat_type: 'wheelchair' }, 's1')).toBe(
      'selected',
    );
  });

  it('車椅子席は wheelchair', () => {
    expect(getSeatColorKey({ ...base, seat_type: 'wheelchair' }, null)).toBe(
      'wheelchair',
    );
  });

  it('通常席は単色 seat（列に依らず一定）', () => {
    expect(getSeatColorKey({ ...base, row_label: 'A' }, null)).toBe('seat');
    expect(getSeatColorKey({ ...base, row_label: 'B' }, null)).toBe('seat');
  });

  it('他席が選択中でも自席の種別には影響しない', () => {
    expect(getSeatColorKey(base, 'other')).toBe('seat');
  });
});

describe('getSeatPalette', () => {
  it('同じテーマでは同一インスタンスを返す（毎回生成しない）', () => {
    expect(getSeatPalette(theme)).toBe(getSeatPalette(theme));
  });

  it('テーマが違えば別インスタンスを返す', () => {
    expect(getSeatPalette(theme)).not.toBe(
      getSeatPalette(getInteriorTheme('imax')),
    );
  });

  it('通常席の座面色はテーマの座席色を反映する', () => {
    for (const format of ['standard', 'imax', 'dolby_cinema'] as const) {
      const t = getInteriorTheme(format);
      expect(getSeatPalette(t).cushion.seat.getHexString()).toBe(
        t.seat.cushion.slice(1),
      );
    }
  });

  it('選択中・車椅子席の色はテーマに依らず機能色で固定される', () => {
    for (const format of ['standard', 'imax', 'dolby_cinema'] as const) {
      const p = getSeatPalette(getInteriorTheme(format));
      expect(p.cushion.selected.getHexString()).toBe(COLOR_SELECTED.slice(1));
      expect(p.cushion.wheelchair.getHexString()).toBe(
        COLOR_WHEELCHAIR.slice(1),
      );
    }
  });
});

describe('getSeatCushionColor / getSeatBackColor / getSeatHeadrestColor', () => {
  it('背もたれは座面より暗い（椅子のシルエットが立つ）', () => {
    for (const format of ['standard', 'imax', 'dolby_cinema'] as const) {
      const t = getInteriorTheme(format);
      const cushion = getSeatCushionColor(base, null, t);
      const back = getSeatBackColor(base, null, t);
      expect(back.r + back.g + back.b).toBeLessThan(
        cushion.r + cushion.g + cushion.b,
      );
    }
  });

  it('背もたれは座面を BACK_DARKEN 倍した色になる', () => {
    const cushion = getSeatCushionColor(base, null, theme);
    const back = getSeatBackColor(base, null, theme);
    expect(back.r).toBeCloseTo(cushion.r * BACK_DARKEN);
  });

  it('ヘッドレストは座面より明るい（枕が座面から分離して見える）', () => {
    for (const format of ['standard', 'imax', 'dolby_cinema'] as const) {
      const t = getInteriorTheme(format);
      const cushion = getSeatCushionColor(base, null, t);
      const headrest = getSeatHeadrestColor(base, null, t);
      expect(headrest.r + headrest.g + headrest.b).toBeGreaterThan(
        cushion.r + cushion.g + cushion.b,
      );
    }
  });

  it('同一種別では同じインスタンスを返す（事前計算マップ）', () => {
    expect(getSeatBackColor(base, null, theme)).toBe(
      getSeatBackColor(base, null, theme),
    );
    expect(getSeatBackColor(base, null, theme)).not.toBe(
      getSeatBackColor(base, 's1', theme),
    );
  });

  it('車椅子席・選択中席でも3部位すべての色が得られる', () => {
    const wheelchair: TheaterSeat = { ...base, seat_type: 'wheelchair' };
    for (const fn of [
      getSeatCushionColor,
      getSeatBackColor,
      getSeatHeadrestColor,
    ]) {
      expect(fn(wheelchair, null, theme)).toBeDefined();
      expect(fn(base, 's1', theme)).toBeDefined();
    }
  });
});
