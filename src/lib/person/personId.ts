/**
 * 人物IDのパース
 */

/** 10進の正の整数のみを許可する（先頭0・空白・指数表記を弾く） */
const PERSON_ID_PATTERN = /^[1-9]\d*$/;

/**
 * URLパラメータの人物IDを数値に変換する
 *
 * `Number()` だけで判定すると `'1e3'`（→ 1000）や `' 5 '`（→ 5）を通してしまい、
 * 利用者が入力していないIDの人物ページを開けてしまう。TMDbへ問い合わせる前に
 * 書式で弾く。
 *
 * @param rawId - URLから受け取った文字列
 * @returns 人物ID。書式が不正なら null
 */
export function parsePersonId(rawId: string): number | null {
  if (!PERSON_ID_PATTERN.test(rawId)) return null;

  const personId = Number(rawId);

  // 2^53 を超えると数値として一意に扱えない（TMDbのIDは十分小さいが、
  // 桁数の大きい入力でそのまま TMDb を叩かないよう念のため弾く）
  return Number.isSafeInteger(personId) ? personId : null;
}
