/**
 * TOTP 関連の鍵の導出
 *
 * 共有鍵の暗号化とリカバリーコードのハッシュ化では別の鍵を使う必要がある
 * （同じ鍵を複数の用途に流用すると、片方の解析結果がもう片方に波及しうる）。
 * かといって環境変数を用途ごとに増やすと設定漏れの機会が増えるため、
 * マスター鍵1本から HKDF で用途別の鍵を導出する。
 */

import { hkdfSync } from 'crypto';

import { getRequiredEnv } from '@/utils/env';

/** 導出される鍵の長さ */
const DERIVED_KEY_BYTES = 32;

/** マスター鍵に要求する長さ */
const MASTER_KEY_BYTES = 32;

/**
 * 鍵の用途。
 *
 * この文字列が HKDF の `info` になるため、値を変えると既存データを
 * 復号・照合できなくなる。変更時は移行手順とセットで行うこと。
 */
export const KEY_PURPOSE = {
  /** TOTP 共有鍵の暗号化（AES-256-GCM） */
  SECRET_ENCRYPTION: 'movie-app:totp-secret-encryption:v1',
  /** リカバリーコードのハッシュ化（HMAC-SHA256） */
  RECOVERY_CODE_HMAC: 'movie-app:totp-recovery-code-hmac:v1',
} as const;

export type KeyPurpose = (typeof KEY_PURPOSE)[keyof typeof KEY_PURPOSE];

/**
 * 用途別の鍵を導出する
 *
 * 起動時ではなく使用時に環境変数を読むのは、ビルド時に未設定でも失敗させないため。
 *
 * @param purpose - 鍵の用途
 * @returns 32バイトの鍵
 * @throws マスター鍵が未設定、または長さが不正な場合
 */
export function deriveTotpKey(purpose: KeyPurpose): Buffer {
  const masterKey = Buffer.from(
    getRequiredEnv('TOTP_ENCRYPTION_KEY'),
    'base64',
  );

  if (masterKey.length !== MASTER_KEY_BYTES) {
    throw new Error(
      `TOTP_ENCRYPTION_KEY must be ${MASTER_KEY_BYTES} bytes when base64-decoded`,
    );
  }

  // マスター鍵は乱数なので salt は不要（HKDF の salt は入力鍵材料の
  // 偏りをならすためのもの）
  return Buffer.from(
    hkdfSync('sha256', masterKey, Buffer.alloc(0), purpose, DERIVED_KEY_BYTES),
  );
}
