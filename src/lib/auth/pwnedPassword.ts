/**
 * 漏洩パスワード照合（HIBP Pwned Passwords API）
 *
 * NIST SP 800-63B は文字種の強制よりも「漏洩パスワードリストとの照合」を
 * 推奨している。文字種ポリシーだけでは `Password1234` のような漏洩上位の
 * 文字列を通してしまい、ブルートフォースより実効性の高いクレデンシャル
 * スタッフィングを素通りさせるため（#652）。
 *
 * ## 平文を外部に送らない（k-anonymity）
 *
 * パスワードの SHA-1 を取り、**先頭5文字だけ**を API に送る。返ってくるのは
 * その接頭辞を持つハッシュの接尾辞一覧（数百件）で、照合は手元で行う。
 * 平文もフルハッシュも外部に出ない。
 *
 * `Add-Padding: true` を付けると応答件数が一定数まで水増しされる。付けないと
 * 応答サイズから接頭辞が推測できてしまうため、経路上の観測者への情報漏れを
 * 防ぐ目的で常に付ける。水増し分は件数0で返るので、件数が1件以上のものだけを
 * ヒットとみなす。
 *
 * ## 障害時は通す（fail-open）
 *
 * API の停止・遅延で登録やパスワード変更そのものが止まるのは割に合わない。
 * タイムアウト・HTTPエラー・通信失敗はいずれも「照合できなかった」として
 * false を返し、サーバーログにだけ記録する。
 */

import { createHash } from 'crypto';

import { PWNED_PASSWORD_CONFIG } from '@/constants/auth';

/** k-anonymity 検索で送信するハッシュ接頭辞の長さ */
const HASH_PREFIX_LENGTH = 5;

/**
 * 応答本文から対象の接尾辞を探し、漏洩件数が1件以上かを判定する
 *
 * 応答は `<接尾辞>:<件数>` の行が改行区切りで並ぶ。
 *
 * @param body - API の応答本文
 * @param suffix - 探す接尾辞（大文字）
 * @returns 漏洩件数が1件以上なら true
 */
function hasBreachedSuffix(body: string, suffix: string): boolean {
  for (const line of body.split('\n')) {
    const [hashSuffix, count] = line.trim().split(':');

    if (hashSuffix?.toUpperCase() !== suffix) continue;

    // Add-Padding による水増し分は件数0で返るため、実際の漏洩と区別する
    return Number(count) > 0;
  }

  return false;
}

/**
 * パスワードが既知の漏洩リストに載っているかを照合する
 *
 * @param password - 平文パスワード（外部には送信されない）
 * @returns 漏洩が確認できた場合 true。照合できなかった場合も false（fail-open）
 */
export async function isPasswordPwned(password: string): Promise<boolean> {
  const sha1 = createHash('sha1')
    .update(password, 'utf8')
    .digest('hex')
    .toUpperCase();
  const prefix = sha1.slice(0, HASH_PREFIX_LENGTH);
  const suffix = sha1.slice(HASH_PREFIX_LENGTH);

  try {
    const response = await fetch(
      `${PWNED_PASSWORD_CONFIG.API_BASE_URL}/${prefix}`,
      {
        headers: {
          'Add-Padding': 'true',
          'User-Agent': 'MovieApp/1.0 (https://github.com/Fn-front/movie-app)',
        },
        // 漏洩リストは日々更新される。キャッシュして古い判定を使い回さない
        cache: 'no-store',
        signal: AbortSignal.timeout(PWNED_PASSWORD_CONFIG.TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      console.error(
        `Pwned password check failed: HTTP ${response.status}. Skipping check.`,
      );
      return false;
    }

    return hasBreachedSuffix(await response.text(), suffix);
  } catch (error) {
    // タイムアウト・通信失敗。パスワードは含めない
    console.error('Pwned password check failed. Skipping check.', error);
    return false;
  }
}
