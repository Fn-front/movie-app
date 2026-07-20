/**
 * theaterPalette テスト
 */

import type { TheaterFormat } from '../types';
import { getWallColors } from './theaterPalette';

/** #rrggbb を輝度（0〜1相当の単純平均）に変換 */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`invalid hex: ${hex}`);
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  return (r + g + b) / 3 / 255;
}

const HEX = /^#[0-9a-f]{6}$/i;

describe('getWallColors', () => {
  const formats: TheaterFormat[] = ['standard', 'imax', 'dolby_cinema'];

  it('全フォーマットで有効な#rrggbbの色セットを返す', () => {
    for (const f of formats) {
      const c = getWallColors(f);
      expect(c.wall).toMatch(HEX);
      expect(c.ceiling).toMatch(HEX);
      expect(c.screenWall).toMatch(HEX);
    }
  });

  it('standardは従来トーン（モーブ灰）を維持する', () => {
    expect(getWallColors('standard')).toEqual({
      wall: '#6a5d68',
      ceiling: '#252028',
      screenWall: '#2d2540',
    });
  });

  it('Dolbyは黒基調（最も暗い壁色）である', () => {
    const dolby = luminance(getWallColors('dolby_cinema').wall);
    const standard = luminance(getWallColors('standard').wall);
    const imax = luminance(getWallColors('imax').wall);
    // Dolby の壁が最も暗い（ブラックアウト内装）
    expect(dolby).toBeLessThan(imax);
    expect(dolby).toBeLessThan(standard);
    // 黒基調：十分に低輝度
    expect(dolby).toBeLessThan(0.1);
  });

  it('フォーマット間で壁色が異なる（内装差が出る）', () => {
    const walls = formats.map((f) => getWallColors(f).wall);
    expect(new Set(walls).size).toBe(formats.length);
  });

  it('天井は同フォーマットの壁より暗い（投影光の反射抑制）', () => {
    for (const f of formats) {
      const c = getWallColors(f);
      expect(luminance(c.ceiling)).toBeLessThanOrEqual(luminance(c.wall));
    }
  });

  it('未知フォーマットでも標準トーンにフォールバックする', () => {
    const unknown = getWallColors('unknown' as TheaterFormat);
    expect(unknown).toEqual(getWallColors('standard'));
  });
});
