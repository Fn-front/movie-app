/**
 * パスワードリセットトークン
 *
 * メールのリンクに載せるワンタイムトークンを扱う。
 *
 * - 平文トークンはメールにだけ載せ、DBには SHA-256 ハッシュのみ保存する
 * - 照合はハッシュ値での検索（インデックス一致）で行う。256bit の乱数由来のため
 *   総当たりは成立せず、bcrypt のようなストレッチは不要
 * - 発行・検証・消費を1か所にまとめ、呼び出し側が手順を間違えられないようにする
 */

import { SupabaseClient } from '@supabase/supabase-js';

import { PASSWORD_RESET_CONFIG } from '@/constants/passwordReset';
import {
  generateVerificationToken,
  hashVerificationToken,
} from '@/lib/otp/verificationToken';

/**
 * リセットトークンを発行し、保存する
 *
 * ⚠️ **古いリンクはここでは消さない。** 消すのは
 * `invalidateOtherPasswordResetTokens` で、**メールの送信に成功したあと**。
 *
 * 以前はここで先に消していた。すると送信に失敗したとき、**相手の手元にあった
 * 有効なリンクだけが死に、新しいリンクは誰にも届かない**（#1223）。平文は
 * 送れなかったメールにしか載っていないので、DBに行があっても誰も使えない。
 * admin 画面には「メールの送信に失敗しました。」としか出ないため、相手の
 * リンクを壊したことすら伝わらない。
 *
 * 代償として、送信に失敗すると古いリンクが**自身の期限切れまで**生き残る
 * （新規発行なら最長24時間 / `ADMIN_ACCOUNT_CONFIG.CREATE_LINK_EXPIRY_MINUTES`）。
 * 相手が到達不能になるより、古いリンクが残るほうがましだと判断した。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @param expiryMinutes - 有効期限（分）。既定は利用者自身のリセット向けの値。
 *   admin がアカウントを発行する経路は、受け取る相手が気づくまでの時間を
 *   見込んで長めに取る（`ADMIN_ACCOUNT_CONFIG`）
 * @returns メールに載せる平文トークン
 */
export async function issuePasswordResetToken(
  supabase: SupabaseClient,
  userId: string,
  expiryMinutes: number = PASSWORD_RESET_CONFIG.EXPIRY_MINUTES,
): Promise<string> {
  const { token, tokenHash } = generateVerificationToken();

  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  const { error } = await supabase.from('password_reset_tokens').insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    throw error;
  }

  return token;
}

/**
 * 今発行したもの以外の未使用トークンを無効化する
 *
 * 複数のリンクが同時に生きていると、古いメールを拾った第三者にも窓が残る。
 *
 * ⚠️ **メールの送信に成功してから呼ぶこと。** 送る前に呼ぶと #1223 に戻る。
 * 送信前に古いリンクを消してしまうと、送信に失敗したときに相手が到達不能に
 * なる。
 *
 * ⚠️ 発行したばかりのトークンを `neq` で除外する。条件は「このユーザーの
 * 未使用トークン全件」なので、除外しないと**今メールで送った新しいリンクごと
 * 消える**。
 *
 * ⚠️ **`neq` だけでは足りない。`lt('created_at', 自分の発行時刻)` が要る。**
 * `neq` は「自分以外」なので、**同時に走っている別リクエストが入れた
 * トークンも消してしまう**。2つのリクエストが交差すると互いの行を消し合い、
 * 2通のメールを送ったのに**有効なリンクが0本**になる（#1223 と同じ
 * 行き止まり）。
 *
 * ```
 * issue(A) → issue(B) → invalidate(keep=A)  // B を消す
 *                     → invalidate(keep=B)  // A を消す  ⇒ 0本
 * ```
 *
 * 旧実装（INSERT の前に DELETE）はこの形にならず、どう交差しても1本以上
 * 残っていた。DELETE を後ろへ動かしたことで生まれた穴なので、ここで塞ぐ。
 * 自分より古い行だけを消せば、**最後に発行した1本が必ず残る**（旧実装の
 * 成功時の挙動と同じ）。
 *
 * 削除に失敗しても投げない。送信は既に済んでいて相手の手元には使える
 * リンクがあり、ここで 500 を返すと admin は押し直してもう1通送ることに
 * なる（枠も消費する）。保証が崩れたことは気づけるようログには必ず出す。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @param keepToken - 残す平文トークン（`issuePasswordResetToken` の戻り値）
 */
