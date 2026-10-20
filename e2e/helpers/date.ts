/**
 * E2Eテスト用の日付ヘルパー
 *
 * 一覧APIは公開日の範囲を**サーバープロセスのローカル日付**で組み立てる
 * （`src/app/api/movies/route.ts` の `formatDateToString(new Date())`）。
 * テスト側で `toISOString()` を使うとUTC日付になり、JST等のUTC以外の環境では
 * サーバーと1日ずれて範囲が反転し（gte > lte）、常に0件になる。
 * テストとサーバーの基準を揃えるため、ローカル日付で組み立てる。
 */

/**
 * 今日から指定日数ずらした日付をYYYY-MM-DD（ローカル基準）で返す
 *
 * @param days - ずらす日数（負値で過去）
 * @returns YYYY-MM-DD 形式の日付
 */
export function localDateFromToday(days = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
