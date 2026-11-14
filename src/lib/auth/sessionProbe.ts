/**
 * 「本当にログアウトしているか」をサーバーに確かめる
 *
 * next-auth の `useSession()` は、**通信失敗も非2xxも `null` に潰す**
 * （内部の `fetchData` が catch して `null` を返す）。その `null` がそのまま
 * セッション state に入り、`status` は「セッションが truthy なら
 * authenticated、さもなくば unauthenticated」で決まる。
 *
 * つまり `status === 'unauthenticated'` は
 * **「ログアウトした」と「応答を得られなかった」の両方**を意味する。
 * 取り消せない後始末（Cookie同意レコードの消去）をこの値だけで判断すると、
 * 回線の瞬断や 5xx で利用者の意思表示が消える（#1136）。
 *
 * 判断を誤る向きは**消さない側に倒す**。誤って消すと意思表示そのものが
 * 失われ、取り戻す手段が無い。消し損ねて残るのは「端末に前の利用者の同意が
 * 残る」という限定的な状態にとどまる。
 *
 * ⚠️ **確認に失敗しても再試行はしない。** 呼び出し側の effect は `status` の
 * 変化でしか再実行されないため、回線が復帰しても同じページロード中に
 * 後始末が走り直すことはない。解消は次のフルロードまで持ち越される。
 * 再試行を足すより「消さないまま持ち越す」ほうが安全側であり、残る状態も
 * 上のとおり限定的なため、この設計を選んでいる。
 */

'use client';

import { API_ENDPOINTS } from '@/constants';

/**
 * 確認の待ち時間（ミリ秒）
 *
 * 応答が返らない回線で Promise が解決せず、未解決の fetch が残るのを防ぐ。
 * 中断は catch に落ちて `false`（＝消さない）になるので方針とも整合する
 */
const PROBE_TIMEOUT_MS = 5000;

/** `/api/auth/session` の応答のうち、ここで見る部分だけ */
interface SessionProbeResponse {
  user?: { id?: string | null } | null;
}

/**
 * サーバーがセッションの不在を明示したかどうかを返す
 *
 * @returns `true` なら「ログアウト済み」と確認できた。
 *          `false` は「ログイン中」と「確認できなかった」の両方を含む
 */
export async function confirmSignedOut(): Promise<boolean> {
  try {
    const response = await fetch(API_ENDPOINTS.AUTH_SESSION, {
      // 確認が目的なので、キャッシュに当たっては意味がない
      cache: 'no-store',
      // Cookie を載せないと常に未認証と答えられてしまう
      credentials: 'same-origin',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!response.ok) return false;

    const data = (await response.json()) as SessionProbeResponse | null;

    // 無効化済みセッション（パスワード変更・絶対期限切れ）は user を
    // 空文字で埋めて返るため、存在確認では判定できない。id の有無で見る
    // （`getAuthSession` / `proxy.ts` と同じ基準 / #699）。
    //
    // なお現在の呼び出し元は status === 'unauthenticated' のときしか
    // ここへ来ないので、この分岐に実際に当たることはない（無効化済みでも
    // セッションオブジェクト自体は返るため status は authenticated になる）。
    // 汎用の判定として正しい基準を置いている
    return !data?.user?.id;
  } catch {
    // 通信そのものに失敗した。未認証だとは言い切れない
    return false;
  }
}
