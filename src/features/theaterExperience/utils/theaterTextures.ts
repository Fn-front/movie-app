/**
 * 内装テクスチャの手続き的生成（CanvasTexture）
 *
 * カーペット柄・壁グラフィック・幕のパーフォレーションを実行時に `<canvas>` へ
 * 描画してテクスチャ化する。画像アセットをリポジトリに置かないための方針
 * （設計書 §2.2 / §4）。参考写真の意匠はいずれも幾何学的なため Canvas 2D で足りる。
 *
 * 生成結果はモジュールレベルにキャッシュする。種類とフォーマットの組み合わせは
 * 有界（最大9枚・合計1MB未満）なので、明示的な dispose は行わない。
 */

import { CanvasTexture, RepeatWrapping, SRGBColorSpace, Texture } from 'three';

import type { CarpetPattern, InteriorTheme } from './theaterPalette';

/** カーペットテクスチャの一辺（px） */
const CARPET_SIZE = 256;
/** 壁グラフィックテクスチャの一辺（px） */
const WALL_GRAPHIC_SIZE = 512;
/** 幕パーフォレーションテクスチャの一辺（px） */
const PERFORATION_SIZE = 64;

/** カーペット柄1タイルが対応する実寸（m）。UV repeat の算出に使う */
export const CARPET_TILE_METERS = 4;
/** パーフォレーション1タイルが対応する実寸（m） */
export const PERFORATION_TILE_METERS = 0.25;

/** 生成済みテクスチャのキャッシュ（キー: `${kind}:${識別子}`） */
const cache = new Map<string, Texture>();

/**
 * 2Dコンテキスト付きの canvas を用意する。
 *
 * jsdom には canvas の実装が無く `getContext` が null を返す（`canvas` パッケージは
 * 依存最小主義により導入しない）。その場合も描画をスキップしてテクスチャ自体は
 * 返し、テスト環境で例外を投げないようにする。
 */
function createCanvas(size: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
} {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

/**
 * canvas から three のテクスチャを作る。
 * sRGB を明示しないと three r152 以降で色が明るく転ぶため必ず設定する。
 */
function toTexture(canvas: HTMLCanvasElement): Texture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/**
 * 柄を描く。`Math.random()` は使わず、インデックスから決定論的に配置を決める
 * （部屋サイズが同じなら毎回同じ見た目になり、E2Eスクリーンショットが安定する）。
 */
function drawPattern(
  ctx: CanvasRenderingContext2D,
  size: number,
  pattern: CarpetPattern,
  base: string,
  motif: string,
): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = motif;
  ctx.strokeStyle = motif;

  if (pattern === 'dots') {
    // 金のボケ円。半径と不透明度を周期的にずらして散らす
    const step = size / 6;
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 6; col++) {
        const i = row * 6 + col;
        // 行ごとに半ステップずらして格子感を消す
        const cx = col * step + (row % 2 === 0 ? step * 0.25 : step * 0.75);
        const cy = row * step + step * 0.5;
        const radius = step * (0.18 + ((i * 7) % 5) * 0.06);
        ctx.globalAlpha = 0.18 + ((i * 3) % 4) * 0.12;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (pattern === 'swoop') {
    // 太いベジェ曲線を低不透明度で重ねる
    ctx.lineWidth = size * 0.09;
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const offset = (i / 5) * size;
      ctx.globalAlpha = 0.14 + (i % 3) * 0.07;
      ctx.beginPath();
      ctx.moveTo(-size * 0.1, offset);
      ctx.bezierCurveTo(
        size * 0.3,
        offset - size * 0.35,
        size * 0.7,
        offset + size * 0.35,
        size * 1.1,
        offset,
      );
      ctx.stroke();
    }
  } else {
    // diagonal: 細い斜めストライプを低コントラストで引く
    ctx.lineWidth = size * 0.02;
    const gap = size / 10;
    ctx.globalAlpha = 0.2;
    for (let i = -10; i < 20; i++) {
      ctx.beginPath();
      ctx.moveTo(i * gap, 0);
      ctx.lineTo(i * gap + size, size);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
}

/**
 * カーペットテクスチャを返す（フォーマット単位でキャッシュ）。
 *
 * repeat は貼る面の実寸に応じて呼び出し側で設定する。テクスチャ自体は共有される
 * ため、面ごとに異なる repeat が要る場合は `texture.clone()` してから設定する。
 *
 * @param theme 内装テーマ
 */
export function getCarpetTexture(theme: InteriorTheme): Texture {
  const key = `carpet:${theme.carpet.base}:${theme.carpet.motif}:${theme.carpet.pattern}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const { canvas, ctx } = createCanvas(CARPET_SIZE);
  if (ctx) {
    drawPattern(
      ctx,
      CARPET_SIZE,
      theme.carpet.pattern,
      theme.carpet.base,
      theme.carpet.motif,
    );
  }
  const texture = toTexture(canvas);
  cache.set(key, texture);
  return texture;
}

/**
 * 壁グラフィックテクスチャを返す。`kind === 'none'` の場合は null。
 *
 * @param theme 内装テーマ
 */
export function getWallGraphicTexture(theme: InteriorTheme): Texture | null {
  const { kind, color } = theme.wallGraphic;
  if (kind === 'none') return null;

  const key = `wallGraphic:${kind}:${color}:${theme.wall}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const { canvas, ctx } = createCanvas(WALL_GRAPHIC_SIZE);
  if (ctx) {
    drawPattern(ctx, WALL_GRAPHIC_SIZE, kind, theme.wall, color);
  }
  const texture = toTexture(canvas);
  cache.set(key, texture);
  return texture;
}

/**
 * 幕のパーフォレーション（微細な穴あき）テクスチャを返す。
 * テーマに依存しないシングルトン。
 */
export function getScreenPerforationTexture(): Texture {
  const key = 'perforation';
  const cached = cache.get(key);
  if (cached) return cached;

  const { canvas, ctx } = createCanvas(PERFORATION_SIZE);
  if (ctx) {
    // 白地に暗点を格子状に打つ。幕面へ乗算合成してわずかに沈ませる
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PERFORATION_SIZE, PERFORATION_SIZE);
    ctx.fillStyle = '#c8c8c8';
    const step = PERFORATION_SIZE / 16;
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 16; col++) {
        ctx.beginPath();
        ctx.arc(
          col * step + step / 2,
          row * step + step / 2,
          step * 0.22,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  }
  const texture = toTexture(canvas);
  cache.set(key, texture);
  return texture;
}

/**
 * キャッシュを空にする（テスト用）。
 * 本番コードからは呼ばない。
 */
export function clearTextureCacheForTest(): void {
  cache.forEach((texture) => texture.dispose());
  cache.clear();
}
