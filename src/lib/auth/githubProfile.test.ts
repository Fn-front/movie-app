/**
 * GitHub OAuth プロフィール取得のテスト
 *
 * 未検証メールによるアカウント乗っ取りを防げているかを中心に検証する。
 */

import {
  selectVerifiedEmail,
  fetchVerifiedGitHubProfile,
} from './githubProfile';

describe('selectVerifiedEmail', () => {
  it('公開メールが検証済みならそれを採用する（既定の挙動を変えない）', () => {
    const result = selectVerifiedEmail('public@example.com', [
      { email: 'public@example.com', primary: false, verified: true },
      { email: 'primary@example.com', primary: true, verified: true },
    ]);

    expect(result).toBe('public@example.com');
  });

  it('公開メールが未検証なら採用しない', () => {
    const result = selectVerifiedEmail('unverified@example.com', [
      { email: 'unverified@example.com', primary: false, verified: false },
      { email: 'primary@example.com', primary: true, verified: true },
    ]);

    expect(result).toBe('primary@example.com');
  });

  it('公開メールが無い場合は primary かつ検証済みを採用する', () => {
    const result = selectVerifiedEmail(null, [
      { email: 'other@example.com', primary: false, verified: true },
      { email: 'primary@example.com', primary: true, verified: true },
    ]);

    expect(result).toBe('primary@example.com');
  });

  it('primary が未検証なら採用せず、他の検証済みメールを使う', () => {
    const result = selectVerifiedEmail(null, [
      { email: 'victim@example.com', primary: true, verified: false },
      { email: 'own@example.com', primary: false, verified: true },
    ]);

    expect(result).toBe('own@example.com');
  });

  it('検証済みメールが1件も無ければ null を返す（乗っ取りの封鎖）', () => {
    const result = selectVerifiedEmail('victim@example.com', [
      { email: 'victim@example.com', primary: true, verified: false },
      { email: 'another@example.com', primary: false, verified: false },
    ]);

    expect(result).toBeNull();
  });

  it('メール一覧が空なら null を返す', () => {
    expect(selectVerifiedEmail(null, [])).toBeNull();
  });

  it('公開メールの大文字小文字が一覧と異なっても一致とみなす', () => {
    const result = selectVerifiedEmail('Public@Example.com', [
      { email: 'public@example.com', primary: true, verified: true },
    ]);

    expect(result).toBe('public@example.com');
  });
});

describe('fetchVerifiedGitHubProfile', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  /** /user と /user/emails のレスポンスを順に返すモックを組む */
  function mockGitHubApi(
    profile: unknown,
    emails: unknown,
    options: { profileOk?: boolean; emailsOk?: boolean } = {},
  ) {
    const { profileOk = true, emailsOk = true } = options;

    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/user/emails')) {
        return Promise.resolve({
          ok: emailsOk,
          json: () => Promise.resolve(emails),
        } as Response);
      }

      return Promise.resolve({
        ok: profileOk,
        json: () => Promise.resolve(profile),
      } as Response);
    }) as unknown as typeof global.fetch;
  }

  it('検証済みメールを持つ場合、email と email_verified: true を返す', async () => {
    mockGitHubApi({ id: 1, login: 'octocat', email: null }, [
      { email: 'octocat@example.com', primary: true, verified: true },
    ]);

    const result = await fetchVerifiedGitHubProfile('token');

    expect(result.email).toBe('octocat@example.com');
    expect(result.email_verified).toBe(true);
  });

  it('未検証メールしか無い場合、email: null / email_verified: false を返す', async () => {
    mockGitHubApi({ id: 1, login: 'attacker', email: 'victim@example.com' }, [
      { email: 'victim@example.com', primary: true, verified: false },
    ]);

    const result = await fetchVerifiedGitHubProfile('token');

    expect(result.email).toBeNull();
    expect(result.email_verified).toBe(false);
  });

  it('公開メールが未検証でも、検証せずに採用しない', async () => {
    mockGitHubApi({ id: 1, login: 'attacker', email: 'victim@example.com' }, [
      { email: 'victim@example.com', primary: false, verified: false },
      { email: 'attacker@example.com', primary: true, verified: true },
    ]);

    const result = await fetchVerifiedGitHubProfile('token');

    expect(result.email).toBe('attacker@example.com');
    expect(result.email_verified).toBe(true);
  });

  it('/user/emails の取得に失敗した場合は fail-closed で拒否する', async () => {
    mockGitHubApi(
      { id: 1, login: 'octocat', email: 'octocat@example.com' },
      null,
      { emailsOk: false },
    );

    const result = await fetchVerifiedGitHubProfile('token');

    expect(result.email).toBeNull();
    expect(result.email_verified).toBe(false);
  });

  it('/user の取得に失敗した場合は例外を投げる', async () => {
    mockGitHubApi(null, [], { profileOk: false });

    await expect(fetchVerifiedGitHubProfile('token')).rejects.toThrow(
      'Failed to fetch GitHub profile',
    );
  });

  it('プロフィールの他フィールドは保持する', async () => {
    mockGitHubApi(
      { id: 1, login: 'octocat', name: 'Octo', avatar_url: 'https://a/b.png' },
      [{ email: 'octocat@example.com', primary: true, verified: true }],
    );

    const result = await fetchVerifiedGitHubProfile('token');

    expect(result.login).toBe('octocat');
    expect(result.name).toBe('Octo');
    expect(result.avatar_url).toBe('https://a/b.png');
  });
});
