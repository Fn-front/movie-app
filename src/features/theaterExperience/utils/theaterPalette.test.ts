/**
 * theaterPalette テスト
 */

import type { TheaterFormat } from '../types';
import { getInteriorTheme, type InteriorTheme } from './theaterPalette';

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

/** テーマ中の「必ず #rrggbb であるべき」色をすべて集める */
function allColors(t: InteriorTheme): string[] {
  return [
    t.wall,
    t.ceiling,
    t.screenWall,
    t.dado,
    t.relief,
    t.reliefShade,
    t.cove,
    t.wallGraphic.color,
    t.carpet.base,
    t.carpet.motif,
    t.seat.cushion,
    t.seat.headrest,
    t.seat.frame,
    t.speaker.cabinet,
    t.speaker.baffle,
    t.speaker.driver,
  ];
}

describe('getInteriorTheme', () => {
  const formats: TheaterFormat[] = ['standard', 'imax', 'dolby_cinema'];

  it('全フォーマットで全ての色が有効な#rrggbbである', () => {
    for (const f of formats) {
      for (const color of allColors(getInteriorTheme(f))) {
        expect(color).toMatch(HEX);
      }
    }
  });

  it('全フォーマットで造作形式・柄種別が既定の値域に収まる', () => {
    for (const f of formats) {
      const t = getInteriorTheme(f);
      expect(['rib', 'facet']).toContain(t.wallTreatment);
      expect(['dots', 'swoop', 'none']).toContain(t.wallGraphic.kind);
      expect(['dots', 'swoop', 'diagonal']).toContain(t.carpet.pattern);
    }
  });

  it('screenGlow は #rrggbb か null のいずれかである', () => {
    for (const f of formats) {
      const glow = getInteriorTheme(f).screenGlow;
      if (glow !== null) expect(glow).toMatch(HEX);
    }
  });

  it('フォーマット間で壁色が異なる（内装差が出る）', () => {
    const walls = formats.map((f) => getInteriorTheme(f).wall);
    expect(new Set(walls).size).toBe(formats.length);
  });

  it('天井は同フォーマットの壁より暗い（投影光の反射抑制）', () => {
    for (const f of formats) {
      const t = getInteriorTheme(f);
      expect(luminance(t.ceiling)).toBeLessThanOrEqual(luminance(t.wall));
    }
  });

  it('造作の暗部は明部より暗い（陰影で形が立つ）', () => {
    for (const f of formats) {
      const t = getInteriorTheme(f);
      expect(luminance(t.reliefShade)).toBeLessThan(luminance(t.relief));
    }
  });

  it('ヘッドレストは座面より明るい（枕が座面から分離して見える）', () => {
    for (const f of formats) {
      const t = getInteriorTheme(f);
      expect(luminance(t.seat.headrest)).toBeGreaterThan(
        luminance(t.seat.cushion),
      );
    }
  });

  it('座席はカーペットに対し十分な輝度差を持つ（俯瞰での識別性）', () => {
    // WCAG 1.4.11 に倣った相対輝度比の近似。設計書 §3.4 の 1.8:1 以上を満たす
    for (const f of formats) {
      const t = getInteriorTheme(f);
      const seat = luminance(t.seat.cushion);
      const carpet = luminance(t.carpet.base);
      const ratio =
        (Math.max(seat, carpet) + 0.05) / (Math.min(seat, carpet) + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(1.8);
    }
  });

  it('Dolbyはファセット壁＋シアンのコーブを持つ（ブラックアウトではない）', () => {
    const dolby = getInteriorTheme('dolby_cinema');
    expect(dolby.wallTreatment).toBe('facet');
    expect(dolby.screenGlow).not.toBeNull();
    // コーブが寒色（青成分が赤成分を上回る）
    const cove = parseInt(dolby.cove.slice(1), 16);
    expect(cove & 0xff).toBeGreaterThan((cove >> 16) & 0xff);
  });

  it('standard と imax のコーブは暖色（赤成分が青成分を上回る）', () => {
    for (const f of ['standard', 'imax'] as TheaterFormat[]) {
      const cove = parseInt(getInteriorTheme(f).cove.slice(1), 16);
      expect((cove >> 16) & 0xff).toBeGreaterThan(cove & 0xff);
    }
  });

  it('imax は壁グラフィックを持たない（素のグラファイト）', () => {
    expect(getInteriorTheme('imax').wallGraphic.kind).toBe('none');
  });

  it('未知フォーマットでも標準トーンにフォールバックする', () => {
    const unknown = getInteriorTheme('unknown' as TheaterFormat);
    expect(unknown).toEqual(getInteriorTheme('standard'));
  });
});
