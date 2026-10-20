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

const currentMonth = new Date(2026, 2, 1); // 2026-03
const selectedDate = new Date(2026, 2, 15); // 2026-03-15（日）

// --- Tests ---

describe('CalendarMovieList', () => {
  describe('選択日モード', () => {
    it('見出しに曜日と件数を表示する', () => {
      render(
        <CalendarMovieList
          movies={createMockMovies(3)}
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          onMovieClick={jest.fn()}
        />,
      );

      expect(screen.getByText('3月15日(日)（3件）')).toBeInTheDocument();
    });

    it('映画一覧を正しく表示する', () => {
      render(
        <CalendarMovieList
          movies={createMockMovies(3)}
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          onMovieClick={jest.fn()}
        />,
      );

      expect(screen.getByText('映画A')).toBeInTheDocument();
      expect(screen.getByText('映画B')).toBeInTheDocument();
      expect(screen.getByText('映画C')).toBeInTheDocument();
    });

    it('見出しと重複する公開日を各行に表示しない', () => {
      render(
        <CalendarMovieList
          movies={createMockMovies(1)}
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          onMovieClick={jest.fn()}
        />,
      );

      expect(screen.queryByText('2026-03-15')).not.toBeInTheDocument();
      expect(screen.queryByText('3月15日(日)')).not.toBeInTheDocument();
    });

    it('ポスター画像とフォールバックが正しく表示される', () => {
      render(
        <CalendarMovieList
          movies={createMockMovies(2)}
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          onMovieClick={jest.fn()}
        />,
      );

      expect(screen.getByAltText('映画A')).toBeInTheDocument();
      expect(screen.getByText('No Image')).toBeInTheDocument();
    });

    it('映画クリックでイベントが発火する', async () => {
      const user = userEvent.setup();
      const onMovieClick = jest.fn();

      render(
        <CalendarMovieList
          movies={createMockMovies(2)}
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          onMovieClick={onMovieClick}
        />,
      );

      await user.click(screen.getByLabelText('映画A'));
      expect(onMovieClick).toHaveBeenCalledWith(100);

      await user.click(screen.getByLabelText('映画B'));
      expect(onMovieClick).toHaveBeenCalledWith(101);
    });

    it('映画がない場合に空メッセージを表示する', () => {
      render(
        <CalendarMovieList
          movies={[]}
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          onMovieClick={jest.fn()}
        />,
      );

      expect(screen.getByText('3月15日(日)')).toBeInTheDocument();
      expect(
        screen.getByText('この日に公開予定の映画はありません'),
      ).toBeInTheDocument();
    });
  });

  describe('月モード（日付未選択）', () => {
    it('見出しに月と件数を表示する', () => {
      render(
        <CalendarMovieList
          movies={createMockMovies(3)}
          currentMonth={currentMonth}
          onMovieClick={jest.fn()}
        />,
      );

      expect(screen.getByText('3月の公開予定（3件）')).toBeInTheDocument();
    });

    it('各行に公開日を表示する', () => {
      render(
        <CalendarMovieList
          movies={createMockMovies(2)}
          currentMonth={currentMonth}
          onMovieClick={jest.fn()}
        />,
      );

      expect(screen.getByText('3月15日(日)')).toBeInTheDocument();
      expect(screen.getByText('3月16日(月)')).toBeInTheDocument();
    });

    it('映画がない場合に月の空メッセージを表示する', () => {
      render(
        <CalendarMovieList
          movies={[]}
          currentMonth={currentMonth}
          onMovieClick={jest.fn()}
        />,
      );

      expect(
        screen.getByText('この月に公開予定の映画はありません'),
      ).toBeInTheDocument();
    });
  });

  describe('公開日までの距離', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('未来の公開日は残り日数を表示する', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 2, 12)); // 2026-03-12

      render(
        <CalendarMovieList
          movies={createMockMovies(1)}
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          onMovieClick={jest.fn()}
        />,
      );

      expect(screen.getByText('あと3日')).toBeInTheDocument();
    });

    it('当日の公開日は「本日公開」を表示する', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 2, 15));

      render(
        <CalendarMovieList
          movies={createMockMovies(1)}
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          onMovieClick={jest.fn()}
        />,
      );

      expect(screen.getByText('本日公開')).toBeInTheDocument();
    });

    it('過去の公開日は「公開済み」を表示する', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 2, 20));

      render(
        <CalendarMovieList
          movies={createMockMovies(1)}
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          onMovieClick={jest.fn()}
        />,
      );

      expect(screen.getByText('公開済み')).toBeInTheDocument();
    });
  });
});
