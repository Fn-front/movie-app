/**
 * Auth.js の `?error=` を利用者向けの文言に変換する
 *
 * `/auth/error`（`AUTH_PAGE_ERROR_MESSAGES`）と
 * `/auth/signin`（`SIGN_IN_PAGE_ERROR_MESSAGES`）の両方から使う。
 * 飛び先が2つに分かれているだけで、引き方の注意点は同じなので共通化する。
 */

/**
 * コードに対応する文言を返す。知らない値は `DEFAULT` へ
 *
 * ⚠️ `in` 演算子や素の添字参照で判定しないこと。`Object.prototype` まで
 * 辿るため、`?error=toString` で**関数**が、`?error=__proto__` で
 * **オブジェクト**が返り、React が
 * 「Objects are not valid as a React child」で描画ごと落ちる。
 * `?error=` の値はそのまま渡るので URL だけで誰でも踏める（#1240）。
 *
 * `hasOwnProperty` を借りて、自前で定義したキーだけを見る。
 */
export function resolveAuthErrorMessage<
  TMessages extends Record<string, string> & { DEFAULT: string },
>(messages: TMessages, code: string | undefined): string {
  if (code && Object.prototype.hasOwnProperty.call(messages, code)) {
    return messages[code as keyof TMessages];
  }

  return messages.DEFAULT;
}
