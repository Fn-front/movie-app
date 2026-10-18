/**
 * 文字列ユーティリティ
 */

/**
 * UTF-8 でのバイト長を返す
 *
 * `String.length` は UTF-16 のコードユニット数なので、バイト数の上限を
 * 扱うときに使うと実態とずれる（日本語は UTF-8 で1文字3バイト、絵文字は
 * 4バイト）。バイト数で決まる制約 — たとえば bcrypt の72バイト — は
 * この関数で判定する。
 *
 * `TextEncoder` を使うのは、サーバー（Node.js）とブラウザの両方で同じ
 * 結果になるため。`Buffer` は Node.js にしか無く、クライアント側の
 * バリデーションと共有できない。
 *
 * @param value - 対象の文字列
 * @returns UTF-8 でのバイト長
 */
export function getByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
