/**
 * OTPコード生成ユーティリティ
 */

import { randomInt } from 'crypto';

import { OTP_CONFIG } from '@/constants/otp';

/**
 * 暗号的に安全な6桁OTPコードを生成
 *
 * @returns 6桁の数字文字列（例: "012345", "983721"）
 */
export function generateOtpCode(): string {
  const max = Math.pow(10, OTP_CONFIG.CODE_LENGTH);
  const code = randomInt(0, max);
  return code.toString().padStart(OTP_CONFIG.CODE_LENGTH, '0');
}
