/**
 * エラーハンドリングユーティリティ
 */

import { AxiosError } from 'axios';

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
    message: '予期しないエラーが発生しました',
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
        return '入力内容に誤りがあります';
      case 401:
        return '認証に失敗しました。再度ログインしてください';
      case 403:
        return 'アクセス権限がありません';
      case 404:
        return '要求されたリソースが見つかりませんでした';
      case 408:
        return 'リクエストがタイムアウトしました';
      case 429:
        return 'リクエストが多すぎます。しばらく待ってから再度お試しください';
      case 500:
        return 'サーバーエラーが発生しました';
      case 502:
        return 'サーバーとの通信に失敗しました';
      case 503:
        return 'サービスが一時的に利用できません';
      default:
        if (statusCode && statusCode >= 500) {
          return 'サーバーエラーが発生しました';
        }
        if (statusCode && statusCode >= 400) {
          return 'リクエストエラーが発生しました';
        }
    }

    // ネットワークエラー
    if (error.code === 'ERR_NETWORK') {
      return 'ネットワークエラーが発生しました。接続を確認してください';
    }

    // タイムアウト
    if (error.code === 'ECONNABORTED') {
      return 'リクエストがタイムアウトしました';
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
      return 'サーバーエラーが発生しました';
    }
    if (error.status >= 400) {
      return 'リクエストエラーが発生しました';
    }
    return `エラーが発生しました: ${error.statusText}`;
  }

  // 一般的なErrorオブジェクト
  if (error instanceof Error) {
    return error.message;
  }

  // その他
  return '予期しないエラーが発生しました';
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
    return error.response?.status === 401;
  }
  if (error instanceof Response) {
    return error.status === 401;
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
