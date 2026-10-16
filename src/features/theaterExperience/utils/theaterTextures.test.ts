/**
 * theaterTextures テスト
 *
 * jsdom には canvas の実装が無いため（`canvas` パッケージは依存最小主義により
 * 導入しない）、`getContext` をモックして「発行された描画コマンドの列」を検証する。
 */

import { SRGBColorSpace } from 'three';

import { getInteriorTheme } from './theaterPalette';
import {
  clearTextureCacheForTest,
  getCarpetTexture,
  getScreenPerforationTexture,
  getWallGraphicTexture,
} from './theaterTextures';

/** 2Dコンテキストのモック。呼ばれた描画コマンドを記録する */
function createCtxMock() {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.join(',')})`);
    };
  const ctx = {
    calls,
    fillRect: record('fillRect'),
    beginPath: record('beginPath'),
    arc: record('arc'),
    fill: record('fill'),
    stroke: record('stroke'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    bezierCurveTo: record('bezierCurveTo'),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    globalAlpha: 1,
  };
  return ctx;
}

let ctxMock: ReturnType<typeof createCtxMock>;
let getContextSpy: jest.SpyInstance;

beforeEach(() => {
  clearTextureCacheForTest();
  ctxMock = createCtxMock();
  getContextSpy = jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(ctxMock as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  getContextSpy.mockRestore();
  clearTextureCacheForTest();
});

describe('getCarpetTexture', () => {
  it('sRGB色空間のテクスチャを返す（色が明るく転ばない）', () => {
    const texture = getCarpetTexture(getInteriorTheme('standard'));
    expect(texture.colorSpace).toBe(SRGBColorSpace);
  });

  it('柄種別ごとに異なる描画コマンドを発行する', () => {
    // dots は arc、swoop は bezierCurveTo、diagonal は lineTo を使う
    getCarpetTexture(getInteriorTheme('standard')); // dots
    const dotsCalls = ctxMock.calls.join('|');
    expect(dotsCalls).toContain('arc(');
    expect(dotsCalls).not.toContain('bezierCurveTo(');

    ctxMock.calls.length = 0;
    getCarpetTexture(getInteriorTheme('imax')); // swoop
    const swoopCalls = ctxMock.calls.join('|');
    expect(swoopCalls).toContain('bezierCurveTo(');
    expect(swoopCalls).not.toContain('arc(');

    ctxMock.calls.length = 0;
    getCarpetTexture(getInteriorTheme('dolby_cinema')); // diagonal
    const diagonalCalls = ctxMock.calls.join('|');
    expect(diagonalCalls).toContain('lineTo(');
    expect(diagonalCalls).not.toContain('arc(');
  });

  it('同じテーマの2回目の呼び出しではキャッシュが効き再描画しない', () => {
    const theme = getInteriorTheme('standard');
    const first = getCarpetTexture(theme);
    const callCount = ctxMock.calls.length;
    expect(callCount).toBeGreaterThan(0);

    const second = getCarpetTexture(theme);
    expect(second).toBe(first);
    expect(ctxMock.calls.length).toBe(callCount);
  });

  it('カーペット柄の違うフォーマット同士は別テクスチャになる', () => {
    const a = getCarpetTexture(getInteriorTheme('standard'));
    const b = getCarpetTexture(getInteriorTheme('imax'));
    expect(a).not.toBe(b);
  });

  it('描画は決定論的（同じ入力で同じコマンド列になる）', () => {
    const theme = getInteriorTheme('standard');
    getCarpetTexture(theme);
    const first = [...ctxMock.calls];

    clearTextureCacheForTest();
    ctxMock.calls.length = 0;
    getCarpetTexture(theme);

    expect(ctxMock.calls).toEqual(first);
  });
});

describe('getWallGraphicTexture', () => {
  it('kind が none のフォーマットでは null を返し描画もしない', () => {
    expect(getWallGraphicTexture(getInteriorTheme('imax'))).toBeNull();
    expect(getWallGraphicTexture(getInteriorTheme('dolby_cinema'))).toBeNull();
    expect(ctxMock.calls).toHaveLength(0);
  });

  it('kind が none でなければテクスチャを返す', () => {
    const texture = getWallGraphicTexture(getInteriorTheme('standard'));
    expect(texture).not.toBeNull();
    expect(texture?.colorSpace).toBe(SRGBColorSpace);
  });

  it('2回目の呼び出しではキャッシュが効く', () => {
    const theme = getInteriorTheme('standard');
    const first = getWallGraphicTexture(theme);
    const callCount = ctxMock.calls.length;
    expect(getWallGraphicTexture(theme)).toBe(first);
    expect(ctxMock.calls.length).toBe(callCount);
  });
});

describe('getScreenPerforationTexture', () => {
  it('テーマ非依存のシングルトンを返す', () => {
    const first = getScreenPerforationTexture();
    expect(getScreenPerforationTexture()).toBe(first);
  });

  it('格子状に穴を打つ（16x16 = 256個の円）', () => {
    getScreenPerforationTexture();
    const arcs = ctxMock.calls.filter((c) => c.startsWith('arc('));
    expect(arcs).toHaveLength(256);
  });
});

describe('canvas 非対応環境', () => {
  it('getContext が null を返しても例外を投げずテクスチャを返す', () => {
    getContextSpy.mockReturnValue(null);
    clearTextureCacheForTest();

    expect(() => getCarpetTexture(getInteriorTheme('standard'))).not.toThrow();
    expect(getCarpetTexture(getInteriorTheme('standard')).colorSpace).toBe(
      SRGBColorSpace,
    );
  });
});
