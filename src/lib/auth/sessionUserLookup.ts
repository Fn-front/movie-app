/**
 * セッション確認で引く `users` の行を、ごく短時間だけ共有する（#1281）
 *
 * ## なぜ要るか
 *
 * `/api/*` 1リクエストにつき、NextAuth のセッション読み取りは**2回**走る。
 * proxy（`auth((req) => ...)` のラッパー形式は、ハンドラを呼ぶ**前に**
 * `getSession()` を実行する）と、Route Handler の `getAuthSession()` の2回。
 * 2回目はブラウザが送った**同じ（古い）Cookie** を読むため、
 * `lastPasswordCheck` の5分窓が切れていると `users` の SELECT が2回走る。
 *
 * さらに悪いのは**画面読み込み時の同時並行**。5分アイドル後にクライアントが
 * APIを並べて叩くと、全部が同じ古い Cookie を持つので窓が切れたまま重なる。
 * 実測（`next dev` / 2026-11-19）:
 *
 * | | jwt コールバック | `users` SELECT |
 * |---|---|---|
 * | API 1本 | 2 | 2 |
 * | API 5本・同時 | 8 | **8** |
 * | API 5本・逐次（Cookieを持ち回る） | 10 | 2 |
 *
 * 逐次が2回で済むのは、1本目で proxy が Cookie を更新し、以降は窓の内側に
 * 入るため。**同時だと更新が間に合わず、ほぼ全部が DB を引く。**
 *
 * ## どう直すか
 *
 * 同じ利用者の問い合わせを、進行中なら相乗りさせ、終わった直後なら
 * `SESSION_USER_LOOKUP_TTL_MS` のあいだ使い回す。
 *
 * ⚠️ **TTL を伸ばさないこと。** この問い合わせはパスワード変更による強制失効と
 * admin 剥奪の追従そのもので、TTL はその検知が遅れる時間に直接乗る
 * （`SESSION_CONFIG.PASSWORD_CHECK_INTERVAL_MS` の5分 ＋ TTL が最悪値）。
 * 1秒なら「同時に飛んできた束」を畳むには十分で、5分に対して無視できる。
 * 束を畳む以上の効果（リクエストをまたいだ削減）を狙って伸ばすと、
 * **剥奪した admin が管理機能を使える時間がそのぶん延びる。**
 *
 * ⚠️ proxy と Route Handler は**別のバンドル**なので、このキャッシュは
 * 2回のうち片方ずつにしか効かない（モジュールの実体が別）。2回を1回に
 * するものではなく、**同時に重なった束を1回にする**もの。
 */

import { SUPABASE_ERROR_CODE } from '@/constants/api';

/** セッション確認で読む列 */
export const SESSION_USER_COLUMNS = 'password_hash, password_changed_at, role';

/** セッション確認で読む行の形 */
export interface SessionUserRow {
  password_hash: string | null;
  password_changed_at: string | null;
  role: string | null;
}

/** `.single()` の戻り値のうち、呼び出し側が見るぶんだけ */
export interface SessionUserLookupResult {
  data: SessionUserRow | null;
  error: { code?: string } | null;
}

/**
 * 問い合わせ結果を使い回す時間（ミリ秒）
 *
 * 同時に飛んできた束を畳むだけの長さに留める。理由はファイル冒頭の⚠️。
 */
export const SESSION_USER_LOOKUP_TTL_MS = 1_000;

/**
 * 保持するエントリの上限
 *
 * TTL が1秒なので通常は同時アクセス中の利用者ぶんしか入らない。
 * 溢れたときに古いものを捨てるだけの歯止めで、容量設計ではない。
 */
const MAX_ENTRIES = 1_000;

interface Entry {
  startedAt: number;
  promise: Promise<SessionUserLookupResult>;
}

const entries = new Map<string, Entry>();

/** 期限切れを掃除する。Map が膨らんだときだけ走らせる */
function sweep(now: number): void {
  for (const [userId, entry] of entries) {
    if (now - entry.startedAt >= SESSION_USER_LOOKUP_TTL_MS) {
      entries.delete(userId);
    }
  }
}

/**
 * 取得に失敗した結果かどうか
 *
 * `PGRST116`（0件）は「確定した答え」なので失敗ではない。それ以外のエラーは
 * 伝送路やDBの不調なので、使い回すと `jwt` コールバックの再試行
 * （`PASSWORD_CHECK_RETRY_MS` = 10秒）を黙って潰すことになる。
 */
function isFailure(result: SessionUserLookupResult): boolean {
  return Boolean(
    result.error && result.error.code !== SUPABASE_ERROR_CODE.NOT_FOUND,
  );
}

/** `.single()` を呼べる最小限の形。テストから差し替えられるようにする */
export type SessionUserQuery = () => PromiseLike<SessionUserLookupResult>;

/**
 * セッション確認用に `users` の行を引く
 *
 * 同じ `userId` の問い合わせが進行中なら相乗りし、直前に終わっていれば
 * TTL のあいだ使い回す。失敗は使い回さない。
 *
 * @param userId - 対象の利用者ID
 * @param query - 実際の問い合わせ（呼び出し側が supabase クライアントを閉じ込める）
 * @param now - 現在時刻（テストから固定できるようにする）
 */
export function lookupSessionUser(
  userId: string,
  query: SessionUserQuery,
  now: number = Date.now(),
): Promise<SessionUserLookupResult> {
  const cached = entries.get(userId);

  if (cached && now - cached.startedAt < SESSION_USER_LOOKUP_TTL_MS) {
    return cached.promise;
  }

  if (entries.size >= MAX_ENTRIES) {
    sweep(now);
  }

  const promise = Promise.resolve(query()).then(
    (result) => {
      // 失敗は共有しない。次の確認が10秒後に引き直せるようにしておく
      if (isFailure(result)) {
        entries.delete(userId);
      }

      return result;
    },
    (cause: unknown) => {
      entries.delete(userId);
      throw cause;
    },
  );

  entries.set(userId, { startedAt: now, promise });

  return promise;
}

/** テスト用。キャッシュを空にする */
export function __resetSessionUserLookup(): void {
  entries.clear();
}