export async function invalidateOtherPasswordResetTokens(
  supabase: SupabaseClient,
  userId: string,
  keepToken: string,
): Promise<void> {
  const keepHash = hashVerificationToken(keepToken);

  // 自分の行の発行時刻を引く。これより**古い**ものだけを消す。
  // 見つからなければ、後から発行した別のリクエストが既に消したあと。
  // その相手が掃除を済ませているので、ここで何もしなくてよい
  const { data: keepRow, error: lookupError } = await supabase
    .from('password_reset_tokens')
    .select('created_at')
    .eq('token_hash', keepHash)
    .maybeSingle();

  if (lookupError) {
    console.error(
      `[passwordResetToken] 残すトークンの発行時刻を引けませんでした userId='${userId}'`,
      lookupError,
    );
    return;
  }

  if (!keepRow) return;

  const { error } = await supabase
    .from('password_reset_tokens')
    .delete()
    .eq('user_id', userId)
    .is('used_at', null)
    .neq('token_hash', keepHash)
    .lt('created_at', keepRow.created_at as string);

  if (error) {
    console.error(
      `[passwordResetToken] 古いリセットリンクの無効化に失敗しました userId='${userId}'`,
      error,
    );
  }
}

/**
 * そのユーザーの未使用リセットリンクをすべて無効化する（#1301）
 *
 * ⛔ **再設定が終わった時点で、未使用リンクを生かす理由は無い。**
 *
 * 以前は不要だった。`issuePasswordResetToken` が発行の**前に**同一ユーザーの
 * 未使用トークンを全削除していたため、未使用は常に高々1本だったからである。
 * #1223 でその削除を「送信に成功したあと」へ移したので、**送信に失敗すると
 * 未使用トークンが2本以上残る**ようになった。
 *
 * 送信側（Resend）が受理したのにクライアントがエラー扱いした場合、
 * **届いているのに無効化されないリンク**が残る。その状態で別のリンクから
 * 再設定すると、期限内はもう一度パスワードを変えられてしまう。
 *
 * ⚠️ `invalidateOtherPasswordResetTokens` とは条件が違う。あちらは
 * 「いま配ったリンクだけ残す」ためのもので、こちらは**残すものが無い**。
 *
 * ⚠️ **あちらの `lt('created_at', ...)` に相当するガードは置かない。**
 * あれは同時に走る別の発行リクエストと行を消し合って「2通送ったのに
 * どちらも使えない」になるのを防ぐためのもの。こちらは「申請した直後に
 * 古いリンクで再設定が通って新しいリンクが消える」が起きうるが、
 * **再設定はもう成立している**ので申請し直せばよく、行き止まりにならない。
 *
 * ⚠️ 行は DELETE する（`used_at` を立てない）。`invalidateOther` と同じ形。
 * 消した側のリンクを後から開くと `#1232` の出し分けでは「使用済み」ではなく
 * 「無効」として返る点に注意。
 *
 * ⛔ **呼ぶべき経路はここだけではない。** 「パスワードを変えたら古いリンクは
 * 死ぬ」を成立させるには、`users.password_hash` を更新するすべての経路から
 * 呼ぶ必要がある。現在は次の2つ。
 *
 *   - `auth/password-reset/confirm`（リンクから再設定）
 *   - `user/change-password`（設定画面から変更。**侵害に気づいた利用者が
 *     まず使うのはこちら**）
 *
 * ⚠️ **投げない。** 呼ぶのは再設定が確定したあと。ここで 500 にすると、
 * パスワードは変わっているのに利用者には「失敗しました」と出て、
 * 古いパスワードで何度もやり直すことになる（#1223 と同じ判断）。
 * 保証が崩れたことに気づけるようログには必ず出す。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 */
