/**
 * @modal スロットの既定値
 *
 * スロットが現在のURLに当たらないとき（直接アクセス・リロード・
 * 一覧を見ているだけのとき）に描画される。モーダルを出さないので null。
 *
 * ⚠️ 消さないこと。名前付きスロットに default が無いと、スロットが
 * 当たらないハードナビゲーション全部でエラーになる。
 */
export default function ModalDefault() {
  return null;
}
