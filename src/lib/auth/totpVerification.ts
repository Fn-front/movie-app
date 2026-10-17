/**
 * TOTP（二段階認証）のサーバー側検証
 *
 * `src/lib/totp/` が純粋な計算（RFC 6238 / 暗号化 / ハッシュ）を担うのに対し、
 * ここは DB と突き合わせる層を担う。具体的には:
 *
 * - 共有鍵の取り出しと復号
 * - 同じコードの使い回しの拒否（RFC 6238 Section 5.2 の要求）
 * - リカバリーコードの1回限りの消費
 *
 * 使い回し・消費の判定は**条件付きUPDATEの更新行数**で行う。先に読んでから
 * 書くと、同じコードを同時に2回投げられたときに両方とも通ってしまう。
 */

import { SupabaseClient } from '@supabase/supabase-js';

import { decryptTotpSecret } from '@/lib/totp/encryption';
import {
  findMatchingRecoveryCodeHash,
  normalizeRecoveryCode,
} from '@/lib/totp/recoveryCodes';
import { findMatchingCounter } from '@/lib/totp/totp';

/**
 * 検証結果
 *
 * 利用者に見せるメッセージは呼び出し側で決める。ここでは「なぜ通らなかったか」
 * だけを返す。
 */
export const TOTP_VERIFY_RESULT = {
  /** 検証成功 */
  SUCCESS: 'success',
  /** コードが一致しない */
  INVALID: 'invalid',
  /** 一致したが既に使われている（使い回し / 同時実行の敗者） */
  REUSED: 'reused',
  /** そもそも二段階認証が有効になっていない */
  NOT_ENABLED: 'not_enabled',
} as const;

export type TotpVerifyResult =
  (typeof TOTP_VERIFY_RESULT)[keyof typeof TOTP_VERIFY_RESULT];

/** リカバリーコードとして扱う形式（ハイフン・大文字小文字は正規化後に判定） */
const RECOVERY_CODE_PATTERN = /^[2-9A-HJKMNP-TWXYZ]{10}$/;

/**
 * 二段階認証が有効なユーザーかを返す
 *
 * `confirmed_at` が入っているものだけを「有効」とみなす。設定途中（QRを表示した
 * だけで初回コードを入れていない）状態でログインを止めてしまうと、
 * 認証アプリに登録できなかった利用者がそのままロックアウトされる。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @returns 有効なら true
 */
export async function isTotpEnabled(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('user_totp')
    .select('confirmed_at')
    .eq('user_id', userId)
    .not('confirmed_at', 'is', null)
    .maybeSingle();

  return Boolean(data);
}

/**
 * 認証アプリのコードを検証する
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @param code - 利用者が入力した6桁のコード
 * @returns 検証結果
 */
async function verifyAuthenticatorCode(
  supabase: SupabaseClient,
  userId: string,
  code: string,
): Promise<TotpVerifyResult> {
  const { data: row } = await supabase
    .from('user_totp')
    .select('encrypted_secret, last_used_counter')
    .eq('user_id', userId)
    .not('confirmed_at', 'is', null)
    .maybeSingle();

  if (!row) {
    return TOTP_VERIFY_RESULT.NOT_ENABLED;
  }

  const counter = findMatchingCounter(
    code,
    decryptTotpSecret(row.encrypted_secret),
  );

  if (counter === null) {
    return TOTP_VERIFY_RESULT.INVALID;
  }

  // 「まだ使われていないステップのときだけ記録する」を1文で行う。
  // 先に last_used_counter を読んで比較してから書くと、同じコードを同時に
  // 2回投げられたときに両方とも通る
  const { data: updated } = await supabase
    .from('user_totp')
    .update({ last_used_counter: counter })
    .eq('user_id', userId)
    .or(`last_used_counter.is.null,last_used_counter.lt.${counter}`)
    .select('user_id');

  if (!updated || updated.length === 0) {
    return TOTP_VERIFY_RESULT.REUSED;
  }

  return TOTP_VERIFY_RESULT.SUCCESS;
}

/**
 * リカバリーコードを検証し、使用済みにする
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @param code - 利用者が入力したリカバリーコード
 * @returns 検証結果
 */
async function verifyRecoveryCode(
  supabase: SupabaseClient,
  userId: string,
  code: string,
): Promise<TotpVerifyResult> {
  const { data: rows } = await supabase
    .from('totp_recovery_codes')
    .select('id, code_hash')
    .eq('user_id', userId)
    .is('used_at', null);

  if (!rows || rows.length === 0) {
    return TOTP_VERIFY_RESULT.INVALID;
  }

  const matchedHash = findMatchingRecoveryCodeHash(
    code,
    rows.map((row) => row.code_hash),
  );

  if (!matchedHash) {
    return TOTP_VERIFY_RESULT.INVALID;
  }

  const matched = rows.find((row) => row.code_hash === matchedHash);

  // 未使用のときだけ使用済みにする。同時に2回使われた場合、更新できた側だけが通る
  const { data: updated } = await supabase
    .from('totp_recovery_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', matched?.id)
    .is('used_at', null)
    .select('id');

  if (!updated || updated.length === 0) {
    return TOTP_VERIFY_RESULT.REUSED;
  }

  return TOTP_VERIFY_RESULT.SUCCESS;
}

/**
 * 第2要素を検証する
 *
 * 認証アプリのコードとリカバリーコードのどちらが来ても受け付ける。入力形式で
 * 振り分けるため、利用者はどちらを入れるか選ぶ必要がない。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @param code - 利用者が入力したコード
 * @returns 検証結果
 */
export async function verifySecondFactor(
  supabase: SupabaseClient,
  userId: string,
  code: string,
): Promise<TotpVerifyResult> {
  const normalized = normalizeRecoveryCode(code);

  if (RECOVERY_CODE_PATTERN.test(normalized)) {
    return verifyRecoveryCode(supabase, userId, code);
  }

  return verifyAuthenticatorCode(supabase, userId, code.trim());
}

/**
 * 未使用のリカバリーコードの残数を返す
 *
 * 「残りわずか」を利用者に伝えるために使う。使い切ってから認証アプリを失うと
 * 復旧手段が無くなる。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @returns 残数
 */
export async function countUnusedRecoveryCodes(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count } = await supabase
    .from('totp_recovery_codes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('used_at', null);

  return count ?? 0;
}
