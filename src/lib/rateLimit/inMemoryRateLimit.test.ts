/**
 * インメモリ・レート制限のテスト
 */

import { createInMemoryRateLimiter } from './inMemoryRateLimit';

describe('createInMemoryRateLimiter', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('上限までは許可し、超過を拒否する', () => {
    const limiter = createInMemoryRateLimiter({
      maxRequests: 3,
      windowMs: 1000,
    });

    expect(limiter.check('ip1')).toBe(true);
    expect(limiter.check('ip1')).toBe(true);
    expect(limiter.check('ip1')).toBe(true);
    expect(limiter.check('ip1')).toBe(false); // 4回目は拒否
    expect(limiter.check('ip1')).toBe(false); // 以降も拒否
  });

  it('キーごとに独立してカウントする', () => {
    const limiter = createInMemoryRateLimiter({
      maxRequests: 1,
      windowMs: 1000,
    });

    expect(limiter.check('ip1')).toBe(true);
    expect(limiter.check('ip1')).toBe(false);
    // 別キーは影響を受けない
    expect(limiter.check('ip2')).toBe(true);
  });

  it('ウィンドウ経過後はカウントがリセットされる', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const limiter = createInMemoryRateLimiter({
      maxRequests: 2,
      windowMs: 1000,
    });

    expect(limiter.check('ip1')).toBe(true);
    expect(limiter.check('ip1')).toBe(true);
    expect(limiter.check('ip1')).toBe(false);

    // ウィンドウ幅ぶん進めるとリセットされ再度許可される
    jest.advanceTimersByTime(1000);
    expect(limiter.check('ip1')).toBe(true);
  });

  it('maxKeys 到達時、新規キー追加で期限切れのみ掃除し有効エントリは保持する', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const limiter = createInMemoryRateLimiter({
      maxRequests: 5,
      windowMs: 1000,
      maxKeys: 2,
    });

    expect(limiter.check('a')).toBe(true); // t=0（a は t=1000 で期限切れ）
    jest.advanceTimersByTime(600);
    expect(limiter.check('b')).toBe(true); // t=600（b は t=1600 まで有効）

    // t=1000: a は期限切れ、b はまだ有効
    jest.advanceTimersByTime(400);

    // maxKeys(2) 到達済み・新規キー c 追加時: 期限切れ(a)は掃除、有効(b)は保持
    expect(limiter.check('c')).toBe(true);
    // b はまだ有効（掃除されず）カウント継続
    expect(limiter.check('b')).toBe(true);
  });
});
