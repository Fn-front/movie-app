/**
 * CalendarEventChipコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';

import { CalendarEventChip } from './calendarEventChip';

describe('CalendarEventChip', () => {
  it('タイトルを表示する', () => {
    render(<CalendarEventChip title='映画A' posterPath='/a.jpg' />);

    expect(screen.getByText('映画A')).toBeInTheDocument();
  });

  it('ポスターがある場合は画像を表示する', () => {
    render(<CalendarEventChip title='映画A' posterPath='/a.jpg' />);

    const image = screen.getByRole('presentation');
    expect(image).toHaveAttribute('src', expect.stringContaining('a.jpg'));
  });

  it('ポスターがない場合は画像を表示しない', () => {
    render(<CalendarEventChip title='映画A' posterPath={null} />);

    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
    expect(screen.getByText('映画A')).toBeInTheDocument();
  });
});
