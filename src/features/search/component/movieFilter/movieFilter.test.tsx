/**
 * MovieFilterコンポーネントのテスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Select } from '@/components/ui/select/select';
import { MovieFilter } from './movieFilter';
import type { MovieFilterProps } from './movieFilter';

jest.mock('@/components/ui/select/select', () => ({
  Select: jest.fn((props) => (
    <div data-testid={`select-${props.label}`}>
      <button
        aria-label={props['aria-label']}
        onClick={() => props.onValueChange?.(props.options[0]?.value)}
      >
        {props.placeholder}
      </button>
    </div>
  )),
}));

const mockSelect = Select as jest.MockedFunction<typeof Select>;

// --- Helpers ---
const mockGenres = [
  { id: 28, name: 'アクション' },
  { id: 12, name: 'アドベンチャー' },
  { id: 35, name: 'コメディ' },
];

function createDefaultProps(
  overrides?: Partial<MovieFilterProps>,
): MovieFilterProps {
  return {
    currentFilters: {},
    onFilterChange: jest.fn(),
    onFilterClear: jest.fn(),
    hasActiveFilters: false,
    genres: mockGenres,
    ...overrides,
  };
}

describe('MovieFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('基本レンダリング', () => {
    it('フィルタータイトルを表示する', () => {
      render(<MovieFilter {...createDefaultProps()} />);

      expect(
        screen.getByRole('heading', { name: 'フィルター' }),
      ).toBeInTheDocument();
    });

    it('ジャンル一覧を表示する', () => {
      render(<MovieFilter {...createDefaultProps()} />);

      expect(screen.getByLabelText('アクション')).toBeInTheDocument();
      expect(screen.getByLabelText('アドベンチャー')).toBeInTheDocument();
      expect(screen.getByLabelText('コメディ')).toBeInTheDocument();
    });

    it('公開年セレクトを表示する', () => {
      render(<MovieFilter {...createDefaultProps()} />);

      expect(screen.getByLabelText('公開年を選択')).toBeInTheDocument();
    });

    it('最低評価セレクトを表示する', () => {
      render(<MovieFilter {...createDefaultProps()} />);

      expect(screen.getByLabelText('最低評価を選択')).toBeInTheDocument();
    });

    it('映画フィルターのroleが設定されている', () => {
      render(<MovieFilter {...createDefaultProps()} />);

      expect(
        screen.getByRole('search', { name: '映画フィルター' }),
      ).toBeInTheDocument();
    });
  });

  describe('ジャンル選択', () => {
    it('ジャンルチェックボックスをクリックするとonFilterChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      const onFilterChange = jest.fn();

      render(<MovieFilter {...createDefaultProps({ onFilterChange })} />);

      await user.click(screen.getByLabelText('アクション'));

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          genre: [28],
        }),
      );
    });

    it('選択済みジャンルのチェックボックスがチェック状態になる', () => {
      render(
        <MovieFilter
          {...createDefaultProps({
            currentFilters: { genre: [28] },
          })}
        />,
      );

      const checkbox = screen.getByLabelText('アクション');
      expect(checkbox).toHaveAttribute('data-state', 'checked');
    });

    it('ジャンル解除時にonFilterChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      const onFilterChange = jest.fn();

      render(
        <MovieFilter
          {...createDefaultProps({
            currentFilters: { genre: [28, 12] },
            onFilterChange,
          })}
        />,
      );

      await user.click(screen.getByLabelText('アクション'));

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          genre: [12],
        }),
      );
    });

    it('最後のジャンルを解除するとgenreがundefinedになる', async () => {
      const user = userEvent.setup();
      const onFilterChange = jest.fn();

      render(
        <MovieFilter
          {...createDefaultProps({
            currentFilters: { genre: [28] },
            onFilterChange,
          })}
        />,
      );

      await user.click(screen.getByLabelText('アクション'));

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          genre: undefined,
        }),
      );
    });
  });

  describe('クリアボタン', () => {
    it('フィルターが適用されている場合にクリアボタンを表示する', () => {
      render(
        <MovieFilter {...createDefaultProps({ hasActiveFilters: true })} />,
      );

      expect(
        screen.getByRole('button', { name: 'フィルターをクリア' }),
      ).toBeInTheDocument();
    });

    it('フィルターが未適用の場合はクリアボタンを表示しない', () => {
      render(
        <MovieFilter {...createDefaultProps({ hasActiveFilters: false })} />,
      );

      expect(
        screen.queryByRole('button', { name: 'フィルターをクリア' }),
      ).not.toBeInTheDocument();
    });

    it('クリアボタンクリックでonFilterClearが呼ばれる', async () => {
      const user = userEvent.setup();
      const onFilterClear = jest.fn();

      render(
        <MovieFilter
          {...createDefaultProps({
            hasActiveFilters: true,
            onFilterClear,
          })}
        />,
      );

      await user.click(
        screen.getByRole('button', { name: 'フィルターをクリア' }),
      );

      expect(onFilterClear).toHaveBeenCalledTimes(1);
    });
  });

  describe('年代選択', () => {
    it('年代変更時にonFilterChangeが呼ばれる', () => {
      const onFilterChange = jest.fn();
      render(<MovieFilter {...createDefaultProps({ onFilterChange })} />);

      const yearCallProps = (
        mockSelect as unknown as jest.Mock
      ).mock.calls.find(
        (call: unknown[]) => (call[0] as { label: string }).label === '公開年',
      )?.[0] as { onValueChange: (value: string) => void };
      yearCallProps.onValueChange('2024');

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ year: 2024 }),
      );
    });

    it('年代フィルターが設定済みの場合にSelectのvalueに値が渡される', () => {
      render(
        <MovieFilter
          {...createDefaultProps({
            currentFilters: { year: 2024 },
          })}
        />,
      );

      const yearCallProps = (
        mockSelect as unknown as jest.Mock
      ).mock.calls.find(
        (call: unknown[]) => (call[0] as { label: string }).label === '公開年',
      )?.[0] as { value: string | undefined };

      expect(yearCallProps.value).toBe('2024');
    });
  });

  describe('評価選択', () => {
    it('評価変更時にonFilterChangeが呼ばれる', () => {
      const onFilterChange = jest.fn();
      render(<MovieFilter {...createDefaultProps({ onFilterChange })} />);

      const ratingCallProps = (
        mockSelect as unknown as jest.Mock
      ).mock.calls.find(
        (call: unknown[]) =>
          (call[0] as { label: string }).label === '最低評価',
      )?.[0] as { onValueChange: (value: string) => void };
      ratingCallProps.onValueChange('7.5');

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ vote_average_gte: 7.5 }),
      );
    });

    it('評価フィルターが設定済みの場合にSelectのvalueに値が渡される', () => {
      render(
        <MovieFilter
          {...createDefaultProps({
            currentFilters: { vote_average_gte: 7.5 },
          })}
        />,
      );

      const ratingCallProps = (
        mockSelect as unknown as jest.Mock
      ).mock.calls.find(
        (call: unknown[]) =>
          (call[0] as { label: string }).label === '最低評価',
      )?.[0] as { value: string | undefined };

      expect(ratingCallProps.value).toBe('7.5');
    });
  });

  describe('displayName', () => {
    it('displayNameが設定されている', () => {
      expect(MovieFilter.displayName).toBe('MovieFilter');
    });
  });
});
