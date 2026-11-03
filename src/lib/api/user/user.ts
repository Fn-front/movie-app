/**
 * ユーザー設定API クライアント
 */

import { API_ENDPOINTS } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';
import type { UpdateSettingsInput, UserSettings } from '@/schema/user';

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
 * 同意状態と日時はペアでしか渡せない（型で強制している）。片方だけ送れると
 * 状態を変えずに同意日時だけ書き換えられるため、サーバー側も 400 で弾く。
 * 版（cookieConsentVersion）はサーバーが書くので送らない。
 *
 * @param settings - 更新する設定値
 */
export async function updateSettings(
  settings: UpdateSettingsInput,
): Promise<void> {
  await axiosInstance.put(API_ENDPOINTS.USER_SETTINGS, {
    theme: settings.theme,
    notificationEnabled: settings.notificationEnabled,
    streamingNoticeScope: settings.streamingNoticeScope,
    cookieConsent: settings.cookieConsent,
    cookieConsentAt: settings.cookieConsentAt,
  });
}
