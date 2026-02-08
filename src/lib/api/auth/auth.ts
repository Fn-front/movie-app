/**
 * 認証API クライアント
 */

import { axiosInstance } from '@/lib/axios/axios';

/**
 * 新規登録リクエストの型
 */
export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

/**
 * 新規登録レスポンスの型
 */
export interface RegisterResponse {
  success: true;
  data: { userId: string };
  message: string;
}

/**
 * 新規ユーザー登録
 *
 * @param data - 登録データ
 * @returns 登録レスポンス
 */
export async function registerUser(
  data: RegisterRequest,
): Promise<RegisterResponse> {
  const response = await axiosInstance.post<RegisterResponse>(
    '/api/auth/register',
    data,
  );
  return response.data;
}

/**
 * パスワード変更リクエストの型
 */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/**
 * パスワード変更レスポンスの型
 */
export interface ChangePasswordResponse {
  success: true;
  message: string;
}

/**
 * パスワード変更
 *
 * @param data - パスワード変更データ
 * @returns パスワード変更レスポンス
 */
export async function changePassword(
  data: ChangePasswordRequest,
): Promise<ChangePasswordResponse> {
  const response = await axiosInstance.post<ChangePasswordResponse>(
    '/api/user/change-password',
    data,
  );
  return response.data;
}
