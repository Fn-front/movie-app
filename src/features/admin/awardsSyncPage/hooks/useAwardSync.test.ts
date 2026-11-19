import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';

import { useAwardSync } from './useAwardSync';
import { getAwardSyncPollIntervalMs } from '@/constants/awardSync';

const mockStartAwardSync = jest.fn();
const mockFetchAwardSyncJob = jest.fn();
const mockFetchLatestAwardSync = jest.fn();
const mockFetchExistingAwardCount = jest.fn();
jest.mock('@/lib/api/awardSync/awardSync', () => {
  const actual = jest.requireActual('@/lib/api/awardSync/awardSync');
  return {
    ...actual,
    startAwardSync: (...a: unknown[]) => mockStartAwardSync(...a),
    fetchAwardSyncJob: (...a: unknown[]) => mockFetchAwardSyncJob(...a),
    fetchLatestAwardSync: (...a: unknown[]) => mockFetchLatestAwardSync(...a),
    fetchExistingAwardCount: (...a: unknown[]) =>
      mockFetchExistingAwardCount(...a),
  };
});

jest.mock('@/lib/axios/axios', () => ({
  axiosInstance: { get: jest.fn(), post: jest.fn() },
}));

const runningJob = {
  id: 'job-1',
  awardName: 'cannes',
  awardYear: 2024,
  status: 'running' as const,
  totalUpserted: null,
  errorMessage: null,
  createdAt: '2026-10-31T00:00:00.000Z',
  startedAt: '2026-10-31T00:00:00.000Z',
  finishedAt: null,
};

const succeededJob = {
  ...runningJob,
  status: 'succeeded' as const,
  totalUpserted: 12,
  finishedAt: '2026-10-31T00:05:00.000Z',
};

function conflictError(isStale: boolean) {
  return new AxiosError('conflict', 'ERR', undefined, undefined, {
    status: 409,
    statusText: 'Conflict',
    data: { success: false, data: { job: runningJob, isStale } },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  });
}

