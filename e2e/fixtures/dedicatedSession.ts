/**
 * spec 専用ユーザーのセッション（#806）
 *
 * 共有の `TEST_USER` は、ウォッチリストや user_id 単位のレート制限カウンタを
 * 全 spec が共有する。`cleanupWatchlistForUser()` のような「そのユーザーの全件削除」を
 * 複数の spec が呼ぶと、`fullyParallel` で別ワーカーに分散したときに互いの
 * レコードを消し合う。`describe.configure({ mode: 'serial' })` はファイル内の
 * 直列化しかせず、ファイル間の並列は防げない。
 *
 * 自分のデータを占有したい spec は、共有ユーザーではなく専用ユーザーを作って
 * 完結させる（#750 で二段階認証の spec に導入したやり方）。
 */

import type { Browser, Page } from '@playwright/test';

import {
  cleanupLoginIpRateLimits,
  cleanupRateLimitsForUser,
  createVerifiedUser,
  deleteUserByEmail,
  type DedicatedUser,
} from '../helpers/dedicatedUser';

import { performLogin } from './auth';

/** 専用ユーザーでログイン済みのセッション */
export interface DedicatedSession {
  /** ログイン済みのページ。spec 全体で使い回す */
  page: Page;
  /** 作成したユーザーのID（user_id 単位の後片付けに使う） */
  userId: string;
  /** ページ・レート制限カウンタ・ユーザーをまとめて片付ける */
  close: () => Promise<void>;
}

/**
 * 専用ユーザーを作ってログイン済みのページを返す
 *
 * ログインは1回で済ませたいので、呼び出し側は `beforeAll` で開き、spec 全体で
 * 1つのページを使い回す。ユーザー作成（bcrypt）と初回アクセスのコンパイル待ちは
 * 既定の30秒に収まらないため、呼び出し側で `testInfo.setTimeout()` を伸ばすこと。
 *
 * @param browser - `beforeAll` が受け取る browser
 * @param user - 作成する専用ユーザー。メールは `runScopedEmail()` で作る
 */
export async function openDedicatedSession(
  browser: Browser,
  user: DedicatedUser,
): Promise<DedicatedSession> {
  const userId = await createVerifiedUser(user);

  // 送信元IP単位のログイン上限（20回/15分）は同じ run の全 spec で共有される
  await cleanupLoginIpRateLimits();

  // browser.newContext は config の use を引き継ぐ（baseURL はそれでよいが、
  // storageState まで入ると共有テストユーザーでログイン済みになってしまう）
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await performLogin(page, user);

  return {
    page,
    userId,
    close: async () => {
      await context.close();
      // rate_limits は user_id を持たず連鎖削除されないため個別に消す
      await cleanupRateLimitsForUser(userId);
      // ウォッチリスト等は ON DELETE CASCADE で連鎖削除される
      await deleteUserByEmail(user.email);
    },
  };
}
