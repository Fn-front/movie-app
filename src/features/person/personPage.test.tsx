/**
 * PersonPageコンポーネントのテスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PERSON_ERROR_MESSAGES, PERSON_MESSAGES } from '@/constants';
import type { PersonDetail } from '@/lib/types';

import { PersonPage } from './personPage';

// --- Mocks ---

jest.mock('@/components/ui/loading/loading', () => ({
  Loading: jest.fn(() => <div data-testid='loading' />),
}));

jest.mock('@/features/person/component/personProfile/personProfile', () => ({
  PersonProfile: jest.fn(({ person }: { person: { name: string } }) => (
    <div data-testid='person-profile'>{person.name}</div>
  )),
}));

jest.mock(
  '@/features/person/component/personFilmography/personFilmography',
  () => ({
    PersonFilmography: jest.fn(({ credits }: { credits: { id: number }[] }) => (
      <div data-testid='person-filmography'>{credits.length}</div>
    )),
  }),
);

const mockUsePerson = jest.fn();
jest.mock('@/features/person/hooks/usePerson', () => ({
  usePerson: (...args: unknown[]) => mockUsePerson(...args),
}));

// --- Helpers ---

const person: PersonDetail = {
  id: 500,
  name: 'テスト俳優',
  biography: '略歴',
  is_biography_fallback: false,
  birthday: '1980-05-01',
  deathday: null,
  place_of_birth: '東京都',
  profile_path: '/profile.jpg',
  known_for_department: 'Acting',
  adult: false,
  cast: [],
};

const mockReturn = (overrides: Record<string, unknown> = {}) => {
  mockUsePerson.mockReturnValue({
    person: undefined,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  });
};

// --- Tests ---

describe('PersonPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('人物IDでデータを取得する', () => {
    mockReturn({ isLoading: true });

    render(<PersonPage personId={500} />);

    expect(mockUsePerson).toHaveBeenCalledWith(500);
  });

  it('読み込み中はローディングを表示する', () => {
    mockReturn({ isLoading: true });

    render(<PersonPage personId={500} />);

    expect(screen.getByTestId('loading')).toBeInTheDocument();
    expect(screen.queryByTestId('person-profile')).not.toBeInTheDocument();
  });

  it('取得成功時にプロフィールと出演作品を表示する', () => {
    mockReturn({ person });

    render(<PersonPage personId={500} />);

    expect(screen.getByTestId('person-profile')).toHaveTextContent(
      'テスト俳優',
    );
    expect(screen.getByTestId('person-filmography')).toBeInTheDocument();
  });

  it('取得失敗時はエラーメッセージと再読み込みボタンを表示する', () => {
    mockReturn({ isError: true });

    render(<PersonPage personId={500} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(PERSON_ERROR_MESSAGES.FETCH_FAILED),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: PERSON_MESSAGES.RETRY }),
    ).toBeInTheDocument();
  });

  it('エラー扱いでなくてもデータが無ければエラー表示にする', () => {
    mockReturn({ person: undefined });

    render(<PersonPage personId={500} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('再読み込みボタンでrefetchを呼ぶ', async () => {
    const user = userEvent.setup();
    const refetch = jest.fn();
    mockReturn({ isError: true, refetch });

    render(<PersonPage personId={500} />);
    await user.click(
      screen.getByRole('button', { name: PERSON_MESSAGES.RETRY }),
    );

    expect(refetch).toHaveBeenCalled();
  });
});
