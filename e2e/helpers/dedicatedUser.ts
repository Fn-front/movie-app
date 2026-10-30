/**
 * E2E用の専用テストユーザー
 *
 * 共有の `TEST_USER`（storageState の生成元）を書き換えるテストは、
 * 同じユーザーを使う他の spec を並列実行時に壊す。二段階認証のように
 * 「そのユーザーの状態」を有効化・無効化するテストは専用ユーザーを使う。
 *
 * 作成も後片付けも Supabase REST（service role）で行う。アプリの
 * 新規登録フローを通すとOTP送信の上限・クールダウンに引っかかるため。
 *
 * メールアドレスは `runScopedEmail` で run 単位にする（#793）。固定だと
 * 共有DBに複数の run が同時に流れたとき、片方の後片付けが実行中の
 * もう片方のユーザーを消してしまう。
 */

import bcrypt from 'bcryptjs';

import { RUN_CLIENT_IP, RUN_EMAIL_LIKE_PATTERN } from './runScope';

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
  /** 付与するロール。既定は一般ユーザー */
  role?: 'user' | 'admin';
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
      role: user.role ?? 'user',
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
 * run 全体を対象にする `cleanupRunRateLimits` は、他の spec が依存する
 * 状態まで壊すため spec の中では使わない。
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
 * 同じ run の全 spec が同じIPからログインするため、ログインを繰り返す
 * spec が重なると 20回/15分 の上限に達する。
 *
 * action_type に加えて **この run のIPで絞る**（#793）。全 run が
 * 同じ `::1` を使っていた頃は action_type だけで消しても実害が無かったが、
 * run ごとにIPを分けた今は他 run のカウンタに触れないようにする。
 * `login_ip` が非ゼロであることに依存するテストは無いため、消して問題ない。
 */
export async function cleanupLoginIpRateLimits(): Promise<void> {
  await fetch(
    `${SUPABASE_URL}/rest/v1/rate_limits?action_type=eq.login_ip` +
      `&identifier=eq.${encodeURIComponent(RUN_CLIENT_IP)}`,
    { method: 'DELETE', headers: supabaseHeaders },
  );
}

/**
 * この run が作ったユーザーとそのOTPコードをまとめて物理削除する
 *
 * 各 spec も自分のユーザーを消すが、途中で落ちると取りこぼす。
 * run 単位のメールアドレス規約（`-<E2E_RUN_ID>@example.com`）を使って
 * 後片付けの追従漏れをまとめて回収する。
 *
 * 前方一致で消すが、`example.com` は RFC 2606 で文書・テスト用に予約された
 * ドメインで実在の利用者は持ち得ず、さらに run ID の接尾辞まで一致する
 * 必要があるため、実ユーザーを巻き込むことはない。
 *
 * `users` の外部キーは ON DELETE CASCADE のため、user_id を持つ関連
 * テーブルは連鎖削除される。`otp_codes` は user_id を持たないため先に消す。
 */
export async function deleteRunScopedUsers(): Promise<void> {
  const pattern = encodeURIComponent(RUN_EMAIL_LIKE_PATTERN);

  await fetch(`${SUPABASE_URL}/rest/v1/otp_codes?email=like.${pattern}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
  await fetch(`${SUPABASE_URL}/rest/v1/users?email=like.${pattern}`, {
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

/**
 * ユーザー名でアカウントを削除する
 *
 * admin が発行したアカウントは合成アドレス（`<ランダム>@<ランダム>.invalid`）を
 * 持つため、**メールアドレス一致の run 単位の後片付けでは消えない**。
 * 発行を伴うテストは、作ったアカウント名をここへ渡して明示的に消すこと。
 * 消し忘れると共有DBに実行のたびに溜まる。
 *
 * `admin_audit_logs.target_user_id` は ON DELETE CASCADE なので連鎖削除される。
 *
 * @param usernames - 削除するユーザー名
 */
export async function deleteUsersByUsernames(
  usernames: string[],
): Promise<void> {
  if (usernames.length === 0) return;

  const list = usernames.map((name) => `"${name}"`).join(',');

  await fetch(`${SUPABASE_URL}/rest/v1/users?username=in.(${list})`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
}
