/**
 * パスワード設定リンクの組み立て
 *
 * ベースURLはリクエストの Host ヘッダではなく設定値から取る。Host を信用すると、
 * 攻撃者が仕込んだホスト宛のリンクをメールで配れてしまい、正規のメールから
 * トークンを盗まれる（`password-reset/request` と同じ方針）。
 */

import { ROUTES } from '@/constants';
import { getRequiredEnv } from '@/utils/env';

/**
 * パスワード設定ページのURLを組み立てる
 *
 * 発行アカウントの初回設定にも、利用者自身の再設定と同じページを使う。
 * `/api/auth/password-reset/confirm` は `password_hash` が null なら
 * 新旧同一チェックを素通りするため、初回設定でもそのまま動く。
 *
 * @param token - 平文トークン
 * @returns 設定ページのURL
 */
export function buildAccountSetupUrl(token: string): string {
  const url = new URL(ROUTES.RESET_PASSWORD, getRequiredEnv('NEXTAUTH_URL'));
  url.searchParams.set('token', token);
  return url.toString();
}
