/**
 * タイミング攻撃・メールアドレス列挙防止用のランダム遅延
 *
 * ユーザーの存在有無で処理分岐する認証系エンドポイントにおいて、
 * 応答時間分布を近づけてメールアドレスの存在を推定されにくくする。
 */

import { OTP_RANDOM_DELAY } from '@/constants';

/**
 * 200〜500ms のランダムな遅延を挿入する。
 */
export async function randomDelay(): Promise<void> {
  const delay =
    OTP_RANDOM_DELAY.MIN_MS + Math.random() * OTP_RANDOM_DELAY.RANGE_MS;
  await new Promise((resolve) => setTimeout(resolve, delay));
}