/** 初期ロードが終わるまで待つ */
async function renderReady() {
  const view = renderHook(() => useAwardSync());
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

/**
 * どの段の間隔でも必ず1回は発火する長さ
 *
 * 定数に追従させない。`AWARD_SYNC_POLL_MAX_INTERVAL_MS` を使うと、
 * 将来それが伸びたときに黙って「1周ぶん」でなくなる
 */
const ONE_POLL_MS = 60_000;

/**
 * ポーリング1周ぶん時間を進める
 *
 * 大きく進めても発火するのは1本だけ。次の1回は `await` の後の
 * マイクロタスクで積まれ、`advanceTimersByTime` の内側では実行されないため。
 */
async function advanceOnePoll() {
  await act(async () => {
    jest.advanceTimersByTime(ONE_POLL_MS);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockFetchLatestAwardSync.mockResolvedValue({ job: null, isStale: false });
  mockFetchExistingAwardCount.mockResolvedValue(0);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useAwardSync', () => {
  it('マウント時に最新ジョブを復元する', async () => {
    mockFetchLatestAwardSync.mockResolvedValue({
      job: succeededJob,
      isStale: false,
    });

    const { result } = await renderReady();

    expect(result.current.job?.id).toBe('job-1');
    expect(result.current.job?.status).toBe('succeeded');
  });

  it('復元したジョブが running ならポーリングを再開する', async () => {
    mockFetchLatestAwardSync.mockResolvedValue({
      job: runningJob,
      isStale: false,
    });
    mockFetchAwardSyncJob.mockResolvedValue({
      job: succeededJob,
      isStale: false,
    });

    const { result } = await renderReady();
    await advanceOnePoll();

    await waitFor(() => expect(result.current.job?.status).toBe('succeeded'));
  });

  it('終端状態になったらポーリングを止める', async () => {
    mockStartAwardSync.mockResolvedValue(runningJob);
    mockFetchAwardSyncJob
      .mockResolvedValueOnce({ job: runningJob, isStale: false })
      .mockResolvedValue({ job: succeededJob, isStale: false });

    const { result } = await renderReady();

    await act(async () => {
      await result.current.start();
    });

    await advanceOnePoll();
    await advanceOnePoll();
    await waitFor(() => expect(result.current.job?.status).toBe('succeeded'));

    const callsAtTerminal = mockFetchAwardSyncJob.mock.calls.length;
    await advanceOnePoll();
    await advanceOnePoll();

    expect(mockFetchAwardSyncJob.mock.calls.length).toBe(callsAtTerminal);
  });

  it('アンマウント後はポーリングしない', async () => {
    mockStartAwardSync.mockResolvedValue(runningJob);
    mockFetchAwardSyncJob.mockResolvedValue({
      job: runningJob,
      isStale: false,
    });

    const { result, unmount } = await renderReady();

    await act(async () => {
      await result.current.start();
    });

    unmount();
    const callsAtUnmount = mockFetchAwardSyncJob.mock.calls.length;

    jest.advanceTimersByTime(ONE_POLL_MS * 5);

    expect(mockFetchAwardSyncJob.mock.calls.length).toBe(callsAtUnmount);
  });

  // 応答が返ってから次を積むため、停止後に解決した fetch が
  // タイマーを積み直しうる。世代で無効化している（#1282）
  it('応答待ちの最中にアンマウントしてもポーリングが再開しない', async () => {
    mockStartAwardSync.mockResolvedValue(runningJob);

    let resolveFetch: ((value: unknown) => void) | null = null;
    mockFetchAwardSyncJob.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { result, unmount } = await renderReady();

    await act(async () => {
      await result.current.start();
    });

    // 1回目を発火させ、応答を返さないまま止める
    await act(async () => {
      jest.advanceTimersByTime(ONE_POLL_MS);
    });
    expect(mockFetchAwardSyncJob).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      resolveFetch?.({ job: runningJob, isStale: false });
    });
    await act(async () => {
      jest.advanceTimersByTime(ONE_POLL_MS * 5);
    });

    expect(mockFetchAwardSyncJob).toHaveBeenCalledTimes(1);
  });

  /**
   * リロードしても間隔が最初の段へ戻らない（#1282 のレビュー指摘）
   *
   * `startPolling` の経過は 0 から積むので、復元経路でジョブの開始時刻を
   * 渡さないと、画面を開き直すたびに5秒間隔が1分ぶん復活する
   */
  it('実行中ジョブの復元は、1回目を早く引いてから経過に応じた段で続ける', async () => {
    // 10分前から走っているジョブ（= 30秒間隔の段）
    const startedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    mockFetchLatestAwardSync.mockResolvedValue({
      job: { ...runningJob, startedAt },
      isStale: false,
    });
    mockFetchAwardSyncJob.mockResolvedValue({
      job: runningJob,
      isStale: false,
    });

    await renderReady();

    // 復元直後の1回だけは最短の間隔で引く（開き直した人を待たせない）
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(mockFetchAwardSyncJob).toHaveBeenCalledTimes(1);

    // 2回目からは経過に応じた段（10分経過 → 30秒）。5秒では来ない
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(mockFetchAwardSyncJob).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(25_000);
    });
    expect(mockFetchAwardSyncJob).toHaveBeenCalledTimes(2);
  });

  // startedAt が読めないときは安全側（間隔が短い側）に倒す
  it('開始時刻が不正なら最初の段から始める', async () => {
    mockFetchLatestAwardSync.mockResolvedValue({
      job: { ...runningJob, startedAt: 'not-a-date' },
      isStale: false,
    });
    mockFetchAwardSyncJob.mockResolvedValue({
      job: runningJob,
      isStale: false,
    });

    await renderReady();

    await act(async () => {
      jest.advanceTimersByTime(getAwardSyncPollIntervalMs(0));
    });
    expect(mockFetchAwardSyncJob).toHaveBeenCalledTimes(1);
  });

  // 開始直後は5秒、1分を過ぎたら15秒（#1282）
  it('経過に応じてポーリング間隔が伸びる', async () => {
    mockStartAwardSync.mockResolvedValue(runningJob);
    mockFetchAwardSyncJob.mockResolvedValue({
      job: runningJob,
      isStale: false,
    });

    const { result } = await renderReady();

    await act(async () => {
      await result.current.start();
    });

    // 最初の1分ぶん（12回）は5秒間隔
    for (let i = 0; i < 12; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(getAwardSyncPollIntervalMs(0));
      });
    }
    expect(mockFetchAwardSyncJob).toHaveBeenCalledTimes(12);

    // 13回目は5秒では来ない
    await act(async () => {
      jest.advanceTimersByTime(getAwardSyncPollIntervalMs(0));
    });
    expect(mockFetchAwardSyncJob).toHaveBeenCalledTimes(12);

    // 15秒まで進めれば来る
    await act(async () => {
      jest.advanceTimersByTime(getAwardSyncPollIntervalMs(60_000) - 5_000);
    });
    expect(mockFetchAwardSyncJob).toHaveBeenCalledTimes(13);
  });

  it('start を連打してもポーリングは1本に保つ', async () => {
    mockStartAwardSync.mockResolvedValue(runningJob);
    mockFetchAwardSyncJob.mockResolvedValue({
      job: runningJob,
      isStale: false,
    });

    const { result } = await renderReady();

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.start();
    });

    await advanceOnePoll();

    // interval が二重に走っていれば 2 回叩かれる
    expect(mockFetchAwardSyncJob).toHaveBeenCalledTimes(1);
  });

  it('409 を受けたら conflict に実行中ジョブを入れる', async () => {
    mockStartAwardSync.mockRejectedValue(conflictError(true));

    const { result } = await renderReady();

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.conflict?.job?.id).toBe('job-1');
    expect(result.current.conflict?.isStale).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('409以外の失敗は error に入れる', async () => {
    mockStartAwardSync.mockRejectedValue(new Error('boom'));

    const { result } = await renderReady();

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.conflict).toBeNull();
    expect(result.current.error).not.toBeNull();
  });

  it('ポーリングが連続失敗したら打ち切る', async () => {
    mockStartAwardSync.mockResolvedValue(runningJob);
    mockFetchAwardSyncJob.mockRejectedValue(new Error('network'));

    const { result } = await renderReady();

    await act(async () => {
      await result.current.start();
    });

    for (let i = 0; i < 5; i += 1) {
      await advanceOnePoll();
    }

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(mockFetchAwardSyncJob.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('start に force を渡せる', async () => {
    mockStartAwardSync.mockResolvedValue(runningJob);
    mockFetchAwardSyncJob.mockResolvedValue({
      job: runningJob,
      isStale: false,
    });

    const { result } = await renderReady();

    act(() => {
      result.current.setYear('2024');
    });

    await act(async () => {
      await result.current.start({ force: true });
    });

    expect(mockStartAwardSync).toHaveBeenCalledWith({
      awardName: 'academy_awards',
      year: 2024,
      force: true,
    });
  });

  describe('既存件数の問い合わせ', () => {
    /** デバウンスを抜けるまで進める */
    async function advanceDebounce() {
      await act(async () => {
        jest.advanceTimersByTime(600);
      });
    }

    it('年が有効になったら件数を取りに行く', async () => {
      mockFetchExistingAwardCount.mockResolvedValue(42);

      const { result } = await renderReady();

      act(() => {
        result.current.setYear('2024');
      });
      await advanceDebounce();

      await waitFor(() => expect(result.current.existingCount).toBe(42));
      expect(mockFetchExistingAwardCount).toHaveBeenCalledWith({
        awardName: 'academy_awards',
        year: 2024,
      });
    });

    // 入力途中（「20」など）で叩いても 400 が返るだけで無駄になる
    it('年が範囲外のうちは問い合わせない', async () => {
      const { result } = await renderReady();

      act(() => {
        result.current.setYear('20');
      });
      await advanceDebounce();

      expect(mockFetchExistingAwardCount).not.toHaveBeenCalled();
      expect(result.current.existingCount).toBeNull();
    });

    it('年が空のときは問い合わせない', async () => {
      await renderReady();

      await advanceDebounce();

      expect(mockFetchExistingAwardCount).not.toHaveBeenCalled();
    });

    it('デバウンス中の連続入力では1回しか叩かない', async () => {
      const { result } = await renderReady();

      act(() => {
        result.current.setYear('2');
      });
      act(() => {
        result.current.setYear('20');
      });
      act(() => {
        result.current.setYear('202');
      });
      act(() => {
        result.current.setYear('2024');
      });
      await advanceDebounce();

      expect(mockFetchExistingAwardCount).toHaveBeenCalledTimes(1);
    });

    it('賞を変えたら取り直す', async () => {
      const { result } = await renderReady();

      act(() => {
        result.current.setYear('2024');
      });
      await advanceDebounce();
      await waitFor(() =>
        expect(mockFetchExistingAwardCount).toHaveBeenCalledTimes(1),
      );

      act(() => {
        result.current.setAwardName('cannes');
      });
      await advanceDebounce();

      await waitFor(() =>
        expect(mockFetchExistingAwardCount).toHaveBeenCalledTimes(2),
      );
      expect(mockFetchExistingAwardCount).toHaveBeenLastCalledWith({
        awardName: 'cannes',
        year: 2024,
      });
    });

    // 件数は補助情報なので、取れなくても実行の邪魔をしない
    it('取得に失敗しても error にしない', async () => {
      mockFetchExistingAwardCount.mockRejectedValue(new Error('boom'));

      const { result } = await renderReady();

      act(() => {
        result.current.setYear('2024');
      });
      await advanceDebounce();

      await waitFor(() => expect(result.current.existingCount).toBeNull());
      expect(result.current.error).toBeNull();
    });

    it('同期が成功したら件数を取り直す', async () => {
      mockStartAwardSync.mockResolvedValue(runningJob);
      mockFetchAwardSyncJob.mockResolvedValue({
        job: succeededJob,
        isStale: false,
      });

      const { result } = await renderReady();

      act(() => {
        result.current.setYear('2024');
      });
      await advanceDebounce();
      await waitFor(() =>
        expect(mockFetchExistingAwardCount).toHaveBeenCalledTimes(1),
      );

      await act(async () => {
        await result.current.start();
      });
      await advanceOnePoll();
      await waitFor(() => expect(result.current.job?.status).toBe('succeeded'));

      // 入れ替わった後の件数を見せる必要がある
      await waitFor(() =>
        expect(mockFetchExistingAwardCount).toHaveBeenCalledTimes(2),
      );
    });
  });

  it('dismissError で error と conflict を消す', async () => {
    mockStartAwardSync.mockRejectedValue(conflictError(false));

    const { result } = await renderReady();

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.conflict).not.toBeNull();

    act(() => {
      result.current.dismissError();
    });

    expect(result.current.conflict).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
