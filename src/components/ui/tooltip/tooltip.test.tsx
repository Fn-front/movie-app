/**
 * Tooltipコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Tooltip } from './tooltip';

describe('Tooltip', () => {
  it('トリガーを表示する', () => {
    render(
      <Tooltip trigger={<button type='button'>ヘルプ</button>}>説明文</Tooltip>,
    );

    expect(screen.getByRole('button', { name: 'ヘルプ' })).toBeInTheDocument();
  });

  it('初期状態では中身を出さない', () => {
    render(
      <Tooltip trigger={<button type='button'>ヘルプ</button>}>説明文</Tooltip>,
    );

    expect(screen.queryByText('説明文')).toBeNull();
  });

  it('ホバーで中身を出す', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip trigger={<button type='button'>ヘルプ</button>}>説明文</Tooltip>,
    );

    await user.hover(screen.getByRole('button', { name: 'ヘルプ' }));

    expect(await screen.findByText('説明文')).toBeInTheDocument();
  });

  it('キーボードフォーカスで中身を出す', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip trigger={<button type='button'>ヘルプ</button>}>説明文</Tooltip>,
    );

    await user.tab();

    expect(await screen.findByText('説明文')).toBeInTheDocument();
  });
});
