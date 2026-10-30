/**
 * 管理者発行アカウントの作成・再発行
 *
 * 設計: `.claude/documents/admin-account-design.md`
 *
 * メールアドレスは「配送路」としてのみ使い、DB には保存しない。
 * `users.email` の NOT NULL / UNIQUE を満たすための合成値だけを入れる。
 */

import { SupabaseClient } from '@supabase/supabase-js';

import {
  ADMIN_AUDIT_ACTION,
  type AdminAuditAction,
} from '@/constants/adminAccount';
import { USER_ROLE } from '@/constants/auth';

import {
  generateSyntheticEmail,
  generateUsername,
  normalizeUsername,
} from './accountIdentity';

/** 一覧に出すアカウント */
export interface IssuedAccount {
  id: string;
  username: string;
  createdAt: string;
  lastLoginAt: string | null;
  /** パスワードを設定済みか（未設定＝リンクがまだ使われていない） */
  hasPassword: boolean;
}

/** 一覧取得で使うカラム */
const ISSUED_ACCOUNT_SELECT =
  'id, username, created_at, last_login_at, password_hash';

/**
 * 管理者が発行したアカウントの一覧を取得する
 *
 * `username` を持つ行だけが対象。メールで登録した通常のユーザーは含めない
 * （admin が他人のアカウントを一覧できる必要はない）。
 *
 * @param supabase - service_role のクライアント
 * @param limit - 取得件数
 * @returns 新しい順のアカウント一覧
 */
export async function listIssuedAccounts(
  supabase: SupabaseClient,
  limit: number,
): Promise<IssuedAccount[]> {
  const { data, error } = await supabase
    .from('users')
    .select(ISSUED_ACCOUNT_SELECT)
    .not('username', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    hasPassword: Boolean(row.password_hash),
  }));
}

/**
 * 監査ログを記録する
 *
 * admin による発行・再発行は最も強い操作で、記録が無いと admin セッションを
 * 奪った攻撃者が静かにアカウントを乗っ取れて痕跡も残らない。
 *
 * ⚠️ 宛先メールアドレスは記録しない（保存しない方針を維持する）。
 *
 * 記録に失敗しても操作自体は止めない。ログのために機能を落とすと、
 * 「記録できないときは発行もできない」という別の運用リスクが生まれる。
 * 代わりに必ずログへ出し、検知できるようにする。
 */
async function recordAudit(
  supabase: SupabaseClient,
  actorUserId: string,
  targetUserId: string,
  action: AdminAuditAction,
): Promise<void> {
  const { error } = await supabase.from('admin_audit_logs').insert({
    actor_user_id: actorUserId,
    target_user_id: targetUserId,
    action,
  });

  if (error) {
    console.error(
      `[adminAudit] 記録に失敗しました action='${action}' target='${targetUserId}'`,
      error,
    );
  }
}

/** 発行したアカウント */
export interface CreatedAccount {
  userId: string;
  username: string;
}

/**
 * アカウントを発行する
 *
 * `password_hash` は null のまま作る。パスワードは本人が設定リンクから決める。
 * `is_verified` は true にする（`authorize` がメール未確認を弾くため。
 * admin が発行した時点で本人確認済みとみなす）。
 *
 * @param supabase - service_role のクライアント
 * @param actorUserId - 実行した admin
 * @returns 発行したアカウントのIDとユーザー名
 */
export async function createIssuedAccount(
  supabase: SupabaseClient,
  actorUserId: string,
): Promise<CreatedAccount> {
  const username = normalizeUsername(generateUsername());

  const { data, error } = await supabase
    .from('users')
    .insert({
      username,
      email: generateSyntheticEmail(),
      // パスワードは本人が設定リンクから決める
      password_hash: null,
      // admin が発行した時点で本人確認済みとみなす
      is_verified: true,
      role: USER_ROLE.USER,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw error ?? new Error('アカウントの作成に失敗しました');
  }

  await recordAudit(
    supabase,
    actorUserId,
    data.id,
    ADMIN_AUDIT_ACTION.ACCOUNT_CREATE,
  );

  return { userId: data.id, username };
}

/**
 * 再発行の対象として妥当なアカウントを取得する
 *
 * `username` を持つ行だけを返す。メールを持つ通常のアカウントは利用者自身が
 * パスワードリセットを使えるため、admin が差し替えられるようにすると
 * バックドアの範囲が全アカウントへ広がる。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象アカウント
 * @returns 対象のユーザー名。対象外なら null
 */
export async function findReissuableAccount(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('users')
    .select('username')
    .eq('id', userId)
    .not('username', 'is', null)
    .maybeSingle();

  return data?.username ?? null;
}

/**
 * 再発行の監査ログを記録する
 *
 * @param supabase - service_role のクライアント
 * @param actorUserId - 実行した admin
 * @param targetUserId - 対象アカウント
 */
export async function recordReissueAudit(
  supabase: SupabaseClient,
  actorUserId: string,
  targetUserId: string,
): Promise<void> {
  await recordAudit(
    supabase,
    actorUserId,
    targetUserId,
    ADMIN_AUDIT_ACTION.ACCOUNT_REISSUE,
  );
}
