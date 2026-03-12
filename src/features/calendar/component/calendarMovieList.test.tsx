/**
 * CalendarMovieListコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CalendarMovieList } from './calendarMovieList';
import type { CalendarMovieItem } from '@/lib/api/calendar/calendar';

// --- Helpers ---

const createMockMovies = (count: number): CalendarMovieItem[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `wl-${i}`,
    tmdb_movie_id: 100 + i,
    title: `映画${String.fromCharCode(65 + i)}`,
    poster_path: i % 2 === 0 ? `/poster${i}.jpg` : null,
    release_date: `2026-03-${String(15 + i).padStart(2, '0')}`,
    added_at: `2026-01-${String(10 - i).padStart(2, '0')}T00:00:00Z`,
  }));

const selectedDate = new Date(2026, 2, 15); // 2026-03-15

// --- Tests ---

describe('CalendarMovieList', () => {
  it('映画一覧を正しく表示する', () => {
    const movies = createMockMovies(3);

    render(
      <CalendarMovieList
        movies={movies}
        selectedDate={selectedDate}
        onMovieClick={jest.fn()}
      />,
    );

    expect(screen.getByText('2026年3月15日（3件）')).toBeInTheDocument();
    expect(screen.getByText('映画A')).toBeInTheDocument();
    expect(screen.getByText('映画B')).toBeInTheDocument();
    expect(screen.getByText('映画C')).toBeInTheDocument();
  });

  it('ポスター画像とフォールバックが正しく表示される', () => {
    const movies = createMockMovies(2);

    render(
      <CalendarMovieList
        movies={movies}
        selectedDate={selectedDate}
        onMovieClick={jest.fn()}
      />,
    );

    // poster_pathがある映画はImageが表示される
    expect(screen.getByAltText('映画A')).toBeInTheDocument();
    // poster_pathがnullの映画はフォールバック
    expect(screen.getByText('No Image')).toBeInTheDocument();
  });

  it('公開日が正しく表示される', () => {
    const movies = createMockMovies(1);

    render(
      <CalendarMovieList
        movies={movies}
        selectedDate={selectedDate}
        onMovieClick={jest.fn()}
      />,
    );

    expect(screen.getByText('2026-03-15')).toBeInTheDocument();
  });

  it('映画クリックでイベントが発火する', async () => {
    const user = userEvent.setup();
    const onMovieClick = jest.fn();
    const movies = createMockMovies(2);

    render(
      <CalendarMovieList
        movies={movies}
        selectedDate={selectedDate}
        onMovieClick={onMovieClick}
      />,
    );

    await user.click(screen.getByLabelText('映画Aの詳細を表示'));
    expect(onMovieClick).toHaveBeenCalledWith(100);

    await user.click(screen.getByLabelText('映画Bの詳細を表示'));
    expect(onMovieClick).toHaveBeenCalledWith(101);
  });

  it('映画がない場合に空メッセージを表示する', () => {
    render(
      <CalendarMovieList
        movies={[]}
        selectedDate={selectedDate}
        onMovieClick={jest.fn()}
      />,
    );

    expect(screen.getByText('2026年3月15日')).toBeInTheDocument();
    expect(
      screen.getByText('この日に公開予定の映画はありません'),
    ).toBeInTheDocument();
  });
});
