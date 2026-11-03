/**
 * プライバシーポリシーページのテスト
 */

import { render, screen } from '@testing-library/react';

import PrivacyPage, { metadata } from './page';

jest.mock('@/features/privacy/privacyPage/privacyPage', () => ({
  PrivacyPage: () => <div data-testid='privacy-content' />,
}));

describe('PrivacyPage', () => {
  it('本文を描画する', () => {
    render(<PrivacyPage />);

    expect(screen.getByTestId('privacy-content')).toBeInTheDocument();
  });

  it('メタデータを持つ', () => {
    expect(metadata.title).toBe('プライバシーポリシー | Movie App');
    expect(metadata.description).toBeTruthy();
  });
});
