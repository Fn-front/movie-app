/**
 * 受賞作品の手動同期APIクライアント テスト
 */

import { AxiosError, AxiosHeaders } from 'axios';

import { API_ENDPOINTS } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';
import {
  extractConflict,
  extractMessage,
  fetchAwardSyncJob,
  fetchExistingAwardCount,
  fetchLatestAwardSync,
  startAwardSync,
} from './awardSync';

// axiosInstance をモックする。実体は next-auth/react を引き込むため
// jest の transform 対象外で parse できない
jest.mock('@/lib/axios/axios', () => ({
  axiosInstance: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockedAxios = axiosInstance as jest.Mocked<typeof axiosInstance>;

function axiosErrorWith(status: number, data: unknown) {
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status,
      statusText: 'Error',
      data,
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
    },
  );
}

const JOB = {
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('startAwardSync', () => {
  it('賞・年・force を送ってジョブを返す', async () => {
    mockedAxios.post.mockResolvedValue({ data: { data: { job: JOB } } });

    const job = await startAwardSync({
      awardName: 'cannes',
      year: 2024,
      force: true,
    });

    expect(job).toEqual(JOB);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      API_ENDPOINTS.ADMIN_AWARD_SYNC,
      { awardName: 'cannes', year: 2024, force: true },
    );
  });
});

describe('fetchAwardSyncJob', () => {
  it('ジョブIDを含むURLを叩く', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { data: { job: JOB, isStale: false } },
    });

    const snapshot = await fetchAwardSyncJob('job-1');

    expect(snapshot).toEqual({ job: JOB, isStale: false });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      API_ENDPOINTS.ADMIN_AWARD_SYNC_JOB('job-1'),
    );
  });
});

describe('fetchLatestAwardSync', () => {
  it('最新ジョブを取得する', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { data: { job: null, isStale: false } },
    });

    const snapshot = await fetchLatestAwardSync();

    expect(snapshot).toEqual({ job: null, isStale: false });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      API_ENDPOINTS.ADMIN_AWARD_SYNC,
    );
  });
});

describe('fetchExistingAwardCount', () => {
  it('賞と年をクエリで渡して件数を返す', async () => {
    mockedAxios.get.mockResolvedValue({ data: { data: { count: 42 } } });

    const count = await fetchExistingAwardCount({
      awardName: 'cannes',
      year: 2024,
    });

    expect(count).toBe(42);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      API_ENDPOINTS.ADMIN_AWARD_EXISTING,
      { params: { awardName: 'cannes', year: 2024 } },
    );
  });
});

describe('extractConflict', () => {
  it('409のボディから実行中ジョブと stale 判定を取り出す', () => {
    const result = extractConflict(
      axiosErrorWith(409, {
        success: false,
        data: { job: JOB, isStale: true },
      }),
    );

    expect(result).toEqual({ job: JOB, isStale: true });
  });

  it('isStale が欠けていれば false に倒す', () => {
    const result = extractConflict(
      axiosErrorWith(409, { success: false, data: { job: JOB } }),
    );

    expect(result).toEqual({ job: JOB, isStale: false });
  });

  it('409以外は null を返す', () => {
    expect(extractConflict(axiosErrorWith(500, {}))).toBeNull();
    expect(extractConflict(axiosErrorWith(429, {}))).toBeNull();
  });

  it('409でもボディに data が無ければ null を返す', () => {
    expect(extractConflict(axiosErrorWith(409, { success: false }))).toBeNull();
  });

  it('axios 以外のエラーは null を返す', () => {
    expect(extractConflict(new Error('boom'))).toBeNull();
  });
});

describe('extractMessage', () => {
  it('サーバーのメッセージを優先する', () => {
    const error = axiosErrorWith(409, {
      success: false,
      error: { code: 'CONFLICT', message: '実行中の同期があります' },
    });

    expect(extractMessage(error, 'fallback')).toBe('実行中の同期があります');
  });

  it('メッセージが空ならフォールバックを返す', () => {
    const error = axiosErrorWith(500, {
      success: false,
      error: { code: 'SERVER_ERROR', message: '' },
    });

    expect(extractMessage(error, 'fallback')).toBe('fallback');
  });

  it('axios 以外のエラーはフォールバックを返す', () => {
    expect(extractMessage(new Error('boom'), 'fallback')).toBe('fallback');
  });
});
