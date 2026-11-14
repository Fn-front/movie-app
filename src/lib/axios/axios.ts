/**
 * Axiosインスタンス設定
 */

import axios, { type AxiosError, type AxiosResponse } from 'axios';

import { API, HTTP_STATUS } from '@/constants';
import { logout } from '@/lib/auth/logout';
import { confirmSignedOut } from '@/lib/auth/sessionProbe';

/**
 * ログアウト処理の多重実行を止めるフラグ
 *
 * 戻すのは「確認できなかった」「確認にもログアウトにも失敗した」の2つ。
 * ログアウトが**成功**したときだけ立てたままにする（完全遷移に入るため）。
 *
 * ⚠️ `logout()` が失敗する経路は実在する（csrf 取得か `/signout` の POST の
 * 失敗）。`void logout()` では rethrow を握り潰してフラグが戻らない
 */
let isSigningOut = false;

/** テスト用。モジュールスコープの状態は Jest のモジュールキャッシュを跨ぐ */
export function __resetSignOutGuardForTest(): void {
  isSigningOut = false;
}

/**
 * 基本Axiosインスタンス
 */
export const axiosInstance = axios.create({
  timeout: API.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * リクエストインターセプター
 */
axiosInstance.interceptors.request.use(
  (config) => {
    // 開発環境でリクエストログを出力
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[API Request] ${config.method?.toUpperCase()} ${config.url}`,
      );
    }

    return config;
  },
  (error: AxiosError) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[API Request Error]', error);
    }
    return Promise.reject(error);
  },
);

/**
 * レスポンスインターセプター
 */
axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    // 開発環境でレスポンスログを出力
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}`,
        response.status,
      );
    }

    return response;
  },
  (error: AxiosError) => {
    // キャンセルされたリクエストはログ不要
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    // エラーログを出力
    if (process.env.NODE_ENV === 'development') {
      console.error('[API Response Error]', {
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status,
        message: error.message,
        data: error.response?.data,
      });
    }

    // 認証エラー（401）の場合、セッションをクリアしてログインページにリダイレクト
    //
    // ⚠️ **401 だけを根拠にログアウトしない**（#1151）。
    // `unauthorizedResponse()` を返すルートの中には、DB の読み取りに失敗した
    // だけで 401 を返すものがある（`auth/otp/send` など）。確認せずに
    // `logout()` を呼ぶと、サーバーセッションの破棄と Cookie 同意レコードの
    // 削除が走る。#1136 で `sessionExpiryHandler` に入れたのと同じ確認を通す。
    //
    // 画面の初期化では複数のリクエストが同時に飛ぶため、フラグで多重実行を
    // 止める。確認できなかった場合はフラグを戻し、次の 401 で再判定する
    if (error.response?.status === HTTP_STATUS.UNAUTHORIZED) {
      if (typeof window !== 'undefined' && !isSigningOut) {
        isSigningOut = true;

        void confirmSignedOut()
          .then(async (signedOut) => {
            if (!signedOut) {
              isSigningOut = false;
              return;
            }
            // `logout()` は遷移が始まらなかったとき rethrow する。
            // await しないと下の catch に渡らない
            await logout();
          })
          .catch(() => {
            // 確認にもログアウトにも失敗した。ここで戻さないと、
            // **この SPA セッションでは二度とログアウトできない**。
            // `logout()` は失敗しても先に同意レコードを消しているので、
            // 「同意は消えた・ログイン状態は残る・経路は死んでいる」になる
            isSigningOut = false;
          });
      }
    }

    return Promise.reject(error);
  },
);
