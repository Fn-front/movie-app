/**
 * 音響ヒートマップシェーダーのカラーマップ配線テスト
 * レインボー(hue回転)から viridis(CVDセーフ・知覚均一)への置換と、
 * 実バンドル(.ts)と正規ソース(.glsl)の同期を担保する。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fragmentShader } from './audioHeatmap.frag';

/** viridis 多項式近似の代表係数（c0.r） */
const VIRIDIS_MARKER = '0.2777273272234177';

describe('audioHeatmap fragment shader (実バンドル .ts)', () => {
  it('viridis 近似カラーマップを使用する', () => {
    expect(fragmentShader).toContain('intensityToColor');
    expect(fragmentShader).toContain(VIRIDIS_MARKER);
  });

  it('レインボー(hsv2rgb / hue回転)を使用しない', () => {
    expect(fragmentShader).not.toContain('hsv2rgb');
  });
});

describe('audioHeatmap 正規ソース .glsl との同期', () => {
  const glsl = readFileSync(join(__dirname, 'audioHeatmap.frag.glsl'), 'utf8');

  it('.glsl も viridis 係数を持つ', () => {
    expect(glsl).toContain(VIRIDIS_MARKER);
  });

  it('.glsl も hsv2rgb を含まない', () => {
    expect(glsl).not.toContain('hsv2rgb');
  });
});
