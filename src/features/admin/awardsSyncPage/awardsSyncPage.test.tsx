import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AwardsSyncPage } from './awardsSyncPage';
import { AWARD_SYNC_MESSAGES } from '@/constants/awardSync';

const mockStart = jest.fn();
const mockSetYear = jest.fn();
const mockSetAwardName = jest.fn();
const mockDismissError = jest.fn();
let hookState: Record<string, unknown>;

jest.mock('./hooks/useAwardSync', () => ({
  useAwardSync: () => hookState,
}));

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    awardName: 'cannes',
    awardYear: 2024,
    status: 'running',
    totalUpserted: null,
    errorMessage: null,
    createdAt: '2026-10-31T00:00:00.000Z',
    startedAt: '2026-10-31T00:00:00.000Z',
    finishedAt: null,
    ...overrides,
  };
}

const baseState = {
  awardName: 'academy_awards',
  year: '',
  job: null,
  isStale: false,
  isLoading: false,
  isSubmitting: false,
  error: null,
  conflict: null,
  existingCount: null,
  setAwardName: mockSetAwardName,
  setYear: mockSetYear,
  start: mockStart,
  dismissError: mockDismissError,
};

beforeEach(() => {
  jest.clearAllMocks();
  hookState = { ...baseState };
});

describe('AwardsSyncPage', () => {
  it('賞と年の入力と実行ボタンを表示する', () => {
    render(<AwardsSyncPage />);

    expect(
      screen.getByRole('heading', { name: AWARD_SYNC_MESSAGES.PAGE_TITLE }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('賞')).toBeInTheDocument();
    expect(screen.getByLabelText('年（授賞式の年）')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '同期を開始' }),
    ).toBeInTheDocument();
  });

  it('年が未入力なら実行ボタンを押せない', () => {
    render(<AwardsSyncPage />);

    expect(screen.getByRole('button', { name: '同期を開始' })).toBeDisabled();
  });

  it('年を入力して実行すると start が呼ばれる', async () => {
    const user = userEvent.setup();
    hookState = { ...baseState, year: '2024' };
    render(<AwardsSyncPage />);

    await user.click(screen.getByRole('button', { name: '同期を開始' }));

    expect(mockStart).toHaveBeenCalled();
  });

  it('年の入力で setYear が呼ばれる', async () => {
    const user = userEvent.setup();
    render(<AwardsSyncPage />);

    await user.type(screen.getByLabelText('年（授賞式の年）'), '2');

    expect(mockSetYear).toHaveBeenCalledWith('2');
  });

  it('実行中はボタンを押せない', () => {
    hookState = { ...baseState, year: '2024', isSubmitting: true };
    render(<AwardsSyncPage />);

    expect(screen.getByRole('button', { name: '開始中...' })).toBeDisabled();
  });

  it('ジョブが1件も無いとき空状態を出す', () => {
    render(<AwardsSyncPage />);

    expect(screen.getByText('実行履歴はまだありません')).toBeInTheDocument();
  });

  it('読み込み中はスケルトンを出す', () => {
    hookState = { ...baseState, isLoading: true };
    render(<AwardsSyncPage />);

    expect(screen.getByTestId('award-sync-loading')).toBeInTheDocument();
    expect(
      screen.queryByText('実行履歴はまだありません'),
    ).not.toBeInTheDocument();
  });

  it('実行中はステータスを aria-live で通知する', () => {
    hookState = { ...baseState, job: job() };
    render(<AwardsSyncPage />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('実行中');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('成功時は件数とキャッシュバスター付きの確認リンクを出す', () => {
    hookState = {
      ...baseState,
      job: job({
        status: 'succeeded',
        totalUpserted: 12,
        finishedAt: '2026-10-31T00:05:00.000Z',
      }),
    };
    render(<AwardsSyncPage />);

    expect(screen.getByRole('status')).toHaveTextContent('12件');
    expect(
      screen.getByRole('link', { name: '受賞作品ページで確認' }),
    ).toHaveAttribute('href', '/awards?t=2026-10-31T00%3A05%3A00.000Z');
  });

  it('成功でも警告があれば出す（旧世代が消せなかったとき）', () => {
    // 「完了しました」だけだと、残留が残ったことに admin が気づけない
    hookState = {
      ...baseState,
      job: job({
        status: 'succeeded',
        totalUpserted: 12,
        warningMessage: '旧世代の削除に失敗しました: timeout',
        finishedAt: '2026-10-31T00:05:00.000Z',
      }),
    };
    render(<AwardsSyncPage />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('12件');
    expect(status).toHaveTextContent('旧世代の削除に失敗しました: timeout');
  });

  it('成功で警告が無ければ警告を出さない', () => {
    hookState = {
      ...baseState,
      job: job({
        status: 'succeeded',
        totalUpserted: 12,
        finishedAt: '2026-10-31T00:05:00.000Z',
      }),
    };
    render(<AwardsSyncPage />);

    expect(
      document.querySelector('[class*="warning"]'),
    ).not.toBeInTheDocument();
  });

  it('失敗時はエラーメッセージを出す', () => {
    hookState = {
      ...baseState,
      job: job({
        status: 'failed',
        errorMessage: AWARD_SYNC_MESSAGES.NO_ITEMS,
        finishedAt: '2026-10-31T00:05:00.000Z',
      }),
    };
    render(<AwardsSyncPage />);

    expect(screen.getByRole('status')).toHaveTextContent(
      AWARD_SYNC_MESSAGES.NO_ITEMS,
    );
  });

  it('フックの error を表示する', () => {
    hookState = { ...baseState, error: '同期の開始に失敗しました' };
    render(<AwardsSyncPage />);

    expect(screen.getByText('同期の開始に失敗しました')).toBeInTheDocument();
  });

  describe('既存件数の警告', () => {
    it('既にデータがある年は件数と上書きの旨を出す', () => {
      hookState = { ...baseState, year: '2024', existingCount: 42 };
      render(<AwardsSyncPage />);

      expect(
        screen.getByText(
          'この年は既に42件あります。実行すると置き換わります。',
        ),
      ).toBeInTheDocument();
    });

    it('0件なら警告を出さない', () => {
      hookState = { ...baseState, year: '2024', existingCount: 0 };
      render(<AwardsSyncPage />);

      expect(screen.queryByText(/既に/)).not.toBeInTheDocument();
    });

    // 未取得・範囲外・取得失敗はいずれも null。警告を出さず実行は妨げない
    it('未取得なら警告を出さない', () => {
      hookState = { ...baseState, year: '2024', existingCount: null };
      render(<AwardsSyncPage />);

      expect(screen.queryByText(/既に/)).not.toBeInTheDocument();
    });

    it('警告が出ていても実行ボタンは押せる', () => {
      hookState = { ...baseState, year: '2024', existingCount: 42 };
      render(<AwardsSyncPage />);

      expect(screen.getByRole('button', { name: '同期を開始' })).toBeEnabled();
    });
  });

  it('409かつ閾値未満なら強制失効ボタンを出さない', () => {
    hookState = {
      ...baseState,
      conflict: { job: job(), isStale: false },
    };
    render(<AwardsSyncPage />);

    expect(
      screen.getByText(AWARD_SYNC_MESSAGES.ALREADY_RUNNING),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '強制的に失敗として閉じて再実行' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(AWARD_SYNC_MESSAGES.STALE_HINT),
    ).not.toBeInTheDocument();
  });

  it('409かつ閾値超過なら強制失効ボタンと注意書きを出す', async () => {
    const user = userEvent.setup();
    hookState = {
      ...baseState,
      year: '2024',
      conflict: { job: job(), isStale: true },
    };
    render(<AwardsSyncPage />);

    expect(
      screen.getByText(AWARD_SYNC_MESSAGES.STALE_HINT),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: '強制的に失敗として閉じて再実行' }),
    );

    expect(mockStart).toHaveBeenCalledWith({ force: true });
  });
});
