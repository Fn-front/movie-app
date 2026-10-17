/**
 * リクエストからクライアント IP を取得する（取得不可時は 'unknown'）
 *
 * レート制限の識別子に使うため、**クライアントが詐称できない値**であることが要件。
 *
 * - `x-forwarded-for` の先頭はクライアントが自由に設定できる。これを採用すると
 *   リクエストごとに別IPを名乗るだけでIP単位の制限を迂回できる（#647）
 * - Vercel のエッジは `x-vercel-forwarded-for` を自前で設定・上書きするため、
 *   クライアントからは改変できない。これを最優先で採用する
 *   （`@vercel/functions` の `ipAddress()` が参照するのと同じヘッダ。依存を
 *   増やさないため直接読む）
 * - 自前プロキシ構成などで上記が無い場合は `x-forwarded-for` を**末尾から**
 *   信頼プロキシ段数ぶん遡る。XFF は「クライアント, プロキシ1, ...」の順に
 *   追記されるため、末尾ほど自サーバーに近く信頼できる
 *
 * Next.js 15 で `NextRequest.ip` は削除され、IPの供給はホスティング事業者の
 * 責務になった（node_modules/next/dist/docs/01-app/02-guides/upgrading/version-15.md:614）。
 */

/**
 * 信頼するリバースプロキシの段数。
 *
 * Vercel 単体なら 1（エッジのみ）。CDN を前段に挟む等、構成が変わったら
 * ここだけを直す。大きすぎるとクライアントの詐称値を拾い、小さすぎると
 * プロキシのIPを拾う。
 */
const TRUSTED_PROXY_HOPS = 1;

/** IPアドレスとして妥当な形式か（IPv4 / IPv6 の簡易判定） */
function isIpLike(value: string): boolean {
  if (!value) return false;

  // IPv4（IPv4射影IPv6 `::ffff:1.2.3.4` も含めるため末尾一致で見る）
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return value.split('.').every((part) => Number(part) <= 255);
  }

  // IPv6（16進とコロン。ゾーンIDやIPv4射影表記も許容する緩い判定）
  return /^[0-9a-fA-F:]+(\.\d{1,3}){0,3}(%[0-9a-zA-Z]+)?$/.test(value);
}

/** ヘッダ値をカンマ区切りで分解し、IP形式のものだけを返す */
function parseIpList(headerValue: string | null): string[] {
  if (!headerValue) return [];

  return headerValue
    .split(',')
    .map((part) => part.trim())
    .filter(isIpLike);
}

/**
 * クライアント IP を取得する
 *
 * @param request - 受信したリクエスト
 * @returns クライアント IP。判定できない場合は 'unknown'
 */
export function getClientIp(request: Request): string {
  // 1. Vercel が付与する信頼できるヘッダ（クライアントからは改変不可）
  const vercelIps = parseIpList(request.headers.get('x-vercel-forwarded-for'));
  if (vercelIps.length > 0) {
    return vercelIps[0];
  }

  // 2. フォールバック: x-forwarded-for を末尾から信頼段数ぶん遡る
  const forwardedIps = parseIpList(request.headers.get('x-forwarded-for'));
  if (forwardedIps.length > 0) {
    const index = Math.max(0, forwardedIps.length - TRUSTED_PROXY_HOPS);
    return forwardedIps[index];
  }

  return 'unknown';
}
