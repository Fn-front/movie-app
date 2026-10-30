/**
 * 管理者発行アカウント API クライアント
 */

import { API_ENDPOINTS } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';

/** 一覧に表示するアカウント */
export interface IssuedAccount {
  id: string;
  username: string;
  createdAt: string;
  lastLoginAt: string | null;
  /** パスワードを設定済みか（未設定＝設定リンクがまだ使われていない） */
  hasPassword: boolean;
}

interface ListResponse {
  success: true;
  data: { accounts: IssuedAccount[] };
}

interface CreateResponse {
  success: true;
  message: string;
  data: { username: string };
}

/**
 * 発行済みアカウントの一覧を取得する
 */
export async function fetchIssuedAccounts(): Promise<IssuedAccount[]> {
  const { data } = await axiosInstance.get<ListResponse>(
    API_ENDPOINTS.ADMIN_ACCOUNTS,
  );
  return data.data.accounts;
}

/**
 * アカウントを発行し、設定リンクを送信する
 *
 * @param email - 送信先（DBには保存されない）
 * @returns 発行したアカウント名
 */
export async function createIssuedAccount(email: string): Promise<string> {
  const { data } = await axiosInstance.post<CreateResponse>(
    API_ENDPOINTS.ADMIN_ACCOUNTS,
    { email },
  );
  return data.data.username;
}

/**
 * パスワード設定リンクを再送する
 *
 * @param id - 対象アカウントのID
 * @param email - 送信先（DBには保存されない）
 */
export async function reissueAccountLink(
  id: string,
  email: string,
): Promise<void> {
  await axiosInstance.post(API_ENDPOINTS.ADMIN_ACCOUNT_REISSUE(id), { email });
}
