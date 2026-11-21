/**
 * パスワードを持っているかを、サーバーと同じ根拠で判定する（#1388）
 *
 * 画面はセッション（JWT）の `hasPassword` を見るが、JWT の追従は
 * `SESSION_CONFIG.PASSWORD_CHECK_INTERVAL_MS`（5分）のスロットル付き
 * （`src/lib/auth/auth.ts`）。サーバーは毎回 `users.password_hash` の実値を
 * 見るので、**初回パスワードを設定した直後は画面が出す欄とサーバーが
 * 求める材料が食い違う**。
 *
 * 退会・パスワード変更・メールアドレス変更のどれも行き止まりになる。
 * いちばん重いのは退会で、画面は「確認コードを送る」しか出さないのに
 * サーバーは現在のパスワードを要求し、**その欄が無いので従えない**。
 *
 * ⛔ **セッション由来の値を捨てない。** API を唯一の根拠にすると、取得に
 * 失敗した利用者からどちらの欄も消える（#1378 のレビューで確認した判断）。
 * 取れた回だけ上書きし、取れなければ今までどおりセッションに倒す。
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { API_ENDPOINTS, PASSWORD_CHANGE_EVENT } from '@/constants';

/**
 * パスワードの有無
 *
 * @param sessionHasPassword - セッション由来の値（取得できないときの拠り所）
 * @returns API で取れていればその値、取れていなければ `sessionHasPassword`
 */
export function useHasPassword(sessionHasPassword: boolean): boolean {
  /**
   * API から取れた値
   *
   * ⛔ **`null`（まだ分からない）で始める。** `sessionHasPassword` で
   * 初期化すると、セッションが後から確定しても古い値を抱えたままになる。
   * `null` のあいだは毎レンダー最新の引数へ倒れる。
   */
  const [fetched, setFetched] = useState<boolean | null>(null);

  /**
   * 何番目の取得か
   *
   * ⚠️ **古い応答で新しい応答を上書きしない。** マウント時の取得が遅れて
   * `PASSWORD_CHANGE_EVENT` 由来の取得より後に解決すると、設定前の `false` が
   * 設定後の `true` を潰し、**直したはずの行き止まりが静かに戻る**。
   */
  const latestRequestRef = useRef(0);

  /**
   * ⚠️ 失敗しても `error` を立てない。利用者が触っているのは別の節なので、
   * 関係のないエラーを出す筋合いがない。取れなければ今の値のまま＝
   * これまでと同じ振る舞いに留まる。
   */
  const load = useCallback(async () => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;

    try {
      const response = await fetch(API_ENDPOINTS.USER_TOTP);
      if (!response.ok) return;

      const json = await response.json();

      // 追い越されていたら捨てる
      if (requestId !== latestRequestRef.current) return;

      // 真偽値でなければ `null` のまま残す。呼び出し側がセッション由来の
      // 値へ倒せるようにするため、ここで握り潰さない
      if (typeof json.data?.hasPassword === 'boolean') {
        setFetched(json.data.hasPassword);
      }
    } catch {
      // 取れなければセッション由来の値を使う
    }
  }, []);

  /*
    ⚠️ **マウント時に取る。** 同じ画面で設定した場合は下のイベントで足りるが、
    それだけだと「別の画面でパスワードを設定 → 設定ページへ来る」や
    「設定したあと離れて5分以内に戻る」で古いままになる。

    サーバー（`users.password_hash`）はレンダーの外にある状態で、マウント後に
    取りにいって差し替えるしかない。描画に使うまでの一瞬はセッション由来の値で
    持たせるので、追加のレンダーは欄の有無を一度だけ変えうる
  */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * 同じ画面でパスワードを設定・変更したら取り直す
   *
   * 合図を出しているのは `ChangePasswordForm`（#1372 / #1378）。
   * これが無いと、初回パスワードを設定した利用者は再読み込みするまで
   * 行き止まりのままになる。
   *
   * ⚠️ **タブは跨がない。** 別タブで設定した場合はこの合図が届かないので、
   * 開きっぱなしの画面は最大5分古いまま（再訪・リロードで直る）。
   * セッション自体も同じだけ古いので、ここだけ塞いでも揃わない。
   */
  useEffect(() => {
    window.addEventListener(PASSWORD_CHANGE_EVENT, load);

    return () => {
      window.removeEventListener(PASSWORD_CHANGE_EVENT, load);
    };
  }, [load]);

  return fetched ?? sessionHasPassword;
}
