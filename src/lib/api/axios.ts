/**
 * Axiosインスタンス設定
 */

import axios, { type AxiosError, type AxiosResponse } from 'axios';

import { API } from '@/lib/constants';

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

    // 認証エラー（401）の場合、ログインページにリダイレクト
    if (error.response?.status === 401) {
      // クライアントサイドのみ実行
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  },
);
