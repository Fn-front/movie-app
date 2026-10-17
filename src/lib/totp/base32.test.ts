import { randomBytes } from 'crypto';

import { base32Decode, base32Encode } from './base32';

/**
 * RFC 4648 Section 10 のテストベクタ。
 * RFC はパディング付きで示しているが、本実装はパディングを付けない方針のため
 * `=` を除いた形を期待値にしている。
 */
const RFC_VECTORS: ReadonlyArray<readonly [string, string]> = [
  ['', ''],
  ['f', 'MY'],
  ['fo', 'MZXQ'],
  ['foo', 'MZXW6'],
  ['foob', 'MZXW6YQ'],
  ['fooba', 'MZXW6YTB'],
  ['foobar', 'MZXW6YTBOI'],
];

describe('base32Encode', () => {
  it.each(RFC_VECTORS)(
    'RFC 4648 のテストベクタ: "%s" → "%s"',
    (input, expected) => {
      expect(base32Encode(Buffer.from(input, 'ascii'))).toBe(expected);
    },
  );

  it('アルファベット外の文字を出力しない', () => {
    expect(base32Encode(randomBytes(64))).toMatch(/^[A-Z2-7]*$/);
  });

  it('パディングを付けない', () => {
    // 5バイト境界に満たない長さでも `=` を足さない
    expect(base32Encode(Buffer.from('f', 'ascii'))).not.toContain('=');
  });
});

describe('base32Decode', () => {
  it.each(RFC_VECTORS)(
    'RFC 4648 のテストベクタを逆方向に復元する: "%s" ← "%s"',
    (expected, encoded) => {
      expect(base32Decode(encoded).toString('ascii')).toBe(expected);
    },
  );

  it('小文字を受け付ける', () => {
    expect(base32Decode('mzxw6ytboi').toString('ascii')).toBe('foobar');
  });

  it('パディング付きの文字列を受け付ける', () => {
    // 他のツールが出力した `=` 付きの鍵を貼られても読めるようにする
    expect(base32Decode('MZXW6YTBOI======').toString('ascii')).toBe('foobar');
  });

  it('空白を無視する', () => {
    // 認証アプリは読みやすさのため4文字ごとに区切って表示することがある
    expect(base32Decode('MZXW 6YTB OI').toString('ascii')).toBe('foobar');
  });

  it.each([
    ['アルファベット外の数字', 'MZXW0YTB'],
    ['記号', 'MZXW6YTB!'],
    ['非ASCII', 'MZXW6YTBあ'],
  ])('不正な文字を含む場合は例外を投げる: %s', (_label, encoded) => {
    expect(() => base32Decode(encoded)).toThrow('Invalid base32 character');
  });

  it('エンコードして戻すと元のバイト列に一致する', () => {
    // 端数ビットの扱いを誤ると特定の長さだけ壊れるため、1〜40バイトを全て試す
    for (let length = 1; length <= 40; length++) {
      const original = randomBytes(length);

      expect(base32Decode(base32Encode(original))).toEqual(original);
    }
  });
});
