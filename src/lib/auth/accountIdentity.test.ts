/**
 * @jest-environment node
 */

/**
 * 管理者発行アカウントの識別子 テスト
 */

import {
  generateSyntheticEmail,
  generateUsername,
  isEmailIdentifier,
  isSyntheticEmail,
  normalizeUsername,
} from './accountIdentity';
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

describe('normalizeUsername', () => {
  it.each([
    ['k7m2-qxpt-9wfn', 'K7M2QXPT9WFN'],
    ['K7M2-QXPT-9WFN', 'K7M2QXPT9WFN'],
    ['K7M2 QXPT 9WFN', 'K7M2QXPT9WFN'],
    ['  K7M2qxpt9WFN  ', '  K7M2QXPT9WFN  '.trim()],
  ])('%s を %s に畳む', (input, expected) => {
    expect(normalizeUsername(input)).toBe(expected);
  });

  it('保存時と照合時で同じ値になる', () => {
    const username = generateUsername();

    expect(normalizeUsername(username.toLowerCase())).toBe(
      normalizeUsername(username),
    );
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

describe('isSyntheticEmail', () => {
  it('生成した合成アドレスを判別する', () => {
    expect(isSyntheticEmail(generateSyntheticEmail())).toBe(true);
  });

  it.each([
    'user@example.com',
    'user@example.co.jp',
    'invalid@example.com',
    'user@notinvalid.com',
  ])('通常のアドレス %s は false', (email) => {
    expect(isSyntheticEmail(email)).toBe(false);
  });

  it('大文字で来ても判別する', () => {
    expect(isSyntheticEmail('ABC@DEF.INVALID')).toBe(true);
  });
});

describe('isEmailIdentifier', () => {
  it.each(['user@example.com', 'a@b.invalid'])('%s はメール', (value) => {
    expect(isEmailIdentifier(value)).toBe(true);
  });

  it.each(['K7M2-QXPT-9WFN', 'K7M2QXPT9WFN', 'k7m2-qxpt-9wfn'])(
    '%s はユーザー名',
    (value) => {
      expect(isEmailIdentifier(value)).toBe(false);
    },
  );

  // 生成したユーザー名が常にユーザー名側へ振り分けられること
  it('生成したユーザー名をメールと誤判定しない', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(isEmailIdentifier(generateUsername())).toBe(false);
    }
  });

  // 生成した合成アドレスが常にメール側へ振り分けられること
  it('生成した合成アドレスをユーザー名と誤判定しない', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(isEmailIdentifier(generateSyntheticEmail())).toBe(true);
    }
  });
});
