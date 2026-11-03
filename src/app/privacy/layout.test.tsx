/**
 * プライバシーポリシーのレイアウトのテスト
 */

import { render, screen } from '@testing-library/react';

import PrivacyLayout from './layout';

jest.mock('@/components/layout/appLayout/appLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='app-layout'>{children}</div>
  ),
}));

describe('PrivacyLayout', () => {
  it('AppLayout を適用する（ヘッダー・フッターを他ページと揃える）', () => {
    render(<PrivacyLayout>本文</PrivacyLayout>);

    expect(screen.getByTestId('app-layout')).toHaveTextContent('本文');
  });
});
