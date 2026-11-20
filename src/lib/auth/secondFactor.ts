/**
 * 二段階認証（第2要素）のサーバー側検証
 *
 * `src/lib/totp/` が純粋な計算（RFC 6238 / 暗号化 / ハッシュ）を担うのに対し、
 * ここは DB と突き合わせる層を担う。具体的には:
 *
 * - 有効になっている方式（TOTP / メールOTP）の判定
 * - 共有鍵の取り出しと復号（TOTP）
 * - 同じコードの使い回しの拒否（RFC 6238 Section 5.2 の要求）
 * - リカバリーコードの1回限りの消費（方式に依存しない）
 *
 * 使い回し・消費の判定は**条件付きUPDATEの更新行数**で行う。先に読んでから
 * 書くと、同じコードを同時に2回投げられたときに両方とも通ってしまう。
 *
 * ⚠️ テーブル名が `user_totp` / `totp_recovery_codes` のままなのは、
 * リネームすると旧コードが動いている本番DBに先に当たってログインが全滅する
 * ため（#1261）。メールOTP も同じテーブルを使う。
 */

import { SupabaseClient } from '@supabase/supabase-js';

import {
  SECOND_FACTOR_METHOD,
  TWO_FACTOR_OTP_ACTION,
  type SecondFactorMethod,
} from '@/constants/secondFactor';
import { OTP_CONFIG } from '@/constants/otp';
import { TOTP_SETUP_PENDING_TTL_MINUTES } from '@/constants/totp';
import { decryptTotpSecret } from '@/lib/totp/encryption';
import { hashOtpCode } from '@/lib/otp/hashOtpCode';
import {
  findMatchingRecoveryCodeHash,
  normalizeRecoveryCode,
} from '@/lib/totp/recoveryCodes';
import { findMatchingCounter } from '@/lib/totp/totp';
import { normalizeEmail } from '@/utils/email';

import { toDbError } from './dbError';
import { incrementOtpAttempts } from './otpAttempts';

/**
 * 検証結果
 *
 * 利用者に見せるメッセージは呼び出し側で決める。ここでは「なぜ通らなかったか」
 * だけを返す。
 */
export const SECOND_FACTOR_VERIFY_RESULT = {
  /** 検証成功 */
  SUCCESS: 'success',
  /** コードが一致しない */
  INVALID: 'invalid',
  /** 一致したが既に使われている（使い回し / 同時実行の敗者） */
  REUSED: 'reused',
  /** そもそも二段階認証が有効になっていない */
  NOT_ENABLED: 'not_enabled',
} as const;

export type SecondFactorVerifyResult =
  (typeof SECOND_FACTOR_VERIFY_RESULT)[keyof typeof SECOND_FACTOR_VERIFY_RESULT];

/** リカバリーコードとして扱う形式（ハイフン・大文字小文字は正規化後に判定） */
const RECOVERY_CODE_PATTERN = /^[2-9A-HJKMNP-TWXYZ]{10}$/;

/**
 * 有効になっている第2要素の方式を返す
 *
 * `confirmed_at` が入っているものだけを「有効」とみなす。設定途中（QRを表示した
 * だけで初回コードを入れていない）状態でログインを止めてしまうと、
 * 認証アプリに登録できなかった利用者がそのままロックアウトされる。
 *
 * ⚠️ 戻り値が `null` 以外かどうかを見る呼び出し側は、`!== null` ではなく
 * `Boolean(...)` を使うこと。モックが未設定で `undefined` を返したとき
 * `undefined !== null` は true（＝第2要素が有効）に倒れる。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @returns 有効な方式。設定していなければ null
 */