export async function invalidateAllPasswordResetTokens(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  // ⚠️ **try で囲う。** `error` を見るだけでは足りない —— クライアントが
  //   同期的に投げる経路（接続断など）が残り、呼び出し側の catch に
  //   落ちて 500 になる。「投げない」は契約なのでここで閉じる
  try {
    const { error } = await supabase
      .from('password_reset_tokens')
      .delete()
      .eq('user_id', userId)
      .is('used_at', null);

    if (error) {
      console.error(
        `[passwordResetToken] 再設定後のリセットリンク無効化に失敗しました userId='${userId}'`,
        error,
      );
    }
  } catch (error) {
    console.error(
      `[passwordResetToken] 再設定後のリセットリンク無効化に失敗しました userId='${userId}'`,
      error,
    );
  }
}

/**
 * トークンの消費結果
 *
 * 消費できなかった理由まで返す。画面の文言を出し分けるため（#1232）。
 * 実際に「設定を終えた人がリンクを開き直して『有効期限が切れています』と
 * 言われる」事故が起きた
 */
export type PasswordResetTokenFailure = {
  status: 'used' | 'expired' | 'invalid';
};

export type ConsumePasswordResetTokenResult =
  | { status: 'consumed'; userId: string }
  | PasswordResetTokenFailure;

/**
 * 消費せずに引いた結果
 *
 * `valid` でも**まだ焼いていない**。呼び出し側は検証を済ませてから
 * `consumePasswordResetToken` を呼ぶ
 */
export type PeekPasswordResetTokenResult =
  | { status: 'valid'; userId: string }
  | PasswordResetTokenFailure;

/**
 * トークンを消費せずに対象ユーザーを引く（#1235）
 *
 * 回復可能なエラー（新旧同一パスワード、対象ユーザーが居ない）で弾く場合に、
 * リンクを焼かずに済ませるために使う。焼いてしまうと、入力を直したくても
 * 同じリンクでやり直せず再発行が要る。パスワードを忘れている＝他に
 * ログイン手段が無い状態で、発行アカウントなら自力で再発行もできない。
 *
 * ⚠️ **これだけで通してはいけない。** 読んでから書くまでの間に別の
 * リクエストが消費しうるので、最後は必ず `consumePasswordResetToken` の
 * 条件付き UPDATE で確定させる。この関数は「先に弾けるものを弾く」ためだけ。
 *
 * @param supabase - service_role のクライアント
 * @param token - メールのリンクに載っていた平文トークン
 * @returns 使えるならユーザーID付き。使えなければその理由
 */
