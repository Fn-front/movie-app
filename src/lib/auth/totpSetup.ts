/**
 * 二段階認証の設定操作（有効化・無効化・リカバリーコード再発行）
 *
 * 検証（`secondFactor.ts`）と分けてあるのは、こちらが「状態を変える」側で、
 * 守るべき不変条件が違うため。
 *
 * - 有効化は「初回コードを入力できた」ことを確認してから。QRを表示しただけで
 *   有効にすると、認証アプリへの登録に失敗した利用者がロックアウトされる
 * - 無効化とリカバリーコード再発行は、所持の証明（コード）を要求する。
 *   セッションを奪われただけで第2要素を外せたら、二段階認証の意味がない
 */

import { SupabaseClient } from '@supabase/supabase-js';

import {
  SECOND_FACTOR_METHOD,
  type SecondFactorMethod,
} from '@/constants/secondFactor';
import { decryptTotpSecret, encryptTotpSecret } from '@/lib/totp/encryption';
import { generateRecoveryCodes } from '@/lib/totp/recoveryCodes';
import { buildOtpAuthUri, generateTotpSecret } from '@/lib/totp/secret';
import { verifyTotpCode } from '@/lib/totp/totp';

import { toDbError } from './dbError';
import {
  consumeSecondFactorEmailCode,
  SECOND_FACTOR_VERIFY_RESULT,
} from './secondFactor';
import {
  SEND_SECOND_FACTOR_RESULT,
  sendSecondFactorCode,
  type SendSecondFactorResult,
} from './sendSecondFactorCode';

/** 設定開始の結果 */
export interface SecondFactorSetupStart {
  /** 開始した方式 */
  method: SecondFactorMethod;
  /** 認証アプリに読み込ませる URI（QRコードの中身）。method=totp のときのみ */
  otpauthUri?: string;
  /** 手入力用の共有鍵（QRを読めない端末向け）。method=totp のときのみ */
  secret?: string;
  /**
   * コード送信の結果。method=email_otp のときのみ
   *
   * `SENT` 以外なら設定途中の行は残していない。呼び出し側は利用者に
   * 理由を伝え、やり直させること。
   */
  sendResult?: SendSecondFactorResult;
}

/**
 * 既に二段階認証が有効なユーザーが再セットアップを試みた
 *
 * 呼び出し側が**DB障害と区別できるようにする**ための型。素の `Error` だと
 * ルートが「例外＝既に有効」と決め打ちせざるを得ず、接続断や INSERT 失敗まで
 * 「もう有効です」と表示されて障害の切り分けができない
 */
export class TotpAlreadyEnabledError extends Error {
  constructor() {
    super('TOTP is already enabled');
    this.name = 'TotpAlreadyEnabledError';
  }
}

/**
 * 設定を開始する（まだ有効化はしない）
 *
 * 既に設定途中の行があれば作り直す。前回のQRを読み込んだまま放置された
 * 鍵を生かしておく理由がない。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @param method - 設定する方式
 * @param accountName - 認証アプリ上の表示名（メールアドレス）。method=totp で使う
 * @param email - コードの送信先。method=email_otp で使う。サーバー側で確定した値のみ
 * @returns 方式に応じた設定情報
 * @throws 既に有効化済みの場合
 */
export async function startSecondFactorSetup(
  supabase: SupabaseClient,
  userId: string,
  method: SecondFactorMethod,
  accountName: string,
  email: string,
): Promise<SecondFactorSetupStart> {
  const { data: existing, error: readError } = await supabase
    .from('user_totp')
    .select('confirmed_at')
    .eq('user_id', userId)
    .maybeSingle();

  // ⚠️ **読み取りに失敗したら何も消さずに抜ける。**
  // Supabase は「行が無い」ときも「接続断・タイムアウト」のときも
  // data: null を返す。error を握り潰すと `existing === null` を
  // 「まだ設定していない」と断定し、下の無条件 DELETE に進んでしまう。
  // 暗号化済みの共有鍵は復元できず、新しい行は confirmed_at が NULL なので
  // **当人の二段階認証が黙って解除される**。削除は取り消せないので、
  // 確証が無いときは何もしないのが正しい（sessionProbe.ts と同じ原則）
  if (readError) throw toDbError(readError, 'read user_totp for setup');

  if (existing?.confirmed_at) {
    throw new TotpAlreadyEnabledError();
  }

  const isTotp = method === SECOND_FACTOR_METHOD.TOTP;
  const secret = isTotp ? generateTotpSecret() : null;

  // 設定途中の行は作り直す（upsert だと古い last_used_counter が残る）。
  //
  // 削除の失敗も見る。`user_totp.user_id` は主キーなので、消し損ねていれば
  // 直後の INSERT が重複で落ちて結果的に拒否側へ倒れるが、その偶然に
  // 寄りかからない（主キーが変われば黙って通るようになる）
  const { error: deleteError } = await supabase
    .from('user_totp')
    .delete()
    .eq('user_id', userId);

  if (deleteError) {
    throw toDbError(deleteError, 'delete user_totp for setup');
  }

  // ⚠️ `method` を必ず書く。省くと DB の DEFAULT 'totp' が入り、
  // メールOTP では `encrypted_secret` が NULL なので
  // `chk_secret_matches_method` に 23514 で落ちる
  const { error } = await supabase.from('user_totp').insert({
    user_id: userId,
    method,
    encrypted_secret: secret ? encryptTotpSecret(secret) : null,
  });

  if (error) {
    throw toDbError(error, 'insert user_totp');
  }

  if (isTotp) {
    return {
      method,
      otpauthUri: buildOtpAuthUri(secret as string, accountName),
      secret: secret as string,
    };
  }

  const sendResult = await sendSecondFactorCode(supabase, userId, email);

  // ⚠️ 消すのは `SEND_FAILED` のときだけ。
  //
  // そのパスでは `sendSecondFactorCode` が `otp_codes` の行も消しているので、
  // 使えるコードが1つも無い。設定途中の行を残すと「コード入力画面に来たのに
  // コードが来ない」状態になる。
  //
  // 逆に `THROTTLED` / `LIMIT_EXCEEDED` では**直前に送ったコードがまだ
  // 生きている**。ここで行を消すと、受信箱にあるコードを入力できなくなる。
  if (sendResult === SEND_SECOND_FACTOR_RESULT.SEND_FAILED) {
    await supabase.from('user_totp').delete().eq('user_id', userId);
  }

  return { method, sendResult };
}