export async function getSecondFactorMethod(
  supabase: SupabaseClient,
  userId: string,
): Promise<SecondFactorMethod | null> {
  const { data, error } = await supabase
    .from('user_totp')
    .select('method')
    .eq('user_id', userId)
    .not('confirmed_at', 'is', null)
    .maybeSingle();

  // ⚠️ **error を握り潰して null に倒してはいけない。**
  //
  // `Error` でラップするのは、素の PostgREST オブジェクトのまま投げると
  // NextAuth が原因を保存せず、ログイン経路で診断情報が消えるため
  // （理由は dbError.ts）。
  // Supabase は「行が無い」ときも「接続断・タイムアウト・PostgREST エラー」の
  // ときも data: null を返す。区別できるのは error だけ。
  //
  // 呼び出し元（auth.ts のログイン3経路）はいずれも「有効なら止める」側の
  // ガードなので、null は**第2要素を飛ばす**ことを意味する。DB の不調だけで
  // パスワードのみのログインが成立し、7日間有効なセッションが発行されてしまう。
  // 判定できないなら拒否側へ倒す（rateLimit.ts の undeterminedResult と同じ方針）
  if (error) throw toDbError(error, 'read user_totp');

  return (data?.method as SecondFactorMethod | undefined) ?? null;
}

/**
 * **設定途中も含めた**方式を返す（#1285）
 *
 * `getSecondFactorMethod` は `confirmed_at IS NOT NULL` で絞るため、
 * まだ有効化していない利用者には使えない。設定中にコードを送り直す経路
 * （`user/totp/send-challenge`）だけがこちらを使う。
 *
 * ⛔ **ログインのガードには使わないこと。** あちらは「有効なら第2要素を
 * 要求する」判定で、設定途中の行まで有効とみなすと、まだ使えない方式で
 * ログインを止めてしまう。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @returns 有効または設定途中の方式。どちらも無ければ null
 */
export async function getSecondFactorMethodIncludingPending(
  supabase: SupabaseClient,
  userId: string,
): Promise<SecondFactorMethod | null> {
  return (await getSecondFactorSetupState(supabase, userId)).method;
}

/** 設定の状態（期限切れかどうかを呼び出し側で出し分けるため） */
export interface SecondFactorSetupState {
  /** 使える方式。期限切れの保留行は含めない */
  method: SecondFactorMethod | null;
  /** 保留行はあったが期限を過ぎていた */
  pendingExpired: boolean;
}

/**
 * 設定の状態を読む（期限切れを区別する）
 *
 * ⛔ **期限を過ぎた保留行は「無い」ものとして扱う**（#1368 の2回目レビュー）。
 *
 * `confirmSecondFactorSetup` は `TOTP_SETUP_PENDING_TTL_MINUTES` を過ぎた
 * 保留行を拒否する。ここがそれを知らないと、`send-challenge` が
 * **使えないコードを送り続ける**。届いたばかりの正しいコードが
 * 「認証コードが正しくありません」になり、利用者は再送と入力を繰り返して
 * `TOTP_SETTINGS_VERIFY` を使い切る（5回で15分 429）。
 *
 * ⚠️ `pendingExpired` を返すのは、**「未設定」と「期限切れ」で文言を
 * 分けるため**（#1368 の3回目レビュー）。設定中の画面に「二段階認証が
 * 設定されていません。」が出ると、利用者には矛盾として映る。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @returns 方式と、期限切れの保留行があったかどうか
 */
