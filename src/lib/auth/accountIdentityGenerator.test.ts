/**
 * @jest-environment node
 */

/**
 * 管理者発行アカウントの識別子（生成） テスト
 *
 * 判定側は `accountIdentity.test.ts`。**分けてあるのは意図的**で、
 * こちらだけが `crypto` を読む（#1104）。
 */

import { normalizeUsername } from './accountIdentity';
import {
  generateSyntheticEmail,
  generateUsername,
} from './accountIdentityGenerator';
import {
  ACCOUNT_IDENTITY_ALPHABET,
  USERNAME_CONFIG,
} from '@/constants/accountIdentity';

describe('generateUsername', () => {
  it('XXXX-XXXX-XXXX 形式で返す', () => {
    expect(generateUsername()).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('区切りを除くと設定どおりの文字数になる', () => {
    expect(normalizeUsername(generateUsername())).toHaveLength(
      USERNAME_CONFIG.LENGTH,
    );
  });

  // 読み違えやすい文字（0/O、1/I/L、U/V）が混ざると、メールで受け取った
  // 利用者が打ち間違える
  it('紛らわしい文字を含まない', () => {
    const generated = Array.from({ length: 50 }, generateUsername).join('');

    for (const char of normalizeUsername(generated)) {
      expect(ACCOUNT_IDENTITY_ALPHABET).toContain(char);
    }
  });

  // ログインフォームは `@` の有無でメールと振り分けるため、含まれると壊れる
  it('@ を含まない', () => {
    const generated = Array.from({ length: 50 }, generateUsername).join('');

    expect(generated).not.toContain('@');
  });

  it('呼ぶたびに異なる値を返す', () => {
    const values = new Set(Array.from({ length: 200 }, generateUsername));

    expect(values.size).toBe(200);
  });
});

describe('generateSyntheticEmail', () => {
  it('予約TLD .invalid を使う', () => {
    expect(generateSyntheticEmail()).toMatch(/\.invalid$/);
  });

  it('ローカル部とサブドメインの両方がランダムになる', () => {
    const emails = Array.from({ length: 50 }, generateSyntheticEmail);
    const localParts = new Set(emails.map((e) => e.split('@')[0]));
    const domains = new Set(emails.map((e) => e.split('@')[1]));

    expect(localParts.size).toBe(50);
    expect(domains.size).toBe(50);
  });

  it('小文字で返す（users.email の lower 索引と整合させる）', () => {
    const email = generateSyntheticEmail();

    expect(email).toBe(email.toLowerCase());
  });

  it('メールアドレスとして妥当な形をしている', () => {
    expect(generateSyntheticEmail()).toMatch(/^[a-z0-9]+@[a-z0-9]+\.invalid$/);
  });
});
