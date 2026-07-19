/**
 * スクリーン投影シェーダーの配線テスト
 * ScreenMesh が実際に使用するシェーダー（頂点/フラグメント）が、想定の
 * uniform/varying・演出要素を備えていることを表明する。
 */

import { screenFragmentShader } from './screenFragment';
import { screenVertexShader } from './screenVertex';

describe('screenVertexShader', () => {
  it('UV座標をvUvとしてパススルーする', () => {
    expect(screenVertexShader).toContain('varying vec2 vUv');
    expect(screenVertexShader).toContain('vUv = uv');
  });
});

describe('screenFragmentShader', () => {
  it('uTime uniform で時間変化する', () => {
    expect(screenFragmentShader).toContain('uniform float uTime');
  });

  it('ビネット演出を含む', () => {
    expect(screenFragmentShader).toContain('vignette');
  });

  it('フリッカー演出（uTime依存）を含む', () => {
    expect(screenFragmentShader).toContain('flicker');
    expect(screenFragmentShader).toContain('uTime');
  });
});
