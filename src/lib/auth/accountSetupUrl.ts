/**
 * パスワード設定リンクの組み立て
 *
 * ベースURLはリクエストの Host ヘッダではなく設定値から取る。Host を信用すると、
 * 攻撃者が仕込んだホスト宛のリンクをメールで配れてしまい、正規のメールから
 * トークンを盗まれる（`password-reset/request` と同じ方針）。
 */

import { ROUTES } from '@/constants';
import {
  ACCOUNT_SETUP_ISSUED_PARAM,
  ACCOUNT_SETUP_USERNAME_PARAM,
} from '@/constants/adminAccount';
import { getRequiredEnv } from '@/utils/env';

/**
 * パスワード設定ページのURLを組み立てる
 *
 * 発行アカウントの初回設定にも、利用者自身の再設定と同じページを使う。
 * `/api/auth/password-reset/confirm` は `password_hash` が null なら
 * 新旧同一チェックを素通りするため、初回設定でもそのまま動く。
 *
 * @param token - 平文トークン
 * @param username - ログインに使うアカウント名。設定ページに表示する
 * @returns 設定ページのURL
 */
export function buildAccountSetupUrl(token: string, username: string): string {
  const url = new URL(ROUTES.RESET_PASSWORD, getRequiredEnv('NEXTAUTH_URL'));
  url.searchParams.set('token', token);

  // 発行経由であることを設定ページへ伝える。受け取り手は自力で再送できない
  // ため、「再設定リンクを再送する」を出すと行き止まりになる
  url.searchParams.set(
    ACCOUNT_SETUP_ISSUED_PARAM.NAME,
    ACCOUNT_SETUP_ISSUED_PARAM.VALUE,
  );

  // ログインに使う値を画面にも出す（#1237）。メール本文にしか無かったため、
  // メールを閉じた利用者がメールアドレスを入れてログインに失敗していた
  url.searchParams.set(ACCOUNT_SETUP_USERNAME_PARAM, username);

  return url.toString();
}
