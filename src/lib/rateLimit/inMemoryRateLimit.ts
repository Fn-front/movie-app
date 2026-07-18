/**
 * インメモリ・レート制限（軽量スロットリング）
 *
 * DB を介さないプロセス内カウンタによる固定ウィンドウ方式のレート制限。
 * 高頻度・低コストで判定したいエンドポイント（例: CSP 違反レポート受信）向け。
 * CSP レポートのようにレポート毎に DB 書き込みを行うと逆効果になるケースで使う。
 *
 * ⚠️ サーバーレス環境ではインスタンス単位の状態であり、複数インスタンス間で
 * 共有されず、コールドスタートでリセットされる。厳密な制限ではなく best-effort の
 * 濫用抑止・ログ肥大防止を目的とする。
 */

/** インメモリ・レート制限インスタンス */
export interface InMemoryRateLimiter {
  /**
   * 指定キー（IP 等）のリクエストを 1 件計上し、上限内なら true を返す。
   * 上限超過なら false（呼び出し側で破棄する）。
   */
  check(key: string): boolean;
}

/** {@link createInMemoryRateLimiter} のオプション */
export interface InMemoryRateLimiterOptions {
  /** ウィンドウあたりの最大リクエスト数 */
  maxRequests: number;
  /** ウィンドウ幅（ミリ秒） */
  windowMs: number;
  /**
   * 保持するキー数の上限。新規キー追加時にこの数へ達していたら、期限切れ
   * エントリを掃除する（ユニーク IP 増加によるメモリ肥大を防ぐ）。
   */
  maxKeys?: number;
}

interface WindowState {
  count: number;
  windowStart: number;
}

const DEFAULT_MAX_KEYS = 10_000;

/**
 * 固定ウィンドウ方式のインメモリ・レート制限を生成する。
 * 独立した状態（Map）を持つため、テストでは都度新しいインスタンスを生成できる。
 */
export function createInMemoryRateLimiter(
  options: InMemoryRateLimiterOptions,
): InMemoryRateLimiter {
  const { maxRequests, windowMs, maxKeys = DEFAULT_MAX_KEYS } = options;
  const store = new Map<string, WindowState>();

  function check(key: string): boolean {
    const now = Date.now();
    const entry = store.get(key);

    // 未登録、またはウィンドウを跨いだら新しいウィンドウを開始
    if (!entry || now - entry.windowStart >= windowMs) {
      // 新規キーで上限数に達している場合は期限切れエントリを掃除
      if (!entry && store.size >= maxKeys) {
        for (const [k, v] of store) {
          if (now - v.windowStart >= windowMs) {
            store.delete(k);
          }
        }
      }
      store.set(key, { count: 1, windowStart: now });
      return true;
    }

    // ウィンドウ内で上限到達なら拒否
    if (entry.count >= maxRequests) {
      return false;
    }

    entry.count += 1;
    return true;
  }

  return { check };
}
