/**
 * タイミング攻撃・メールアドレス列挙防止用のランダム遅延
 *
 * ユーザーの存在有無で処理分岐する認証系エンドポイントにおいて、
 * 応答時間分布を近づけてメールアドレスの存在を推定されにくくする。
 */

/** ランダム遅延の最小値（ミリ秒） */
const RANDOM_DELAY_MIN_MS = 200;
/** ランダム遅延の振れ幅（ミリ秒） */
const RANDOM_DELAY_RANGE_MS = 300;

/**
 * 200〜500ms のランダムな遅延を挿入する。
 */
export async function randomDelay(): Promise<void> {
  const delay = RANDOM_DELAY_MIN_MS + Math.random() * RANDOM_DELAY_RANGE_MS;
  await new Promise((resolve) => setTimeout(resolve, delay));
}
