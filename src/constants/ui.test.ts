/**
 * UI定数のテスト
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { IMAGE_SIZES } from './ui';

describe('IMAGE_SIZES', () => {
  describe('TMDB_LOGO', () => {
    /**
     * SVG の viewBox から本来のアスペクト比を読む
     *
     * 宣言値を直接ハードコードして比べると、ロゴを差し替えたときに
     * テストごと古い値を肯定してしまう。実ファイルを真実源にする
     */
    const svgAspectRatio = (): number => {
      const svg = readFileSync(
        path.join(process.cwd(), 'public/tmdb-logo.svg'),
        'utf8',
      );
      const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];

      if (!viewBox) throw new Error('tmdb-logo.svg に viewBox がありません');

      const [, , width, height] = viewBox.trim().split(/\s+/).map(Number);
      return width / height;
    };

    /**
     * next/image は実レンダリング値と属性値を突き合わせ、片方だけ変化していると
     * 警告を出す（node_modules/next/dist/client/image-component.js:109-112）。
     * 宣言比が実物と合っていれば `height: auto` で両方が連動するため、
     * 「両方一致」か「両方変化」にしかならず警告条件が成立しない。
     * 比がズレると、CSS 幅が宣言幅と一致したときだけ警告が出る
     */
    it('宣言しているアスペクト比がSVGのviewBoxと一致する', () => {
      const declared =
        IMAGE_SIZES.TMDB_LOGO.WIDTH / IMAGE_SIZES.TMDB_LOGO.HEIGHT;
      const actual = svgAspectRatio();

      // 整数で宣言する都合上わずかな丸め差は出るため1%まで許容する
      expect(Math.abs(declared - actual) / actual).toBeLessThan(0.01);
    });

    /**
     * フッターの CSS 幅（60px / lg で 100px）が宣言幅と一致すると、
     * 丸めの関係で「幅は一致・高さだけ変化」になり警告が出る。
     * 実際にこれが #871 の発生条件だった
     */
    it('フッターのCSS幅と宣言幅が一致しない', () => {
      const cssWidths = [60, 100];

      expect(cssWidths).not.toContain(IMAGE_SIZES.TMDB_LOGO.WIDTH);
    });
  });
});
