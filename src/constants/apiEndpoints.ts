/**
 * 内部APIエンドポイント定数
 */

export const API_ENDPOINTS = {
  /** OTP検証 */
  OTP_VERIFY: '/api/auth/otp/verify',
  /** OTP送信 */
  OTP_SEND: '/api/auth/otp/send',
} as const;
