/**
 * PersonProfileコンポーネントのテスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { PERSON_MESSAGES } from '@/constants';
import type { PersonDetail } from '@/lib/types';

import { PersonProfile } from './personProfile';

const createPerson = (overrides: Partial<PersonDetail> = {}): PersonDetail => ({
  id: 500,
  name: 'テスト俳優',
  biography: '日本語の略歴です。',
  is_biography_fallback: false,
  birthday: '1980-05-01',
  deathday: null,
  place_of_birth: '東京都',
  profile_path: '/profile.jpg',
  known_for_department: 'Acting',
  adult: false,
  cast: [],
  ...overrides,
});

describe('PersonProfile', () => {
  it('氏名を見出しとして表示する', () => {
    render(<PersonProfile person={createPerson()} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'テスト俳優' }),
    ).toBeInTheDocument();
  });

  it('活動分野を日本語ラベルで表示する', () => {
    render(<PersonProfile person={createPerson()} />);

    expect(screen.getByText('俳優')).toBeInTheDocument();
  });

  it('未知の活動分野はTMDbの値をそのまま表示する', () => {
    render(
      <PersonProfile
        person={createPerson({ known_for_department: 'Unknown Department' })}
      />,
    );

    expect(screen.getByText('Unknown Department')).toBeInTheDocument();
  });

  it('生年月日と出生地を表示する', () => {
    render(<PersonProfile person={createPerson()} />);

    expect(
      screen.getByText(PERSON_MESSAGES.BIRTHDAY_LABEL),
    ).toBeInTheDocument();
    expect(screen.getByText('1980年05月01日')).toBeInTheDocument();
    expect(screen.getByText('東京都')).toBeInTheDocument();
  });

  it('没年月日があれば生年月日と併記する', () => {
    render(<PersonProfile person={createPerson({ deathday: '2020-11-30' })} />);

    expect(
      screen.getByText('1980年05月01日 – 2020年11月30日'),
    ).toBeInTheDocument();
  });

  it('生年月日・出生地が無ければ該当行を表示しない', () => {
    render(
      <PersonProfile
        person={createPerson({
          birthday: null,
          deathday: null,
          place_of_birth: null,
        })}
      />,
    );

    expect(
      screen.queryByText(PERSON_MESSAGES.BIRTHDAY_LABEL),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(PERSON_MESSAGES.PLACE_OF_BIRTH_LABEL),
    ).not.toBeInTheDocument();
  });

  it('プロフィール画像があれば表示する', () => {
    render(<PersonProfile person={createPerson()} />);

    expect(screen.getByRole('img', { name: 'テスト俳優' })).toBeInTheDocument();
  });

  it('プロフィール画像が無ければ氏名のイニシャルを表示する', () => {
    render(<PersonProfile person={createPerson({ profile_path: null })} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('テ')).toBeInTheDocument();
  });

  describe('略歴', () => {
    it('略歴が空ならフォールバックメッセージを表示する', () => {
      render(<PersonProfile person={createPerson({ biography: '' })} />);

      expect(
        screen.getByText(PERSON_MESSAGES.BIOGRAPHY_EMPTY),
      ).toBeInTheDocument();
    });

    it('英語原文へフォールバックしたときは注記を表示する', () => {
      render(
        <PersonProfile
          person={createPerson({
            biography: 'English biography',
            is_biography_fallback: true,
          })}
        />,
      );

      expect(
        screen.getByText(PERSON_MESSAGES.BIOGRAPHY_FALLBACK_NOTE),
      ).toBeInTheDocument();
    });

    it('日本語の略歴なら注記を表示しない', () => {
      render(<PersonProfile person={createPerson()} />);

      expect(
        screen.queryByText(PERSON_MESSAGES.BIOGRAPHY_FALLBACK_NOTE),
      ).not.toBeInTheDocument();
    });

    it('短い略歴には折りたたみボタンを出さない', () => {
      render(
        <PersonProfile person={createPerson({ biography: '短い略歴' })} />,
      );

      expect(
        screen.queryByRole('button', {
          name: PERSON_MESSAGES.BIOGRAPHY_EXPAND,
        }),
      ).not.toBeInTheDocument();
    });

    it('長い略歴は折りたたみボタンで開閉できる', async () => {
      const user = userEvent.setup();
      render(
        <PersonProfile
          person={createPerson({ biography: 'あ'.repeat(300) })}
        />,
      );

      const expandButton = screen.getByRole('button', {
        name: PERSON_MESSAGES.BIOGRAPHY_EXPAND,
      });
      expect(expandButton).toHaveAttribute('aria-expanded', 'false');

      await user.click(expandButton);

      const collapseButton = screen.getByRole('button', {
        name: PERSON_MESSAGES.BIOGRAPHY_COLLAPSE,
      });
      expect(collapseButton).toHaveAttribute('aria-expanded', 'true');

      await user.click(collapseButton);

      expect(
        screen.getByRole('button', { name: PERSON_MESSAGES.BIOGRAPHY_EXPAND }),
      ).toBeInTheDocument();
    });
  });

  it('アクセシビリティ違反がない', async () => {
    const { container } = render(<PersonProfile person={createPerson()} />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
