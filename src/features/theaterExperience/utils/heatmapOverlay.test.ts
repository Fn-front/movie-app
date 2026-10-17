/**
 * heatmapOverlay テスト
 */

import { calcSeatOpacity, isSeatTransparent } from './heatmapOverlay';
import { materialKey } from '../component/seatMeshes/seatMeshes';

describe('calcSeatOpacity', () => {
  it('ヒートマップ非表示なら不透明のまま', () => {
    expect(calcSeatOpacity(false)).toBe(1);
  });

  it('ヒートマップ表示中は半透明にする（床の音場を透かすため）', () => {
    expect(calcSeatOpacity(true)).toBeLessThan(1);
  });

  it('透かしても座席のシルエットが残る濃さを保つ', () => {
    // 下げすぎると座席の形が分からなくなり、席の位置関係が読めなくなる
    expect(calcSeatOpacity(true)).toBeGreaterThanOrEqual(0.25);
  });
});

describe('isSeatTransparent', () => {
  it('ヒートマップ表示中だけ透過を有効にする', () => {
    expect(isSeatTransparent(true)).toBe(true);
  });

  it('非表示時は透過を切る（不要な描画順ソートを避ける）', () => {
    expect(isSeatTransparent(false)).toBe(false);
  });
});

describe('materialKey', () => {
  it('透過の有無でキーが変わる（マテリアルを作り直させる）', () => {
    /*
      three は `transparent` を実行時に書き換えてもシェーダーを再コンパイルしない。
      キーを変えてマテリアルごと作り直さないと、ヒートマップを後から表示しても
      座席が透けないままになる（実際にこの不具合を踏んだ）。
    */
    expect(materialKey({ transparent: true, opacity: 0.35 })).not.toBe(
      materialKey({ transparent: false, opacity: 1 }),
    );
  });

  it('不透明度だけが違ってもキーは変わらない（無駄な再生成をしない）', () => {
    expect(materialKey({ transparent: true, opacity: 0.2 })).toBe(
      materialKey({ transparent: true, opacity: 0.8 }),
    );
  });
});
