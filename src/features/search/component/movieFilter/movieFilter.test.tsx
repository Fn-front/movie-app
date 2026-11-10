/**
 * MovieFilterコンポーネントのテスト
 */

import { render, screen, fireEvent } from '@testing-library/react';
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

  // 年（代表公開日の年）と期間（いずれかの国のリリース）は意味が違うため
  // 混ぜない。APIも同時指定を400で弾く（#997）
  describe('公開期間', () => {
    it('開始日・終了日の入力が表示される', () => {
      render(<MovieFilter {...createDefaultProps()} />);

      expect(screen.getByLabelText('開始日')).toBeInTheDocument();
      expect(screen.getByLabelText('終了日')).toBeInTheDocument();
    });

    it('現在の値が反映される', () => {
      render(
        <MovieFilter
          {...createDefaultProps({
            currentFilters: {
              release_date_gte: '2026-04-01',
              release_date_lte: '2026-06-30',
            },
          })}
        />,
      );

      expect(screen.getByLabelText('開始日')).toHaveValue('2026-04-01');
      expect(screen.getByLabelText('終了日')).toHaveValue('2026-06-30');
    });

    it('開始日を変更するとonFilterChangeが呼ばれる', () => {
      const onFilterChange = jest.fn();
      render(<MovieFilter {...createDefaultProps({ onFilterChange })} />);

      fireEvent.change(screen.getByLabelText('開始日'), {
        target: { value: '2026-04-01' },
      });

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ release_date_gte: '2026-04-01' }),
      );
    });

    it('期間を指定すると公開年が解除される', () => {
      const onFilterChange = jest.fn();
      render(
        <MovieFilter
          {...createDefaultProps({
            onFilterChange,
            currentFilters: { year: 2026 },
          })}
        />,
      );

      fireEvent.change(screen.getByLabelText('開始日'), {
        target: { value: '2026-04-01' },
      });

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          year: undefined,
          release_date_gte: '2026-04-01',
        }),
      );
    });

    it('公開年を選ぶと期間が解除される', () => {
      const onFilterChange = jest.fn();
      render(
        <MovieFilter
          {...createDefaultProps({
            onFilterChange,
            currentFilters: {
              release_date_gte: '2026-04-01',
              release_date_lte: '2026-06-30',
            },
          })}
        />,
      );

      const yearCallProps = (
        mockSelect as unknown as jest.Mock
      ).mock.calls.find(
        (call: unknown[]) => (call[0] as { label: string }).label === '公開年',
      )?.[0] as { onValueChange: (value: string) => void };
      yearCallProps.onValueChange('2026');

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          year: 2026,
          release_date_gte: undefined,
          release_date_lte: undefined,
        }),
      );
    });

    it('開始日と終了日が相互に連動する', () => {
      render(
        <MovieFilter
          {...createDefaultProps({
            currentFilters: {
              release_date_gte: '2026-04-01',
              release_date_lte: '2026-06-30',
            },
          })}
        />,
      );

      expect(screen.getByLabelText('開始日')).toHaveAttribute(
        'max',
        '2026-06-30',
      );
      expect(screen.getByLabelText('終了日')).toHaveAttribute(
        'min',
        '2026-04-01',
      );
    });

    it('排他である旨が aria-describedby で伝わる', () => {
      render(<MovieFilter {...createDefaultProps()} />);

      const hintId = screen.getByText('公開年とは同時に指定できません。').id;

      expect(screen.getByLabelText('開始日')).toHaveAttribute(
        'aria-describedby',
        hintId,
      );
    });
  });
});