export async function getSecondFactorSetupState(
  supabase: SupabaseClient,
  userId: string,
): Promise<SecondFactorSetupState> {
  const { data, error } = await supabase
    .from('user_totp')
    .select('method, confirmed_at, created_at')
    .eq('user_id', userId)
    .maybeSingle();

  // 握り潰さない理由は上と同じ。読めないなら拒否側へ倒す
  if (error) throw toDbError(error, 'read user_totp including pending');

  if (!data) return { method: null, pendingExpired: false };

  if (
    !data.confirmed_at &&
    Date.now() - new Date(data.created_at).getTime() >
      TOTP_SETUP_PENDING_TTL_MINUTES * 60 * 1000
  ) {
    return { method: null, pendingExpired: true };
  }

  return {
    method: (data.method as SecondFactorMethod | undefined) ?? null,
    pendingExpired: false,
  };
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
): Promise<SecondFactorVerifyResult> {
  const { data: row, error } = await supabase
    .from('user_totp')
    .select('encrypted_secret, last_used_counter')
    .eq('user_id', userId)
    .not('confirmed_at', 'is', null)
    .maybeSingle();

  // 拒否側（NOT_ENABLED）に倒れるので直ちに危険ではないが、障害が
  // 「二段階認証が未設定」に化けて切り分けができない
  if (error) throw toDbError(error, 'read user_totp for verification');

  if (!row) {
    return SECOND_FACTOR_VERIFY_RESULT.NOT_ENABLED;
  }

  const counter = findMatchingCounter(
    code,
    decryptTotpSecret(row.encrypted_secret),
  );

  if (counter === null) {
    return SECOND_FACTOR_VERIFY_RESULT.INVALID;
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
    return SECOND_FACTOR_VERIFY_RESULT.REUSED;
  }

  return SECOND_FACTOR_VERIFY_RESULT.SUCCESS;
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
): Promise<SecondFactorVerifyResult> {
  const { data: rows, error } = await supabase
    .from('totp_recovery_codes')
    .select('id, code_hash')
    .eq('user_id', userId)
    .is('used_at', null);

  // 拒否側（INVALID）に倒れるので直ちに危険ではないが、障害が
  // 「コードが違う」に化けて利用者も運用も原因に辿り着けない
  if (error) throw toDbError(error, 'read totp_recovery_codes');

  if (!rows || rows.length === 0) {
    return SECOND_FACTOR_VERIFY_RESULT.INVALID;
  }

  const matchedHash = findMatchingRecoveryCodeHash(
    code,
    rows.map((row) => row.code_hash),
  );

  if (!matchedHash) {
    return SECOND_FACTOR_VERIFY_RESULT.INVALID;
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
    return SECOND_FACTOR_VERIFY_RESULT.REUSED;
  }

  return SECOND_FACTOR_VERIFY_RESULT.SUCCESS;
}

/**
 * メールで送った第2要素のコードを消費する
 *
 * 宛先を引数で受けるのは、**設定途中（`confirmed_at` が NULL）でも使える
 * ようにする**ため。そのとき `getSecondFactorMethod` は null を返すので、
 * `verifySecondFactor` 経由では到達できない。
 *
 * ⚠️ `email` をリクエストボディから渡してはいけない。必ずセッション、
 * または `users` テーブルから引いた値を渡すこと。
 *
 * ⚠️ **有効期限と試行回数はDB制約では強制されていない。**
 * `chk_otp_attempts`（0〜5）は列のドメイン制約にすぎず、実際の判定は
 * `/api/auth/otp/verify` の**ルートコード側**にある。第2要素はそのルートを
 * 通らないため、ここで自前で書かないと多層防御が1枚減ったことに誰も気づけない。
 *
 * 消費は**条件付き DELETE の削除行数**で判定する。先に読んでから消すと、
 * 同じコードを同時に2回投げられたときに両方とも通る。
 *
 * @param supabase - service_role のクライアント
 * @param email - 送信先。サーバー側で確定した値のみ
 * @param code - 利用者が入力した6桁のコード
 * @returns 検証結果
 */
