/**
 * @jest-environment node
 */

/**
 * セッション絶対有効期限チェック テスト
 */

import { isSessionExpired } from './sessionExpiry';
import { SESSION_CONFIG } from '@/constants';

describe('isSessionExpired', () => {
  const now = Date.now();

  it('issuedAtから7日未満の場合はfalseを返す', () => {
    const sixDaysAgo = now - 6 * 24 * 60 * 60 * 1000;
    expect(isSessionExpired(sixDaysAgo, now)).toBe(false);
  });

  it('issuedAtから7日超過の場合はtrueを返す', () => {
    const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;
    expect(isSessionExpired(eightDaysAgo, now)).toBe(true);
  });

  it('issuedAtがちょうど7日の場合はfalseを返す（境界値）', () => {
    const exactlySevenDays = now - SESSION_CONFIG.ABSOLUTE_MAX_AGE_MS;
    expect(isSessionExpired(exactlySevenDays, now)).toBe(false);
  });

  it('issuedAtが7日+1msの場合はtrueを返す（境界値）', () => {
    const justOverSevenDays = now - SESSION_CONFIG.ABSOLUTE_MAX_AGE_MS - 1;
    expect(isSessionExpired(justOverSevenDays, now)).toBe(true);
  });

  it('issuedAtがundefinedの場合はfalseを返す（既存セッション互換）', () => {
    expect(isSessionExpired(undefined, now)).toBe(false);
  });
});
