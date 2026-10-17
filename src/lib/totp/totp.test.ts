import { TOTP_CONFIG } from '@/constants/totp';

import { base32Encode } from './base32';
import { findMatchingCounter, generateTotpCode, verifyTotpCode } from './totp';

/**
 * RFC 4226 / RFC 6238 のテストベクタで使われる共有鍵。
 * ASCII の "12345678901234567890"（20バイト）。
 */
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

/** 任意の別の鍵（鍵が違えばコードも違うことの確認用） */
const OTHER_SECRET = base32Encode(Buffer.from('09876543210987654321', 'ascii'));

/** カウンタ値から、そのステップの中央にあたる時刻を得る */
const counterToMs = (counter: number): number =>
  (counter * TOTP_CONFIG.STEP_SECONDS + TOTP_CONFIG.STEP_SECONDS / 2) * 1000;

describe('generateTotpCode', () => {
  describe('RFC 4226 Appendix D のテストベクタ（HOTP）', () => {
    // 時刻をカウンタ値そのものに対応させて HOTP の値を検証する
    it.each([
      [0, '755224'],
      [1, '287082'],
      [2, '359152'],
      [3, '969429'],
      [4, '338314'],
      [5, '254676'],
      [6, '287922'],
      [7, '162583'],
      [8, '399871'],
      [9, '520489'],
    ])('counter=%i のとき %s', (counter, expected) => {
      expect(generateTotpCode(RFC_SECRET, counterToMs(counter))).toBe(expected);
    });
  });

  describe('RFC 6238 Appendix B のテストベクタ（TOTP / SHA-1）', () => {
    // RFC の表は8桁。本実装は6桁固定（= 10^6 の剰余）なので下6桁と比較する
    it.each([
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ])('T=%i のとき %s の下6桁', (unixSeconds, eightDigits) => {
      expect(generateTotpCode(RFC_SECRET, unixSeconds * 1000)).toBe(
        eightDigits.slice(-TOTP_CONFIG.DIGITS),
      );
    });
  });

  it('同じ時間ステップ内では同じコードを返す', () => {
    // ステップの先頭に揃えてから、同じステップの末尾と比較する
    const stepStartMs =
      Math.floor(1_700_000_000 / TOTP_CONFIG.STEP_SECONDS) *
      TOTP_CONFIG.STEP_SECONDS *
      1000;
    const stepEndMs = stepStartMs + (TOTP_CONFIG.STEP_SECONDS - 1) * 1000;

    expect(generateTotpCode(RFC_SECRET, stepStartMs)).toBe(
      generateTotpCode(RFC_SECRET, stepEndMs),
    );
  });

  it('時間ステップをまたぐとコードが変わる', () => {
    const baseMs = 1_700_000_000 * 1000;
    const nextStepMs = baseMs + TOTP_CONFIG.STEP_SECONDS * 1000;

    expect(generateTotpCode(RFC_SECRET, baseMs)).not.toBe(
      generateTotpCode(RFC_SECRET, nextStepMs),
    );
  });

  it('鍵が違えばコードも変わる', () => {
    const atMs = 1_700_000_000 * 1000;

    expect(generateTotpCode(RFC_SECRET, atMs)).not.toBe(
      generateTotpCode(OTHER_SECRET, atMs),
    );
  });

  it('常に設定どおりの桁数になる（先頭が0でも切り詰めない）', () => {
    // 先頭0が落ちると認証アプリの表示と食い違うため、多数のステップで確認する
    for (let counter = 0; counter < 300; counter++) {
      expect(generateTotpCode(RFC_SECRET, counterToMs(counter))).toMatch(
        new RegExp(`^\\d{${TOTP_CONFIG.DIGITS}}$`),
      );
    }
  });

  it('引数を省略すると現在時刻のコードを返す', () => {
    const nowMs = 1_700_000_000 * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(nowMs);

    expect(generateTotpCode(RFC_SECRET)).toBe(
      generateTotpCode(RFC_SECRET, nowMs),
    );

    jest.restoreAllMocks();
  });
});