export async function consumeSecondFactorEmailCode(
  supabase: SupabaseClient,
  email: string,
  code: string,
): Promise<SecondFactorVerifyResult> {
  const normalizedEmail = normalizeEmail(email);

  // 試行回数を先に見る。上限に達していたら照合せずに弾く。
  // ⚠️ 上限に達していたら**照合せずに**弾く。到達後も照合を続けると、
  //    攻撃者は上限の有無に関係なく総当たりを続けられる。
  //    （加算側の 23514 は `increment_otp_attempts` が `LEAST` で
  //     頭打ちにするのでもう起きない / #1284）
  const { data: row, error: rowError } = await supabase
    .from('otp_codes')
    .select('id, attempts')
    .eq('email', normalizedEmail)
    .eq('action_type', TWO_FACTOR_OTP_ACTION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rowError) throw toDbError(rowError, 'read otp_codes for second factor');

  if (!row) return SECOND_FACTOR_VERIFY_RESULT.INVALID;

  if (row.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
    return SECOND_FACTOR_VERIFY_RESULT.INVALID;
  }

  // 「一致して・期限内の行だけを消す」を1文で行う。
  // 消せた行数が1なら、この呼び出しがそのコードを消費したことが確定する
  const { data: deleted, error: deleteError } = await supabase
    .from('otp_codes')
    .delete()
    .eq('email', normalizedEmail)
    .eq('action_type', TWO_FACTOR_OTP_ACTION)
    .eq('code_hash', hashOtpCode(code.trim(), normalizedEmail))
    .gt('expires_at', new Date().toISOString())
    .select('id');

  if (deleteError) {
    throw toDbError(deleteError, 'consume otp_codes for second factor');
  }

  if (!deleted || deleted.length === 0) {
    // 不一致・期限切れのどちらでも加算する。
    // 利用者には区別して返さないので、区別して数える意味もない。
    //
    // ⛔ **read-then-write で書き戻さない**（#1284）。N 並列だと全員が
    //    同じ `attempts` を読んで同じ値を書くため、**0→1 が N 回**起きる
    //    だけになり、5回上限が機能しない
    await incrementOtpAttempts(supabase, row.id);

    return SECOND_FACTOR_VERIFY_RESULT.INVALID;
  }

  return SECOND_FACTOR_VERIFY_RESULT.SUCCESS;
}

/**
 * ログイン時のメールOTP を検証する
 *
 * 宛先は `users` から引く。呼び出し側（`authorize` / `jwt`）から渡すと、
 * ボディ由来の値が紛れ込む余地が生まれる。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @param code - 利用者が入力した6桁のコード
 * @returns 検証結果
 */
async function verifyEmailOtpCode(
  supabase: SupabaseClient,
  userId: string,
  code: string,
): Promise<SecondFactorVerifyResult> {
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('email')
    .eq('id', userId)
    .single();

  if (userError) throw toDbError(userError, 'read users for second factor');
  if (!user?.email) return SECOND_FACTOR_VERIFY_RESULT.NOT_ENABLED;

  return consumeSecondFactorEmailCode(supabase, user.email, code);
}

/**
 * 第2要素を検証する
 *
 * 方式（認証アプリ / メールのコード）とリカバリーコードのどれが来ても
 * 受け付ける。リカバリーコードは入力形式で振り分けるため、利用者は
 * どちらを入れるか選ぶ必要がない。
 *
 * `RECOVERY_CODE_PATTERN` は `[2-9A-HJKMNP-TWXYZ]{10}` で、6桁の数字とは
 * 長さも文字種も交わらないため、方式が増えても取り違えは起きない。
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
): Promise<SecondFactorVerifyResult> {
  const normalized = normalizeRecoveryCode(code);

  // リカバリーコードは方式に依存しない
  if (RECOVERY_CODE_PATTERN.test(normalized)) {
    return verifyRecoveryCode(supabase, userId, code);
  }

  const method = await getSecondFactorMethod(supabase, userId);

  if (method === null) {
    return SECOND_FACTOR_VERIFY_RESULT.NOT_ENABLED;
  }

  if (method === SECOND_FACTOR_METHOD.EMAIL_OTP) {
    return verifyEmailOtpCode(supabase, userId, code);
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
  const { count, error } = await supabase
    .from('totp_recovery_codes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('used_at', null);

  // 0 に倒すと、設定画面が `role='alert'` で「リカバリーコードを使い切って
  // います」と警告する。障害時に誤った危機感を与え、不要な再発行を誘発する
  if (error) throw toDbError(error, 'count totp_recovery_codes');

  return count ?? 0;
}
