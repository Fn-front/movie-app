/**
 * Supabase のエラーを throw できる形にする
 *
 * PostgREST のエラーは **`Error` のインスタンスではなく素のオブジェクト**
 * （`{ message, code, details, hint }`）。そのまま throw すると、
 * NextAuth の `AuthError` が `message instanceof Error` のときしか
 * `cause.err` へ保存しないため、**ログイン経路では診断情報が丸ごと消える**。
 *
 * 実測（`auth.ts` の authorize / jwt から throw した場合）:
 *
 * ```
 * 素のオブジェクト → [auth][error] CallbackRouteError: Read more at ...
 *                    cause: undefined        ← 原因が残らない
 * Error インスタンス → cause.err.message: connection terminated unexpectedly
 * ```
 *
 * 障害を「二段階認証が未設定」「コードが違う」に化けさせないのが
 * fail-closed 化の目的なので、原因が残らなければ意味が半分になる。
 */

/** PostgREST が返すエラーのうち、ここで使う部分 */
interface DbErrorLike {
  message: string;
  code?: string;
}

/**
 * throw 可能な `Error` に変換する
 *
 * 元のオブジェクトは `cause` に残すので、呼び出し側は `code` を見られる。
 *
 * @param error Supabase から返ったエラー
 * @param context どの操作で失敗したか（ログで場所を特定するため）
 */
export function toDbError(error: DbErrorLike, context: string): Error {
  const code = error.code ? ` (${error.code})` : '';

  // `new Error(msg, { cause })` は lib ES2022 が要る。target は ES2017 なので
  // プロパティとして付ける（実行時の挙動は同じ）
  return Object.assign(new Error(`${context}: ${error.message}${code}`), {
    cause: error,
  });
}