describe('verifyTotpCode', () => {
  const atMs = 1_700_000_000 * 1000;

  it('その時刻のコードを受け付ける', () => {
    expect(
      verifyTotpCode(generateTotpCode(RFC_SECRET, atMs), RFC_SECRET, atMs),
    ).toBe(true);
  });

  it('1つ前のステップのコードを受け付ける（端末の時計が遅れている場合）', () => {
    const previousCode = generateTotpCode(
      RFC_SECRET,
      atMs - TOTP_CONFIG.STEP_SECONDS * 1000,
    );

    expect(verifyTotpCode(previousCode, RFC_SECRET, atMs)).toBe(true);
  });

  it('1つ先のステップのコードを受け付ける（端末の時計が進んでいる場合）', () => {
    const nextCode = generateTotpCode(
      RFC_SECRET,
      atMs + TOTP_CONFIG.STEP_SECONDS * 1000,
    );

    expect(verifyTotpCode(nextCode, RFC_SECRET, atMs)).toBe(true);
  });

  it('許容範囲を超えて古いコードは拒否する', () => {
    const tooOldCode = generateTotpCode(
      RFC_SECRET,
      atMs - (TOTP_CONFIG.WINDOW + 1) * TOTP_CONFIG.STEP_SECONDS * 1000,
    );

    expect(verifyTotpCode(tooOldCode, RFC_SECRET, atMs)).toBe(false);
  });

  it('許容範囲を超えて新しいコードは拒否する', () => {
    const tooNewCode = generateTotpCode(
      RFC_SECRET,
      atMs + (TOTP_CONFIG.WINDOW + 1) * TOTP_CONFIG.STEP_SECONDS * 1000,
    );

    expect(verifyTotpCode(tooNewCode, RFC_SECRET, atMs)).toBe(false);
  });

  it('別の鍵で生成されたコードは拒否する', () => {
    const otherCode = generateTotpCode(OTHER_SECRET, atMs);

    expect(verifyTotpCode(otherCode, RFC_SECRET, atMs)).toBe(false);
  });

  it.each([
    ['空文字', ''],
    ['桁数が足りない', '12345'],
    ['桁数が多い', '1234567'],
    ['数字以外を含む', '12345a'],
    ['空白を含む', '123 45'],
    ['全角数字', '１２３４５６'],
  ])('形式が不正なコードを拒否する: %s', (_label, code) => {
    expect(verifyTotpCode(code, RFC_SECRET, atMs)).toBe(false);
  });

  it('Unix エポック直後でも例外にならない（カウンタが負にならない）', () => {
    expect(verifyTotpCode('000000', RFC_SECRET, 0)).toBe(false);
    expect(() => verifyTotpCode('000000', RFC_SECRET, 0)).not.toThrow();
  });

  it('引数を省略すると現在時刻で検証する', () => {
    const nowMs = 1_700_000_000 * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(nowMs);

    expect(
      verifyTotpCode(generateTotpCode(RFC_SECRET, nowMs), RFC_SECRET),
    ).toBe(true);

    jest.restoreAllMocks();
  });
});

describe('findMatchingCounter', () => {
  const atMs = 1_700_000_000 * 1000;
  const currentCounter = Math.floor(atMs / 1000 / TOTP_CONFIG.STEP_SECONDS);

  it('一致したステップのカウンタ値を返す', () => {
    expect(
      findMatchingCounter(generateTotpCode(RFC_SECRET, atMs), RFC_SECRET, atMs),
    ).toBe(currentCounter);
  });

  it('1つ前のステップで一致した場合はそのカウンタ値を返す', () => {
    const previousCode = generateTotpCode(
      RFC_SECRET,
      atMs - TOTP_CONFIG.STEP_SECONDS * 1000,
    );

    expect(findMatchingCounter(previousCode, RFC_SECRET, atMs)).toBe(
      currentCounter - 1,
    );
  });

  it('1つ先のステップで一致した場合はそのカウンタ値を返す', () => {
    const nextCode = generateTotpCode(
      RFC_SECRET,
      atMs + TOTP_CONFIG.STEP_SECONDS * 1000,
    );

    expect(findMatchingCounter(nextCode, RFC_SECRET, atMs)).toBe(
      currentCounter + 1,
    );
  });

  it('一致しなければ null を返す', () => {
    expect(findMatchingCounter('000000', OTHER_SECRET, atMs)).toBeNull();
  });

  it('形式が不正なら null を返す', () => {
    expect(findMatchingCounter('abc', RFC_SECRET, atMs)).toBeNull();
  });

  it('引数を省略すると現在時刻で照合する', () => {
    jest.spyOn(Date, 'now').mockReturnValue(atMs);

    expect(
      findMatchingCounter(generateTotpCode(RFC_SECRET, atMs), RFC_SECRET),
    ).toBe(currentCounter);

    jest.restoreAllMocks();
  });

  it('返したカウンタ値で使い回しを検出できる', () => {
    // 同じコードを2回出しても、同じカウンタ値が返るので再利用と判定できる
    const code = generateTotpCode(RFC_SECRET, atMs);
    const first = findMatchingCounter(code, RFC_SECRET, atMs);
    const second = findMatchingCounter(code, RFC_SECRET, atMs);

    expect(second).toBe(first);
  });
});
