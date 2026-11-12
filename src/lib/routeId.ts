/**
 * URLパラメータのID（TMDbの映画ID・人物ID）のパース
 */

/** 10進の正の整数のみを許可する（先頭0・空白・指数表記を弾く） */
const POSITIVE_INT_ID_PATTERN = /^[1-9]\d*$/;

/**
 * URLパラメータのIDを数値に変換する
 *
 * `Number()` だけで判定すると `'1e3'`（→ 1000）や `' 5 '`（→ 5）を通してしまい、
 * 利用者が入力していないIDのページを開けてしまう。TMDbへ問い合わせる前に
 * 書式で弾く。
 *
 * 映画（`/movies/[id]`）と人物（`/person/[id]`）で共用する。TMDbのIDは
 * どちらも正の整数で、許す形も弾きたい形も同じなので分ける理由が無い。
 *
 * @param rawId - URLから受け取った文字列
 * @returns ID。書式が不正なら null
 */
export function parsePositiveIntId(rawId: string): number | null {
  if (!POSITIVE_INT_ID_PATTERN.test(rawId)) return null;

  const id = Number(rawId);

  // 2^53 を超えると数値として一意に扱えない（TMDbのIDは十分小さいが、
  // 桁数の大きい入力でそのまま TMDb を叩かないよう念のため弾く）
  return Number.isSafeInteger(id) ? id : null;
}
