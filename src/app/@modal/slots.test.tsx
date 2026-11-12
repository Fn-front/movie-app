/**
 * @modal スロットの「何も出さない」ルートのテスト
 *
 * どちらも null を返すだけだが、消すと挙動が壊れる種類のファイルなので
 * 役割をテストとして残す（#1033）。
 */

import ModalCatchAll from './[...catchAll]/page';
import ModalDefault from './default';

describe('@modal スロット', () => {
  // 名前付きスロットに default が無いと、スロットが当たらない
  // ハードナビゲーション全部でエラーになる
  it('default はモーダルを出さない', () => {
    expect(ModalDefault()).toBeNull();
  });

  // パラレルルートはソフト遷移でスロットに当たらなくなっても直前の中身を
  // 出し続ける。null を返すルートが無いと、モーダルが遷移先に被さり続ける
  it('catchAll はモーダルを出さない', () => {
    expect(ModalCatchAll()).toBeNull();
  });
});
