/**
 * E2E用の専用テストユーザー
 *
 * 共有の `TEST_USER`（storageState の生成元）を書き換えるテストは、
 * 同じユーザーを使う他の spec を並列実行時に壊す。二段階認証のように
 * 「そのユーザーの状態」を有効化・無効化するテストは専用ユーザーを使う。
 *
 * 作成も後片付けも Supabase REST（service role）で行う。アプリの
 * 新規登録フローを通すとOTP送信の上限・クールダウンに引っかかるため。
 */

import bcrypt from 'bcryptjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

const jsonHeaders = {
  ...supabaseHeaders,
  'Content-Type': 'application/json',
};

/**
 * bcrypt のコスト。
 *
 * 製品コードは 12 だが、ここは「ログインできる」ことだけが必要で、
 * テストの実行時間に直接響くため低くする。ハッシュの形式は同じなので
 * `bcrypt.compare` は問題なく通る。
 */
const TEST_BCRYPT_COST = 8;

export interface DedicatedUser {
  email: string;
  password: string;
}

/**
 * メール確認済みのユーザーを作成する
 *
 * 既に同じメールのユーザーが残っていれば消してから作り直す
 * （前回の実行が落ちて後片付けされていない場合に備える）。
 *
 * @param user - 作成するユーザー
 * @returns 作成したユーザーのID
 */
export async function createVerifiedUser(user: DedicatedUser): Promise<string> {
  await deleteUserByEmail(user.email);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
    method: 'POST',
    headers: { ...jsonHeaders, Prefer: 'return=representation' },
    body: JSON.stringify({
      email: user.email,
      name: 'E2E Dedicated',
      password_hash: await bcrypt.hash(user.password, TEST_BCRYPT_COST),
      is_verified: true,
    }),
  });

  const data = await res.json();
  const id: string | undefined = data?.[0]?.id;

  if (!id) {
    throw new Error(
      `専用テストユーザーの作成に失敗した: ${user.email} (${res.status} ${JSON.stringify(data)})`,
    );
  }

  return id;
}

/**
 * メールアドレスでユーザーと関連レコードを削除する
 *
 * `users` の外部キーは ON DELETE CASCADE なので、user_id を持つ
 * 関連テーブル（user_totp / totp_recovery_codes 等）は連鎖削除される。
 * `otp_codes` と `rate_limits` は user_id を持たないため個別に消す。
 *
 * @param email - 対象のメールアドレス
 */
export async function deleteUserByEmail(email: string): Promise<void> {
  const enc = encodeURIComponent(email);

  await fetch(`${SUPABASE_URL}/rest/v1/otp_codes?email=eq.${enc}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
  await cleanupRateLimitsForEmail(email);
  await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${enc}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
}

/**
 * そのメールアドレスに紐づくレート制限カウンタだけを消す
 *
 * 全消し（`cleanupAllRateLimits`）は他の spec が依存する状態まで壊すため使わない。
 *
 * 識別子は2種類ある。
 * - メールアドレスそのもの（OTPの日次送信上限など）
 * - `メールアドレス|送信元IP`（ログイン試行の上限）。IPは実行時まで
 *   分からないため前方一致で消す
 *
 * @param email - 対象のメールアドレス
 */
export async function cleanupRateLimitsForEmail(email: string): Promise<void> {
  const enc = encodeURIComponent(email);

  await fetch(`${SUPABASE_URL}/rest/v1/rate_limits?identifier=eq.${enc}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
  await fetch(
    `${SUPABASE_URL}/rest/v1/rate_limits?identifier=like.${encodeURIComponent(`${email}|*`)}`,
    { method: 'DELETE', headers: supabaseHeaders },
  );
}

/**
 * ユーザーID を識別子とするレート制限カウンタを消す
 *
 * 二段階認証コードの検証（`totp_verify`）はユーザーIDで数えている。
 *
 * @param userId - 対象ユーザーのID
 */
export async function cleanupRateLimitsForUser(userId: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/rate_limits?identifier=eq.${userId}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
}

/**
 * 送信元IP単位のログイン試行カウンタ（`login_ip`）を消す
 *
 * この制限だけは識別子が送信元IPで、テストユーザーに紐づかない。
 * ローカルでも CI でも全 spec が同じIPからログインするため、
 * ログインを繰り返す spec が重なると 20回/15分 の上限に達する。
 *
 * 識別子ではなく **action_type で絞って** 消すことで、他の spec が使う
 * メールアドレス単位のカウンタには触れない。`login_ip` が非ゼロである
 * ことに依存するテストは無いため、消して問題ない。
 */
export async function cleanupLoginIpRateLimits(): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/rate_limits?action_type=eq.login_ip`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
}

/**
 * そのメールアドレスのOTPコードを消す
 *
 * 直前のOTPが残っていると再送間隔（60秒）に引っかかって送信できない。
 *
 * @param email - 対象のメールアドレス
 */
export async function cleanupOtpCodesForEmail(email: string): Promise<void> {
  await fetch(
    `${SUPABASE_URL}/rest/v1/otp_codes?email=eq.${encodeURIComponent(email)}`,
    { method: 'DELETE', headers: supabaseHeaders },
  );
}
