/**
 * ログイン試行のレート制限識別子を組み立てる
 *
 * メールアドレス単独を識別子にすると、認証情報を一切知らない第三者が
 * 誤ったパスワードを数回送るだけで、そのアカウントをロックできてしまう
 * （攻撃側のコストはゼロ、被害側は締め出し／#644）。
 *
 * 送信元を識別子に含めることで、ロックされるのは**試行した本人**になる。
 * 正当な利用者は別の送信元から通常どおりログインできる。
 */

/** 送信元が特定できない場合に getClientIp が返す値 */
const UNKNOWN_IP = 'unknown';

/**
 * アカウント×送信元の識別子を返す
 *
 * 送信元が特定できない場合（ローカル起動やヘッダ欠落）は、全員が同じ
 * 識別子を共有して相互にロックし合うのを避けるため、メールアドレス単独に
 * フォールバックする。従来の挙動と同じになる。
 *
 * @param email - ログイン対象のメールアドレス
 * @param clientIp - getClientIp の戻り値
 * @returns rate_limits.identifier に使う文字列
 */
export function buildLoginIdentifier(email: string, clientIp: string): string {
  if (!clientIp || clientIp === UNKNOWN_IP) {
    return email;
  }

  return `${email}|${clientIp}`;
}
