/**
 * @jest-environment node
 */

/**
 * ログイン試行のレート制限識別子のテスト（#644）
 */

import { buildLoginIdentifier } from './loginIdentifier';

describe('buildLoginIdentifier', () => {
  it('メールアドレスと送信元IPを組み合わせる', () => {
    expect(buildLoginIdentifier('user@example.com', '203.0.113.1')).toBe(
      'user@example.com|203.0.113.1',
    );
  });

  it('同じアカウントでも送信元が違えば別の識別子になる（締め出しの防止）', () => {
    const victim = buildLoginIdentifier('user@example.com', '203.0.113.1');
    const attacker = buildLoginIdentifier('user@example.com', '198.51.100.9');

    expect(victim).not.toBe(attacker);
  });

  it('同じ送信元でもアカウントが違えば別の識別子になる', () => {
    expect(buildLoginIdentifier('a@example.com', '203.0.113.1')).not.toBe(
      buildLoginIdentifier('b@example.com', '203.0.113.1'),
    );
  });

  it('同じアカウント・同じ送信元なら同じ識別子になる（カウントが累積する）', () => {
    expect(buildLoginIdentifier('user@example.com', '203.0.113.1')).toBe(
      buildLoginIdentifier('user@example.com', '203.0.113.1'),
    );
  });

  describe('送信元が特定できない場合', () => {
    it("'unknown' のときはメールアドレス単独にフォールバックする", () => {
      expect(buildLoginIdentifier('user@example.com', 'unknown')).toBe(
        'user@example.com',
      );
    });

    it('空文字のときもメールアドレス単独にフォールバックする', () => {
      expect(buildLoginIdentifier('user@example.com', '')).toBe(
        'user@example.com',
      );
    });

    it('フォールバック時、全員が同じ識別子を共有しない（メールで分かれる）', () => {
      expect(buildLoginIdentifier('a@example.com', 'unknown')).not.toBe(
        buildLoginIdentifier('b@example.com', 'unknown'),
      );
    });
  });

  it('IPv6 でも組み立てられる', () => {
    expect(buildLoginIdentifier('user@example.com', '2001:db8::1')).toBe(
      'user@example.com|2001:db8::1',
    );
  });
});
