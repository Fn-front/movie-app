/**
 * エラーハンドリングユーティリティ
 */

import { AxiosError } from 'axios';

import { HTTP_STATUS } from '@/constants';

/**
 * HTTPステータスコード別エラーメッセージ
 */
export const HTTP_ERROR_MESSAGES = {
  BAD_REQUEST: '入力内容に誤りがあります',
  UNAUTHORIZED: '認証に失敗しました。再度ログインしてください',
  FORBIDDEN: 'アクセス権限がありません',
  NOT_FOUND: '要求されたリソースが見つかりませんでした',
  TIMEOUT: 'リクエストがタイムアウトしました',
  TOO_MANY_REQUESTS:
    'リクエストが多すぎます。しばらく待ってから再度お試しください',
  SERVER_ERROR: 'サーバーエラーが発生しました',
  BAD_GATEWAY: 'サーバーとの通信に失敗しました',
  SERVICE_UNAVAILABLE: 'サービスが一時的に利用できません',
  NETWORK_ERROR: 'ネットワークエラーが発生しました。接続を確認してください',
  REQUEST_ERROR: 'リクエストエラーが発生しました',
  UNKNOWN_ERROR: '予期しないエラーが発生しました',
} as const;

/**
 * エラーレスポンス型
 */
export interface ErrorResponse {
  message: string;
  statusCode?: number;
  details?: unknown;
}

/**
 * APIエラーをハンドリングし、統一されたエラーレスポンスを返す
 *
 * @param error - エラーオブジェクト
 * @returns 統一されたエラーレスポンス
 *
 * @example
 * ```ts
 * try {
 *   await api.getData();
 * } catch (error) {
 *   const errorResponse = handleApiError(error);
 *   console.error(errorResponse.message);
 * }
 * ```
 */
export function handleApiError(error: unknown): ErrorResponse {
  // 開発環境ではコンソールにエラーを出力
  if (process.env.NODE_ENV === 'development') {
    console.error('API Error:', error);
  }

  // Axiosエラー
  if (error instanceof AxiosError) {
    const statusCode = error.response?.status;

    return {
      message: formatErrorMessage(error),
      statusCode,
      details: error.response?.data,
    };
  }

  // Fetchエラー
  if (error instanceof Response) {
    return {
      message: `HTTPエラー: ${error.status} ${error.statusText}`,
      statusCode: error.status,
    };
  }

  // 一般的なErrorオブジェクト
  if (error instanceof Error) {
    return {
      message: error.message,
    };
  }

  // その他のエラー
  return {
    message: HTTP_ERROR_MESSAGES.UNKNOWN_ERROR,
  };
}

/**
 * エラーオブジェクトをユーザーフレンドリーなメッセージに変換
 *
 * @param error - エラーオブジェクト
 * @returns ユーザー向けエラーメッセージ
 *
 * @example
 * ```ts
 * const message = formatErrorMessage(axiosError);
 * // => 'ネットワークエラーが発生しました'
 * ```
 */
export function formatErrorMessage(error: unknown): string {
  // Axiosエラー
  if (error instanceof AxiosError) {
    const statusCode = error.response?.status;

    // HTTPステータスコード別メッセージ
    switch (statusCode) {
      case 400:
        return HTTP_ERROR_MESSAGES.BAD_REQUEST;
      case 401:
        return HTTP_ERROR_MESSAGES.UNAUTHORIZED;
      case 403:
        return HTTP_ERROR_MESSAGES.FORBIDDEN;
      case 404:
        return HTTP_ERROR_MESSAGES.NOT_FOUND;
      case 408:
        return HTTP_ERROR_MESSAGES.TIMEOUT;
      case 429:
        return HTTP_ERROR_MESSAGES.TOO_MANY_REQUESTS;
      case 500:
        return HTTP_ERROR_MESSAGES.SERVER_ERROR;
      case 502:
        return HTTP_ERROR_MESSAGES.BAD_GATEWAY;
      case 503:
        return HTTP_ERROR_MESSAGES.SERVICE_UNAVAILABLE;
      default:
        if (statusCode && statusCode >= 500) {
          return HTTP_ERROR_MESSAGES.SERVER_ERROR;
        }
        if (statusCode && statusCode >= 400) {
          return HTTP_ERROR_MESSAGES.REQUEST_ERROR;
        }
    }

    // ネットワークエラー
    if (error.code === 'ERR_NETWORK') {
      return HTTP_ERROR_MESSAGES.NETWORK_ERROR;
    }

    // タイムアウト
    if (error.code === 'ECONNABORTED') {
      return HTTP_ERROR_MESSAGES.TIMEOUT;
    }

    // カスタムメッセージがあればそれを使用
    if (error.response?.data?.message) {
      return error.response.data.message;
    }

    return error.message;
  }

  // Fetchエラー
  if (error instanceof Response) {
    if (error.status >= 500) {
      return HTTP_ERROR_MESSAGES.SERVER_ERROR;
    }
    if (error.status >= 400) {
      return HTTP_ERROR_MESSAGES.REQUEST_ERROR;
    }
    return `エラーが発生しました: ${error.statusText}`;
  }

  // 一般的なErrorオブジェクト
  if (error instanceof Error) {
    return error.message;
  }

  // その他
  return HTTP_ERROR_MESSAGES.UNKNOWN_ERROR;
}

/**
 * エラーがネットワークエラーかどうかを判定
 *
 * @param error - エラーオブジェクト
 * @returns ネットワークエラーの場合true
 *
 * @example
 * ```ts
 * if (isNetworkError(error)) {
 *   showToast('ネットワークに接続できません');
 * }
 * ```
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    return error.code === 'ERR_NETWORK';
  }
  return false;
}

/**
 * エラーが認証エラーかどうかを判定
 *
 * @param error - エラーオブジェクト
 * @returns 認証エラーの場合true
 *
 * @example
 * ```ts
 * if (isAuthError(error)) {
 *   router.push('/login');
 * }
 * ```
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    return error.response?.status === HTTP_STATUS.UNAUTHORIZED;
  }
  if (error instanceof Response) {
    return error.status === HTTP_STATUS.UNAUTHORIZED;
  }
  return false;
}

/**
 * エラーメッセージを開発者向けに詳細に出力
 *
 * @param error - エラーオブジェクト
 * @param context - エラーのコンテキスト情報
 *
 * @example
 * ```ts
 * logError(error, { component: 'MovieList', action: 'fetchMovies' });
 * ```
 */
export function logError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === 'development') {
    console.group('🚨 Error Details');
    console.error('Error:', error);
    if (context) {
      console.log('Context:', context);
    }
    if (error instanceof AxiosError) {
      console.log('Response:', error.response?.data);
      console.log('Status:', error.response?.status);
      console.log('Headers:', error.response?.headers);
    }
    console.groupEnd();
  }
}
