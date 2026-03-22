import { render, screen, fireEvent } from '@testing-library/react';

import { AwardYearSelect } from './awardYearSelect';

// --- Mocks ---

jest.mock('@/components/ui/select/select', () => ({
  Select: ({
    value,
    onValueChange,
    options,
    'aria-label': ariaLabel,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    options: { label: string; value: string }[];
    'aria-label'?: string;
  }) => (
    <select
      data-testid='year-select'
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      aria-label={ariaLabel}
    >
      {options.map((opt: { label: string; value: string }) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

// --- Tests ---

describe('AwardYearSelect', () => {
  const defaultProps = {
    availableYears: [2026, 2025, 2024],
    selectedYear: 2026,
    onYearChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('年度の選択肢が表示される', () => {
    render(<AwardYearSelect {...defaultProps} />);

    const select = screen.getByTestId('year-select');
    expect(select).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent('2026');
    expect(options[1]).toHaveTextContent('2025');
    expect(options[2]).toHaveTextContent('2024');
  });

  it('選択中の年度がvalueに設定される', () => {
    render(<AwardYearSelect {...defaultProps} />);

    const select = screen.getByTestId('year-select');
    expect(select).toHaveValue('2026');
  });

  it('年度変更時にonYearChangeが呼ばれる', () => {
    render(<AwardYearSelect {...defaultProps} />);

    const select = screen.getByTestId('year-select');
    fireEvent.change(select, { target: { value: '2025' } });

    expect(defaultProps.onYearChange).toHaveBeenCalledWith('2025');
  });

  it('aria-labelが設定される', () => {
    render(<AwardYearSelect {...defaultProps} />);

    const select = screen.getByLabelText('年度を選択');
    expect(select).toBeInTheDocument();
  });

  it('availableYearsが空の場合も正しくレンダリングされる', () => {
    render(
      <AwardYearSelect
        {...defaultProps}
        availableYears={[]}
        selectedYear={2026}
      />,
    );

    const options = screen.queryAllByRole('option');
    expect(options).toHaveLength(0);
  });
});
