/**
 * Credentials 認証のエラー
 *
 * Auth.js は `CredentialsSignin` を継承したエラーの `code` だけを
 * `signIn()` の戻り値（および URL の `code` パラメータ）に載せる
 * （`node_modules/@auth/core/index.js:133`）。プレーンな `Error` を投げると
 * `error` が `Configuration` になるだけで、クライアント側で種類を判別できない。
 *
 * コードの定義は `src/constants/auth.ts` 側に置いてある。クライアント
 * コンポーネントがコードを参照するだけで `next-auth`（ESM）を引き込むと、
 * Jest の変換対象外になってテストが動かなくなるため。
 */

import { CredentialsSignin } from 'next-auth';

import type { AuthErrorCode } from '@/constants/auth';

/**
 * コード付きの Credentials 認証エラー
 *
 * @param code - クライアントに伝えるコード
 */
export class CredentialsSignInError extends CredentialsSignin {
  constructor(code: AuthErrorCode) {
    super(code);
    this.code = code;
  }
}