export async function peekPasswordResetToken(
  supabase: SupabaseClient,
  token: string,
): Promise<PeekPasswordResetTokenResult> {
  const tokenHash = hashVerificationToken(token);

  const { data, error } = await supabase
    .from('password_reset_tokens')
    .select('user_id, used_at, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  // ⚠️ 読み取りの失敗を `invalid` に化かさない（#1167）。本当に無効な
  // トークンと区別がつかず、利用者はリセットの再申請へ誘導される
  if (error) {
    throw error;
  }

  if (!data) {
    return { status: 'invalid' };
  }

  const failure = resolveRowFailure(data.used_at, data.expires_at as string);
  if (failure) {
    return failure;
  }

  return { status: 'valid', userId: data.user_id as string };
}

/**
 * トークンを検証して消費する
 *
 * 「未使用かつ期限内のときだけ使用済みにする」を条件付きUPDATEの更新行数で
 * 判定する。先に読んでから書くと、同じリンクを同時に2回開かれたときに
 * 両方とも通ってしまう。
 *
 * 0行だった理由は**そのあとで**引き直す。UPDATE の条件を緩めて理由を得る
 * 作りにすると原子性が壊れるため、判定はあくまで更新行数で行う。
 *
 * @param supabase - service_role のクライアント
 * @param token - メールのリンクに載っていた平文トークン
 * @returns 消費できたらユーザーID付き。できなければその理由
 */
export async function consumePasswordResetToken(
  supabase: SupabaseClient,
  token: string,
): Promise<ConsumePasswordResetTokenResult> {
  const tokenHash = hashVerificationToken(token);

  const { data, error } = await supabase
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('user_id');

  // ⚠️ error を捨てると `data: null` → 理由の引き直しに落ち、行が無いので
  // `invalid` に化ける。呼び出し側は「リンクが無効」（400）を返し、本当に
  // 無効なトークンと区別がつかない。利用者はリセットの再申請へ誘導される。
  // 投げて 500 にする（#1167）。この経路では UPDATE 自体が失敗している＝
  // トークンは焼かれていないので、再試行は成功しうる
  if (error) {
    throw error;
  }

  if (data && data.length > 0) {
    return { status: 'consumed', userId: data[0].user_id as string };
  }

  return resolveConsumeFailure(supabase, tokenHash);
}

/**
 * 消費できなかった理由を引き直す
 *
 * ⚠️ 読み取りの失敗を `invalid` に化かさない。上と同じ理由で投げる。
 *
 * @param supabase - service_role のクライアント
 * @param tokenHash - 照合に使ったハッシュ
 * @returns `used` / `expired` / `invalid`
 */
async function resolveConsumeFailure(
  supabase: SupabaseClient,
  tokenHash: string,
): Promise<ConsumePasswordResetTokenResult> {
  const { data, error } = await supabase
    .from('password_reset_tokens')
    .select('used_at, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    throw error;
  }

  // 行が無い＝そもそも存在しないトークン。掃除で消えた場合もここに来るが、
  // 利用者にとっては「使えないリンク」で同じ
  if (!data) {
    return { status: 'invalid' };
  }

  const failure = resolveRowFailure(data.used_at, data.expires_at as string);
  if (failure) {
    return failure;
  }

  // 未使用で期限内なのに UPDATE が0行＝この一瞬で別のリクエストが消費した。
  // 同じリンクを同時に2回開いた場合。相手が使い切ったので使用済み扱いでよい
  return { status: 'used' };
}

/**
 * 行の内容から「使えない理由」を決める
 *
 * 消費の前（`peekPasswordResetToken`）と後（`resolveConsumeFailure`）の
 * 両方から使う。判定が2箇所に散ると、片方だけ直して食い違う
 *
 * @param usedAt - `used_at`
 * @param expiresAt - `expires_at`
 * @returns 使えない理由。使えるなら null
 */
function resolveRowFailure(
  usedAt: unknown,
  expiresAt: string,
): PasswordResetTokenFailure | null {
  // 使用済みを先に見る。両方に当てはまる（使ったあと期限も切れた）ときは、
  // 「期限切れ」より「使用済み」のほうが次にすること（ログイン）が分かる
  if (usedAt) {
    return { status: 'used' };
  }

  if (new Date(expiresAt).getTime() <= Date.now()) {
    return { status: 'expired' };
  }

  return null;
}

/**
 * トークンが使える状態かを確認する（消費はしない）
 *
 * 新しいパスワードを入力させる画面を開いた時点で、期限切れのリンクを
 * 使い続けさせないための事前確認に使う。
 *
 * @param supabase - service_role のクライアント
 * @param token - 平文トークン
 * @returns 使えるなら true
 */
export async function isPasswordResetTokenValid(
  supabase: SupabaseClient,
  token: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('password_reset_tokens')
    .select('id')
    .eq('token_hash', hashVerificationToken(token))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  // 上の `consumePasswordResetToken` と同じ理由（#1167）。
  // ⚠️ この関数は現時点でどこからも呼ばれていないが、罠を残すと
  // 新しい呼び出し側が同じ誤りを引き継ぐので揃えておく
  if (error) {
    throw error;
  }

  return Boolean(data);
}
