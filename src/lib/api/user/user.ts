/**
 * ユーザー設定API クライアント
 */

import { API_ENDPOINTS } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';
import type { UserSettings } from '@/schema/user';

/**
 * 設定取得レスポンスの型
 */
export interface GetSettingsResponse {
  success: true;
  data: UserSettings;
}

/**
 * 表示名を更新
 *
 * @param name - 新しい表示名
 */
export async function updateProfile(name: string): Promise<void> {
  await axiosInstance.put(API_ENDPOINTS.USER_PROFILE, { name });
}

/**
 * ユーザー設定を取得
 *
 * @returns ユーザー設定
 */
export async function getSettings(): Promise<UserSettings> {
  const response = await axiosInstance.get<GetSettingsResponse>(
    API_ENDPOINTS.USER_SETTINGS,
  );
  return response.data.data;
}

/**
 * ユーザー設定を更新
 *
 * @param settings - 更新する設定値
 */
export async function updateSettings(
  settings: Partial<UserSettings>,
): Promise<void> {
  await axiosInstance.put(API_ENDPOINTS.USER_SETTINGS, {
    theme: settings.theme,
    notificationEnabled: settings.notificationEnabled,
  });
}
