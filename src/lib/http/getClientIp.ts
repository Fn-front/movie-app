/**
 * リクエストからクライアント IP を取得する（取得不可時は 'unknown'）
 *
 * `x-forwarded-for` ヘッダの先頭値を採用する。Vercel / 一般的なリバースプロキシ
 * 経由でリクエストが来た際に、上流の IP をレート制限識別子として使う想定。
 * ヘッダが無いローカル起動等では 'unknown' を返し、レート制限側で fallback する。
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}
