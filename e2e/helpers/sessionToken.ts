/**
 * E2E用 セッショントークンヘルパー（#1162）
 *
 * 「第2要素が未了（`totpPending`）」のセッションを作る。
 *
 * この状態になるのは **OAuth ＋ 二段階認証** の経路だけで、Credentials
 * ログインは `authorize` の中で第2要素まで検証するため通らない
 * （`src/lib/auth/auth.ts`）。実プロバイダの往復は E2E で回せないので、
 * NextAuth と同じ鍵・同じ salt でトークンを作って Cookie に差し込む。
 *
 * ⚠️ **製品コードにテスト用の抜け道は作らない。** 署名も暗号化も本物の
 * `AUTH_SECRET` で行い、サーバー側は通常のセッションとして扱う。
 * TOTP コードを DB の共有鍵から計算する `helpers/totp.ts` と同じ考え方。
 */

import { encode } from 'next-auth/jwt';
import type { BrowserContext, Cookie } from '@playwright/test';

/**
 * セッションCookieの名前
 *
 * `src/lib/auth/auth.ts` の `cookies.sessionToken.name` が
 * `NODE_ENV === 'production'` で切り替える。CI は `npm start`（production）、
 * ローカルは `npm run dev` なので**両方ありうる**。
 *
 * ⚠️ テストプロセスの `NODE_ENV` は**サーバーのそれとは別物**なので、
 * こちら側で判定してはいけない。実際にログインして入った Cookie から
 * 名前を取る（`resolveSessionCookie`）。
 */
const SESSION_COOKIE_NAMES = [
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
] as const;

/**
 * ログイン済みのコンテキストからセッションCookieを取り出す
 *
 * URL で絞らずに全件から探す。baseURL のポートを前提にすると、別ポートで
 * 流すための一時 config を作ったときに黙って見つからなくなる。
 *
 * @param context - ブラウザコンテキスト
 * @returns セッションCookie
 * @throws ログインしていない場合
 */
export async function resolveSessionCookie(
  context: BrowserContext,
): Promise<Cookie> {
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((cookie) =>
    (SESSION_COOKIE_NAMES as readonly string[]).includes(cookie.name),
  );

  if (!sessionCookie) {
    throw new Error(
      `セッションCookieが見つかりません。先にログインしてください（探した名前: ${SESSION_COOKIE_NAMES.join(' / ')}）`,
    );
  }

  return sessionCookie;
}

/** `totpPending` セッションに入れる利用者の情報 */
export interface PendingSessionUser {
  id: string;
  email: string;
  name?: string | null;
  role?: string;
}

/**
 * 第2要素が未了のセッションに差し替える
 *
 * 既存のセッションCookieと**同じ名前・同じ属性**のまま値だけ入れ替える。
 * `__Secure-` 接頭辞や `sameSite` を自前で組み立てると環境差で落ちるため。
 *
 * @param context - ブラウザコンテキスト（ログイン済みであること）
 * @param user - セッションの持ち主
 */
export async function seedTotpPendingSession(
  context: BrowserContext,
  user: PendingSessionUser,
): Promise<void> {
  // ⚠️ 名前が環境で違う。CI は両方を同じ値で渡しているが（`e2e.yml:163-164`）、
  // `.env.local` には `NEXTAUTH_SECRET` しか無い。NextAuth v5 自身も
  // 両方を見るので、こちらも揃えておく
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      'AUTH_SECRET / NEXTAUTH_SECRET が未設定です（.env.local / CI の env）',
    );
  }

  const sessionCookie = await resolveSessionCookie(context);
  const now = Date.now();

  const value = await encode({
    // salt は Cookie 名と一致させる必要がある（@auth/core の仕様）
    salt: sessionCookie.name,
    secret,
    token: {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      picture: null,
      role: user.role ?? 'user',
      hasPassword: true,
      passwordChangedAt: null,
      // 絶対有効期限（7日）の起点。古いと jwt コールバックが invalidated にする
      issuedAt: now,
      // パスワード変更の確認（5分間隔）を直後に走らせない。
      // 走らせても害は無いが、DB往復が増えて不安定になる
      lastPasswordCheck: now,
      lastLoginUpdate: now,
      // ここが本題
      totpPending: true,
    },
  });

  await context.addCookies([{ ...sessionCookie, value }]);
}
