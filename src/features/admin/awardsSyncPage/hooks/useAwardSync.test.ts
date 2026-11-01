import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';

import { useAwardSync } from './useAwardSync';
import { AWARD_SYNC_POLL_INTERVAL_MS } from '@/constants/awardSync';

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

/** ポーリング1周ぶん時間を進める */
async function advanceOnePoll() {
  await act(async () => {
    jest.advanceTimersByTime(AWARD_SYNC_POLL_INTERVAL_MS);
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

    jest.advanceTimersByTime(AWARD_SYNC_POLL_INTERVAL_MS * 5);

    expect(mockFetchAwardSyncJob.mock.calls.length).toBe(callsAtUnmount);
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
