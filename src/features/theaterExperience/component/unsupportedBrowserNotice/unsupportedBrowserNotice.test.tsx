/**
 * UnsupportedBrowserNotice コンポーネント テスト
 */

import { render, screen } from '@testing-library/react';

import { UnsupportedBrowserNotice } from './unsupportedBrowserNotice';

describe('UnsupportedBrowserNotice', () => {
  it('非対応メッセージが表示される', () => {
    render(<UnsupportedBrowserNotice />);

    expect(screen.getByText('3D表示に対応していません')).toBeInTheDocument();
  });

  it('推奨ブラウザが表示される', () => {
    render(<UnsupportedBrowserNotice />);

    expect(screen.getByText('Google Chrome（推奨）')).toBeInTheDocument();
    expect(screen.getByText('Mozilla Firefox')).toBeInTheDocument();
    expect(screen.getByText('Microsoft Edge')).toBeInTheDocument();
  });

  it('role=alertが設定される', () => {
    render(<UnsupportedBrowserNotice />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('テキスト一覧への案内が表示される', () => {
    render(<UnsupportedBrowserNotice />);

    expect(
      screen.getByText(
        '座席情報は下部のテキスト一覧からもご確認いただけます。',
      ),
    ).toBeInTheDocument();
  });
});
