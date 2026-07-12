/**
 * randomDelay ユーティリティ テスト
 */

import { randomDelay } from './randomDelay';

describe('randomDelay', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('setTimeout を用いて 200〜500ms の遅延を挿入する（最小値付近）', async () => {
    jest.useFakeTimers();
    // Math.random = 0 → delay = 200ms
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    const promise = randomDelay();
    jest.advanceTimersByTime(200);
    await promise;

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 200);
  });

  it('遅延の上限は 500ms 未満（最大値付近）', async () => {
    jest.useFakeTimers();
    // Math.random ≈ 1 → delay ≈ 500ms
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    const promise = randomDelay();
    jest.advanceTimersByTime(500);
    await promise;

    const delayArg = setTimeoutSpy.mock.calls[0][1] as number;
    expect(delayArg).toBeGreaterThanOrEqual(200);
    expect(delayArg).toBeLessThan(500);
  });
});
