import { normalizeEmail } from './email';

describe('normalizeEmail', () => {
  it('大文字を小文字に揃える', () => {
    expect(normalizeEmail('Victim@Example.COM')).toBe('victim@example.com');
  });

  it('前後の空白を落とす', () => {
    expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com');
  });

  it('空白と大小文字を同時に正規化する', () => {
    expect(normalizeEmail('\tUser@Example.com\n')).toBe('user@example.com');
  });

  it('既に正規化済みの値は変化しない', () => {
    expect(normalizeEmail('user@example.com')).toBe('user@example.com');
  });

  it('大小文字だけが異なる表記は同じ値に収束する', () => {
    const variants = [
      'victim@gmail.com',
      'Victim@gmail.com',
      'vIcTiM@GMAIL.com',
      'VICTIM@GMAIL.COM',
    ];
    const normalized = new Set(variants.map(normalizeEmail));
    expect(normalized.size).toBe(1);
  });

  it('ドット違いは別アドレスのまま残す（プロバイダ固有の正規化はしない）', () => {
    expect(normalizeEmail('v.ictim@gmail.com')).toBe('v.ictim@gmail.com');
    expect(normalizeEmail('v.ictim@gmail.com')).not.toBe(
      normalizeEmail('victim@gmail.com'),
    );
  });

  it('プラスエイリアスも別アドレスのまま残す', () => {
    expect(normalizeEmail('user+tag@example.com')).toBe('user+tag@example.com');
    expect(normalizeEmail('user+tag@example.com')).not.toBe(
      normalizeEmail('user@example.com'),
    );
  });

  it('空文字は空文字のまま返す（形式検証は zod 側の責務）', () => {
    expect(normalizeEmail('')).toBe('');
    expect(normalizeEmail('   ')).toBe('');
  });
});
