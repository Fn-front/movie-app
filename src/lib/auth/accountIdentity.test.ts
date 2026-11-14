/**
 * @jest-environment node
 */

/**
 * 管理者発行アカウントの識別子（判定・正規化） テスト
 *
 * 生成側は `accountIdentityGenerator.test.ts`。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  isEmailIdentifier,
  isSyntheticEmail,
  isUsernameShape,
  normalizeUsername,
} from './accountIdentity';
import {
  generateSyntheticEmail,
  generateUsername,
} from './accountIdentityGenerator';
import {
  ACCOUNT_IDENTITY_ALPHABET,
  USERNAME_CONFIG,
} from '@/constants/accountIdentity';

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

/**
 * `isUsernameShape` はクライアントのバンドルに乗る関数のひとつ（`@/schema/auth`
 * 経由）だが、テストが1件も無かった。#1104 でファイルを分けるにあたって足す。
 */
describe('isUsernameShape', () => {
  it('生成したユーザー名を受け入れる', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(isUsernameShape(generateUsername())).toBe(true);
    }
  });

  it.each([
    ['K7M2QXPT9WFN', '区切り無し'],
    ['k7m2-qxpt-9wfn', '小文字'],
    ['K7M2 QXPT 9WFN', '空白区切り'],
  ])('%s（%s）を受け入れる', (value) => {
    expect(isUsernameShape(value)).toBe(true);
  });

  it.each([
    ['K7M2-QXPT-9WF', '1文字足りない'],
    ['K7M2-QXPT-9WFNN', '1文字多い'],
    ['', '空文字'],
  ])('%s（%s）を拒否する', (value) => {
    expect(isUsernameShape(value)).toBe(false);
  });

  // 紛らわしいので生成時に使っていない文字。入力されても受け入れない
  it.each(['O', 'I', 'L', 'U', 'V'])(
    '生成に使わない文字 %s を含むと拒否する',
    (char) => {
      const value = char.repeat(USERNAME_CONFIG.LENGTH);

      expect(value).toHaveLength(USERNAME_CONFIG.LENGTH);
      expect(isUsernameShape(value)).toBe(false);
    },
  );

  /*
    ログイン欄はメールと兼用。`@` を打ち忘れたアドレスが長さだけ合っても
    ユーザー名として通ってはいけない。

    ⚠️ **`@` 以外はすべて正規の文字にすること。** 2回踏んだ:

    1. `'user@exampl.c'`（13文字）→ 長さチェックで先に false になり、
       文字種チェックまで到達しない
    2. `'user@exam.co'`（12文字）→ 今度は `.` が弾いてしまう。
       実装を「`@` を許す」に改悪しても**テストは通ったまま**だった

    不正な文字が `@` ただ1つになるよう、文字集合から組み立てる。
  */
  it('@ を含む文字列を拒否する', () => {
    const value = `${ACCOUNT_IDENTITY_ALPHABET.slice(
      0,
      USERNAME_CONFIG.LENGTH - 1,
    )}@`;

    expect(value).toHaveLength(USERNAME_CONFIG.LENGTH);
    // `@` 以外に不正な文字が混ざっていないこと（混ざると検査が空振りする）
    expect(
      [...value].filter((char) => !ACCOUNT_IDENTITY_ALPHABET.includes(char)),
    ).toEqual(['@']);

    expect(isUsernameShape(value)).toBe(false);
  });
});

/**
 * ⚠️ **このファイルは `crypto` を import してはいけない**（#1104）
 *
 * `@/schema/auth` がここから `isEmailIdentifier` / `isUsernameShape` を読み、
 * その zod スキーマをログイン・新規登録・パスワード変更のフォーム
 * （クライアントコンポーネント）が import する。`crypto` が混ざると Next.js が
 * `crypto-browserify` ポリフィルを同梱し、その中の `eval` / `Function(...)` が
 * 本番の `script-src` に当たって enforce の違反を毎ロード報告する。
 *
 * **バンドルを見ないと分からない**ので、ソースの import を直接見て止める。
 * ブラウザ側の実測は `e2e/security/cspEval.spec.ts` が受け持つ。
 */
describe('クライアントのバンドルに乗る制約', () => {
  it('crypto を import していない', () => {
    const source = readFileSync(join(__dirname, 'accountIdentity.ts'), 'utf8');

    /*
      ⚠️ **行ごとに見ないこと。** シンボルが増えると Prettier が

          import {
            randomInt,
            randomBytes,
          } from 'crypto';

      と折り返す。行で分割すると `[^;]*` が改行を跨げず**素通りする**
      （実測でこの形は検出できなかった）。全文に `m` フラグで当てる。
    */
    const cryptoImports = [
      ...source.matchAll(/^\s*import[^;]*['"](?:node:)?crypto['"]/gm),
    ].map((m) => m[0].replace(/\s+/g, ' ').trim());

    expect(cryptoImports).toEqual([]);
  });

  it('生成側（crypto を読む）を import していない', () => {
    const source = readFileSync(join(__dirname, 'accountIdentity.ts'), 'utf8');

    expect(source).not.toMatch(/^\s*import[^;]*accountIdentityGenerator/m);
  });
});
