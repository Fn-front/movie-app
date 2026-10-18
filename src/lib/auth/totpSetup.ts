/**
 * 二段階認証の設定操作（有効化・無効化・リカバリーコード再発行）
 *
 * 検証（`totpVerification.ts`）と分けてあるのは、こちらが「状態を変える」側で、
 * 守るべき不変条件が違うため。
 *
 * - 有効化は「初回コードを入力できた」ことを確認してから。QRを表示しただけで
 *   有効にすると、認証アプリへの登録に失敗した利用者がロックアウトされる
 * - 無効化とリカバリーコード再発行は、所持の証明（コード）を要求する。
 *   セッションを奪われただけで第2要素を外せたら、二段階認証の意味がない
 */

import { SupabaseClient } from '@supabase/supabase-js';

import { decryptTotpSecret, encryptTotpSecret } from '@/lib/totp/encryption';
import { generateRecoveryCodes } from '@/lib/totp/recoveryCodes';
import { buildOtpAuthUri, generateTotpSecret } from '@/lib/totp/secret';
import { verifyTotpCode } from '@/lib/totp/totp';

/** 設定開始の結果 */
export interface TotpSetupStart {
  /** 認証アプリに読み込ませる URI（QRコードの中身） */
  otpauthUri: string;
  /** 手入力用の共有鍵（QRを読めない端末向け） */
  secret: string;
}

/**
 * 設定を開始する（まだ有効化はしない）
 *
 * 既に設定途中の行があれば作り直す。前回のQRを読み込んだまま放置された
 * 鍵を生かしておく理由がない。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @param accountName - 認証アプリ上の表示名（メールアドレス）
 * @returns QRコードの中身と手入力用の鍵
 * @throws 既に有効化済みの場合
 */
export async function startTotpSetup(
  supabase: SupabaseClient,
  userId: string,
  accountName: string,
): Promise<TotpSetupStart> {
  const { data: existing } = await supabase
    .from('user_totp')
    .select('confirmed_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing?.confirmed_at) {
    throw new Error('TOTP is already enabled');
  }

  const secret = generateTotpSecret();

  // 設定途中の行は作り直す（upsert だと古い last_used_counter が残る）
  await supabase.from('user_totp').delete().eq('user_id', userId);

  const { error } = await supabase.from('user_totp').insert({
    user_id: userId,
    encrypted_secret: encryptTotpSecret(secret),
  });

  if (error) {
    throw error;
  }

  return { otpauthUri: buildOtpAuthUri(secret, accountName), secret };
}

/**
 * 初回コードを検証して有効化する
 *
 * 成功した場合だけリカバリーコードを発行する。発行してから有効化に失敗すると、
 * 「使えるリカバリーコードがあるのに二段階認証は無効」という中途半端な状態になる。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @param code - 認証アプリに表示されている6桁のコード
 * @returns 平文のリカバリーコード（この一度だけ利用者へ見せる）。コードが合わなければ null
 */
export async function confirmTotpSetup(
  supabase: SupabaseClient,
  userId: string,
  code: string,
): Promise<string[] | null> {
  const { data: row } = await supabase
    .from('user_totp')
    .select('encrypted_secret, confirmed_at')
    .eq('user_id', userId)
    .maybeSingle();

  // 設定を開始していない、または既に有効
  if (!row || row.confirmed_at) {
    return null;
  }

  if (!verifyTotpCode(code.trim(), decryptTotpSecret(row.encrypted_secret))) {
    return null;
  }

  const { codes, hashes } = generateRecoveryCodes();

  // 設定途中の行だけを有効化する。並行して無効化された場合は何も起きない
  const { data: updated } = await supabase
    .from('user_totp')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('confirmed_at', null)
    .select('user_id');

  if (!updated || updated.length === 0) {
    return null;
  }

  await replaceRecoveryCodes(supabase, userId, hashes);

  return codes;
}

/**
 * 二段階認証を無効化する
 *
 * リカバリーコードも一緒に消す。残しておくと、再度有効化したときに
 * 古いコードが生きているように見える。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 */
export async function disableTotp(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  await supabase.from('totp_recovery_codes').delete().eq('user_id', userId);

  const { error } = await supabase
    .from('user_totp')
    .delete()
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}

/**
 * リカバリーコードを再発行する
 *
 * 使用済み・未使用を問わず全て差し替える。「どれが生きているか」を
 * 利用者に覚えさせないため。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @returns 平文のリカバリーコード（この一度だけ利用者へ見せる）
 */
export async function regenerateRecoveryCodes(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { codes, hashes } = generateRecoveryCodes();

  await replaceRecoveryCodes(supabase, userId, hashes);

  return codes;
}

/**
 * リカバリーコードを全て差し替える
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @param hashes - 保存するハッシュ
 */
async function replaceRecoveryCodes(
  supabase: SupabaseClient,
  userId: string,
  hashes: string[],
): Promise<void> {
  await supabase.from('totp_recovery_codes').delete().eq('user_id', userId);

  const { error } = await supabase
    .from('totp_recovery_codes')
    .insert(hashes.map((code_hash) => ({ user_id: userId, code_hash })));

  if (error) {
    throw error;
  }
}