/**
 * 初回コードを検証して有効化する
 *
 * 成功した場合だけリカバリーコードを発行する。発行してから有効化に失敗すると、
 * 「使えるリカバリーコードがあるのに二段階認証は無効」という中途半端な状態になる。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @param code - 認証アプリ、またはメールで届いた6桁のコード
 * @param email - 本人のメールアドレス。method=email_otp の照合に使う
 * @returns 平文のリカバリーコード（この一度だけ利用者へ見せる）。コードが合わなければ null
 */
export async function confirmSecondFactorSetup(
  supabase: SupabaseClient,
  userId: string,
  code: string,
  email: string,
): Promise<string[] | null> {
  const { data: row, error: readError } = await supabase
    .from('user_totp')
    .select('encrypted_secret, confirmed_at, method')
    .eq('user_id', userId)
    .maybeSingle();

  // 拒否側（INVALID_CODE）に倒れるので直ちに危険ではないが、障害が
  // 「コードが違う」に化けて切り分けができない
  if (readError) throw toDbError(readError, 'read user_totp for confirm');

  // 設定を開始していない、または既に有効
  if (!row || row.confirmed_at) {
    return null;
  }

  // ⚠️ 設定途中（`confirmed_at` が NULL）なので `verifySecondFactor` は使えない。
  // あちらは `getSecondFactorMethod` を通り、未確定の行を「未設定」と見る
  if (row.method === SECOND_FACTOR_METHOD.EMAIL_OTP) {
    const result = await consumeSecondFactorEmailCode(supabase, email, code);

    if (result !== SECOND_FACTOR_VERIFY_RESULT.SUCCESS) {
      return null;
    }
  } else if (
    !verifyTotpCode(code.trim(), decryptTotpSecret(row.encrypted_secret))
  ) {
    return null;
  }

  const { codes, hashes } = generateRecoveryCodes();

  // 設定途中の行だけを有効化する。並行して無効化された場合は何も起きない
  const { data: updated, error: updateError } = await supabase
    .from('user_totp')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('confirmed_at', null)
    .select('user_id');

  if (updateError) throw toDbError(updateError, 'confirm user_totp');

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
  // ⚠️ 順序を入れ替えないこと。リカバリーコードを先に消すと、`user_totp` の
  // 削除が失敗したときに「二段階認証は有効なのにリカバリーコードが0件」と
  // いう状態が残る。認証アプリを失った利用者が恒久的にロックアウトされる
  const { error } = await supabase
    .from('user_totp')
    .delete()
    .eq('user_id', userId);

  if (error) {
    throw toDbError(error, 'delete user_totp');
  }

  const { error: codesError } = await supabase
    .from('totp_recovery_codes')
    .delete()
    .eq('user_id', userId);

  // ここで失敗しても2FAは既に無効。残ったコードは再度有効化したときに
  // replaceRecoveryCodes が消すが、黙って残すと「どれが生きているか」が
  // 分からなくなるので報告する
  if (codesError) {
    throw toDbError(codesError, 'delete totp_recovery_codes on disable');
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
  // ⚠️ **削除の失敗を握り潰して挿入に進んではいけない。**
  // `verifyRecoveryCode` は `used_at IS NULL` の行を全件突き合わせるので、
  // 消し損ねた旧コードはそのまま通り続ける。「コードが漏れたので再発行する」
  // という最も重要な場面で保護が消えるうえ、ルートは 200 で
  // 「以前のコードはすべて使えなくなります」と答えてしまう
  const { error: deleteError } = await supabase
    .from('totp_recovery_codes')
    .delete()
    .eq('user_id', userId);

  if (deleteError) {
    throw toDbError(deleteError, 'delete totp_recovery_codes');
  }

  const { error } = await supabase
    .from('totp_recovery_codes')
    .insert(hashes.map((code_hash) => ({ user_id: userId, code_hash })));

  if (error) {
    throw toDbError(error, 'insert totp_recovery_codes');
  }
}
