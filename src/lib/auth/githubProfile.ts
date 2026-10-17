/**
 * GitHub OAuth プロフィール取得（検証済みメールのみ採用）
 *
 * `@auth/core` の既定実装は、GitHub プロフィールに公開メールが無いときだけ
 * `/user/emails` を引き、`emails.find((e) => e.primary) ?? emails[0]` で
 * **検証状態を見ずに**メールアドレスを決めている。
 *
 * GitHub は未検証のメールアドレスをアカウントに保持でき、それが `/user/emails` にも
 * 含まれる。本アプリの signIn コールバックはメール一致で既存アカウントへリンクする
 * ため、未検証メールを信用すると「攻撃者が自分の GitHub に被害者のメールを追加して
 * ログインする」だけでアカウントを乗っ取れてしまう。
 *
 * そこで userinfo を差し替え、`verified: true` のメールしか採用しない。該当が無い
 * 場合は `email: null` / `email_verified: false` を返し、signIn 側でログインを拒否する。
 */

const GITHUB_API_BASE_URL = 'https://api.github.com';

/** `/user/emails` のレスポンス要素 */
interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/** signIn コールバックが参照する正規化済みプロフィール */
export interface VerifiedGitHubProfile extends Record<string, unknown> {
  email: string | null;
  email_verified: boolean;
}

function buildHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'authjs',
  };
}

/**
 * 採用するメールアドレスを決める
 *
 * 公開メールが検証済みならそれを優先する（既定実装と同じアカウントにリンクされ、
 * 正当な利用者の体験を変えないため）。そうでなければ primary かつ検証済み、
 * 最後に任意の検証済みメールを使う。
 *
 * @param publicEmail - `/user` が返したメールアドレス（未設定なら null）
 * @param emails - `/user/emails` の一覧
 * @returns 検証済みのメールアドレス。該当が無ければ null
 */
export function selectVerifiedEmail(
  publicEmail: string | null,
  emails: GitHubEmail[],
): string | null {
  const verifiedEmails = emails.filter((entry) => entry.verified);

  if (publicEmail) {
    const normalized = publicEmail.toLowerCase();
    const matched = verifiedEmails.find(
      (entry) => entry.email.toLowerCase() === normalized,
    );

    if (matched) {
      return matched.email;
    }
  }

  const primary = verifiedEmails.find((entry) => entry.primary);

  return primary?.email ?? verifiedEmails[0]?.email ?? null;
}

/**
 * GitHub のユーザー情報を取得し、検証済みメールのみを持つプロフィールを返す
 *
 * `/user/emails` の取得に失敗した場合は検証済みメールを確認できないため、
 * fail-closed で `email_verified: false` を返す（ログインは拒否される）。
 *
 * @param accessToken - OAuth アクセストークン
 * @returns 正規化済みプロフィール
 */
export async function fetchVerifiedGitHubProfile(
  accessToken: string,
): Promise<VerifiedGitHubProfile> {
  const headers = buildHeaders(accessToken);

  const [profileResponse, emailsResponse] = await Promise.all([
    fetch(`${GITHUB_API_BASE_URL}/user`, { headers }),
    fetch(`${GITHUB_API_BASE_URL}/user/emails`, { headers }),
  ]);

  if (!profileResponse.ok) {
    throw new Error('Failed to fetch GitHub profile');
  }

  const profile = (await profileResponse.json()) as Record<string, unknown>;

  const emails: GitHubEmail[] = emailsResponse.ok
    ? ((await emailsResponse.json()) as GitHubEmail[])
    : [];

  const publicEmail =
    typeof profile.email === 'string' && profile.email ? profile.email : null;

  const verifiedEmail = selectVerifiedEmail(publicEmail, emails);

  return {
    ...profile,
    email: verifiedEmail,
    email_verified: verifiedEmail !== null,
  };
}
