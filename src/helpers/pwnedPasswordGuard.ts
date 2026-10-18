/**
 * 漏洩パスワードを弾くガード
 *
 * 文字種ポリシー（12文字以上・大小文字・数字）だけでは `Password1234` の
 * ような漏洩リスト上位の文字列を通してしまう。これはブルートフォースより
 * 実効性の高いクレデンシャルスタッフィングに直結するため、新しいパスワードを
 * 受け取る全ての入口で照合する（#652）。
 *
 * 照合はサーバー側でのみ行う。利用者のブラウザから外部サービスへ直接
 * 通信させないため、zod スキーマ（クライアント共有）には入れていない。
 */

import { NextResponse } from 'next/server';

import { isPasswordPwned } from '@/lib/auth/pwnedPassword';
import { HTTP_STATUS, ERROR_CODE } from '@/constants';
import { VALIDATION_MESSAGES } from '@/constants/auth';

/**
 * パスワードが既知の漏洩リストに載っていないかを確認する
 *
 * 照合できなかった場合（API の障害・タイムアウト）は通す。外部サービスの
 * 停止で登録やパスワード変更そのものが止まるのは割に合わないため
 * （`src/lib/auth/pwnedPassword.ts`）。
 *
 * @param password - 設定しようとしている平文パスワード
 * @returns 通過したら null、弾いたらその理由のレスポンス
 */
export async function rejectPwnedPassword(
  password: string,
): Promise<NextResponse | null> {
  if (!(await isPasswordPwned(password))) {
    return null;
  }

  return NextResponse.json(
    {
      success: false,
      error: {
        code: ERROR_CODE.VALIDATION_ERROR,
        message: VALIDATION_MESSAGES.PASSWORD_PWNED,
      },
    },
    { status: HTTP_STATUS.BAD_REQUEST },
  );
}
