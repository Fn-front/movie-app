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
 * ⚠️ **この数値は `next dev`（単一プロセス）での実測。** 本番（Vercel）では
 * proxy と各 Route Handler が別の関数として動くため、畳める範囲は
 * 「同じ関数インスタンスに同時に入ったぶん」だけ。別インスタンスへ
 * 振られたリクエストは畳めない。
 *
 * ## どう直すか
 *
 * 同じ利用者の問い合わせを、`SESSION_USER_LOOKUP_TTL_MS` のあいだ共有する。
 * 開始時刻を基準に数えるので、**進行中のものに相乗りできるのも開始から
 * TTL まで**（それを過ぎたら、まだ返ってきていなくても新しく引き直す）。
 * 結果の古さが必ず TTL 以内に収まるようにするため、この基準で正しい。
 *
 * ⚠️ **TTL を伸ばさないこと。** この問い合わせはパスワード変更による強制失効と
 * admin 剥奪の追従そのもので、TTL はその検知が遅れる時間に直接乗る
 * （`SESSION_CONFIG.PASSWORD_CHECK_INTERVAL_MS` の5分 ＋ TTL が最悪値）。
 * 1秒なら「同時に飛んできた束」を畳むには十分で、5分に対して無視できる。
 * 束を畳む以上の効果（リクエストをまたいだ削減）を狙って伸ばすと、
 * **剥奪された admin の画面側のゲートが素通りする時間がそのぶん延びる。**
 *
 * ⚠️ TTL を 0 にすると**何も畳まれない**（`now - startedAt < 0` が常に偽で、
 * 進行中の相乗りも消える）。「相乗りだけ残す」ことはできない。
 */

import { SUPABASE_ERROR_CODE } from '@/constants/api';
import type { Database } from '@/types/database.types';

type UsersRow = Database['public']['Tables']['users']['Row'];

/** セッション確認で読む列 */
export const SESSION_USER_COLUMNS = 'password_hash, password_changed_at, role';

/**
 * キャッシュに載せるセッション確認の結果
 *
 * ⚠️ `password_hash` を**そのまま持たない**。呼び出し側が要るのは
 * 「設定されているか」だけ（`token.hasPassword`）で、bcrypt ハッシュを
 * プロセス内に置き続ける理由が無い。問い合わせ直後に畳む。
 */
export interface SessionUserRow {
  /** パスワードが設定されているか（`password_hash` の有無） */
  hasPassword: boolean;
  passwordChangedAt: UsersRow['password_changed_at'];
  role: UsersRow['role'] | null;
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
 * 保持するエントリ数の上限
 *
 * 通常は掃除（取得を開始するたびに走る）だけで TTL 内の利用者ぶんに収まる。
 * これは「1秒のあいだに数千人ぶんの別IDが来た」ような場合に備えた
 * 歯止めで、到達したら最も古いものから捨てる。
 */
export const SESSION_USER_LOOKUP_MAX_ENTRIES = 1_000;

interface Entry {
  startedAt: number;
  promise: Promise<SessionUserLookupResult>;
}

/**
 * 挿入順で保持する（Map は挿入順を保つ）。
 * 溢れたときに先頭＝最も古いものから捨てられる
 */
const entries = new Map<string, Entry>();

/** 期限切れを掃除し、それでも溢れていれば古い順に捨てる */
function evict(now: number): void {
  for (const [userId, entry] of entries) {
    if (now - entry.startedAt >= SESSION_USER_LOOKUP_TTL_MS) {
      entries.delete(userId);
    }
  }

  // 掃除しても上限に届いている＝TTL 内の別IDだけで埋まっている。
  // 新しいものを入れる余地を作るため、挿入順で古いものから落とす
  while (entries.size >= SESSION_USER_LOOKUP_MAX_ENTRIES) {
    const oldest = entries.keys().next();

    if (oldest.done) break;

    entries.delete(oldest.value);
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

/**
 * 自分が入れたエントリのときだけ捨てる
 *
 * ⚠️ 無条件に `delete` すると、遅い問い合わせが失敗したときに、その間に
 * 始まった**別の進行中の問い合わせ**を道連れにして相乗りが効かなくなる。
 * 安全側（引き直し）には倒れるが、DBが弱っているとき＝畳む価値が最も
 * 高いときに機能が止まる
 */
function discardIfMine(
  userId: string,
  promise: Promise<SessionUserLookupResult>,
): void {
  if (entries.get(userId)?.promise === promise) {
    entries.delete(userId);
  }
}

/** `.single()` を呼べる最小限の形。テストから差し替えられるようにする */
export type SessionUserQuery = () => PromiseLike<SessionUserLookupResult>;

/**
 * セッション確認用に `users` の行を引く
 *
 * 同じ `userId` の問い合わせが開始から TTL 以内なら、進行中・完了済みを
 * 問わず相乗りする。失敗は使い回さない。
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

  // 新しく引くときだけ掃除する。TTL が1秒なので、これだけで
  // Map は「直近1秒に来た利用者＋進行中」の大きさに収まる
  evict(now);

  const promise: Promise<SessionUserLookupResult> = Promise.resolve(
    query(),
  ).then(
    (result) => {
      // 失敗は共有しない。次の確認が10秒後に引き直せるようにしておく
      if (isFailure(result)) {
        discardIfMine(userId, promise);
      }

      return result;
    },
    (cause: unknown) => {
      discardIfMine(userId, promise);
      throw cause;
    },
  );

  entries.set(userId, { startedAt: now, promise });

  return promise;
}

/** テスト用。キャッシュを空にする */
export function __resetSessionUserLookupForTest(): void {
  entries.clear();
}

/** テスト用。保持しているエントリ数（掃除が効いているかの検証に使う） */
export function __getSessionUserLookupSizeForTest(): number {
  return entries.size;
}
