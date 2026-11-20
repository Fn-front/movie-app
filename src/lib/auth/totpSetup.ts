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
import { TOTP_SETUP_PENDING_TTL_MINUTES } from '@/constants/totp';
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
 * ⛔ **リカバリーコードの保存は `confirmed_at` の UPDATE より前**
 * （#1368 の2回目レビュー）。2つの失敗は**対称ではない**。
 *
 * | 順序 | 途中で失敗したときの状態 | 重さ |
 * |---|---|---|
 * | 先に保存 → 確定 | 使えるリカバリーコードがあるが二段階認証は**無効** | **平文は失敗パスで捨てられる**ので、一致する値を出せる人間がいない。加えて `verifySecondFactor` の呼び出し元（`secondFactorGuard` / `auth.ts` の2か所）はすべて手前で `getSecondFactorMethod` を見ている。次に成功したとき全件差し替わるので**自然に片付く** |
 * | 先に確定 → 保存 | 二段階認証が**有効なのにリカバリーコードが0件** | `replaceRecoveryCodes` は「全件 DELETE → INSERT」なので、INSERT だけ失敗すると DB にも画面にも1件も残らない。認証アプリを失うと**恒久的にロックアウト**（`disableTotp` が順序まで固定して避けている状態そのもの） |
 *
 * ⛔ **`verifySecondFactor` を直接呼ぶ経路を足すなら、自分でガードを置くこと。**
 * あの関数は**リカバリーコードを形式だけで振り分け**、`getSecondFactorMethod`
 * より**前**に `verifyRecoveryCode` を呼ぶ（`secondFactor.ts`）。孤児の
 * リカバリーコードが安全なのは平文が存在しないからであって、到達できない
 * からではない。
 *
 * ⚠️ **確定した後ろに throw しうる処理を置かない。** 500 になると平文の
 * リカバリーコードを一度も表示できないまま終わり（平文はこの戻り値にしか
 * 出ない）、しかも `confirmed_at` は入っているので、もう一度押した利用者には
 * 「認証コードが正しくありません」と出る。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @param code - 認証アプリ、またはメールで届いた6桁のコード
 * @param email - 本人のメールアドレス。method=email_otp の照合に使う
 * @returns 平文のリカバリーコード（この一度だけ利用者へ見せる）と有効化した方式。
 *   コードが合わなければ null
 */
/**
 * 設定途中のまま期限を過ぎていた
 *
 * ⚠️ `null`（コードが合わない）と**区別する**。同じ文言にすると、届いた
 * ばかりの正しいコードを入れた利用者が自分の入力を疑い、再送と入力を
 * 繰り返して `TOTP_SETTINGS_VERIFY` を使い切る（#1368 の2回目レビュー）。
 */
export const SECOND_FACTOR_SETUP_EXPIRED = 'expired' as const;

/** `confirmSecondFactorSetup` の戻り値 */
export interface ConfirmSecondFactorSetupResult {
  /** 平文のリカバリーコード。利用者へ見せられるのはこの一度だけ */
  codes: string[];
  /** 有効化した方式。通知の本文に出す */
  method: SecondFactorMethod;
}

export async function confirmSecondFactorSetup(
  supabase: SupabaseClient,
  userId: string,
  code: string,
  email: string,
): Promise<
  ConfirmSecondFactorSetupResult | typeof SECOND_FACTOR_SETUP_EXPIRED | null
> {
  const { data: row, error: readError } = await supabase
    .from('user_totp')
    .select('encrypted_secret, confirmed_at, method, created_at')
    .eq('user_id', userId)
    .maybeSingle();

  // 拒否側（INVALID_CODE）に倒れるので直ちに危険ではないが、障害が
  // 「コードが違う」に化けて切り分けができない
  if (readError) throw toDbError(readError, 'read user_totp for confirm');

  // 設定を開始していない、または既に有効
  if (!row || row.confirmed_at) {
    return null;
  }

  // ⛔ **古い保留行は使わせない**（#1368 のレビュー）。
  //
  //   ここは `setup` が作った保留行だけを見るため、保留行が無期限に生きると
  //   **`setup` の再認証を通り抜けた行を後からいつでも有効化できる**。
  //   再認証を足す前にセッションを奪って `setup` を1回叩いていれば、
  //   修正後もそのまま有効化できてしまう（既存の行はマイグレーションで
  //   1回掃除したが、同じ形を再発させない）。
  const expiredBefore = new Date(
    Date.now() - TOTP_SETUP_PENDING_TTL_MINUTES * 60 * 1000,
  ).toISOString();

  if (new Date(row.created_at).getTime() < new Date(expiredBefore).getTime()) {
    // ⚠️ 行ごと消す。残すと `send-challenge` が**使えないコードを送り続ける**
    //   （あちらは保留行があるかどうかしか見ない）
    // ⚠️ **期限の条件も入れる**（#1368 の3回目レビュー）。判定に使った
    //   `row.created_at` は SELECT 時点のスナップショットなので、ここまでの
    //   あいだに別タブが `startSecondFactorSetup` を通していると、
    //   **その新しい保留行まで消える**（消えた側は以降「認証コードが
    //   正しくありません」になり、画面も戻らない）
    const { error: deleteError } = await supabase
      .from('user_totp')
      .delete()
      .eq('user_id', userId)
      .is('confirmed_at', null)
      .lt('created_at', expiredBefore);

    if (deleteError) {
      throw toDbError(deleteError, 'delete expired user_totp');
    }

    return SECOND_FACTOR_SETUP_EXPIRED;
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

  // ⛔ **確定より前に保存する**（上の表を参照）。ここで落ちても二段階認証は
  //   無効のままで、使えないコードが残るだけ。逆順にすると
  //   「有効なのにリカバリーコードが0件」になる
  await replaceRecoveryCodes(supabase, userId, hashes);

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

  // ⚠️ **方式も返す。** 呼び出し側は有効化の通知に使う。ここで返さないと
  //   `getSecondFactorMethod` をもう一度呼ぶことになり、**有効化が確定した
  //   後ろに throw しうる処理が1つ増える**（#1368 のレビュー）。
  //   500 になると平文のリカバリーコードを一度も表示できないまま終わる
  return { codes, method: row.method as SecondFactorMethod };
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
