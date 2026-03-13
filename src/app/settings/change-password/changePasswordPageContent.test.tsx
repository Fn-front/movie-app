const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('@/features/settings/changePasswordForm/changePasswordForm', () => ({
  ChangePasswordForm: ({ email }: { email: string }) => (
    <div data-testid='change-password-form' data-email={email} />
  ),
}));

import { render, screen } from '@testing-library/react';

import { ChangePasswordPageContent } from './changePasswordPageContent';

describe('ChangePasswordPageContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emailがある場合ChangePasswordFormが表示される', () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'test@example.com' } },
      status: 'authenticated',
    });

    render(<ChangePasswordPageContent />);

    const form = screen.getByTestId('change-password-form');
    expect(form).toBeInTheDocument();
    expect(form).toHaveAttribute('data-email', 'test@example.com');
  });

  it('emailが空の場合nullを返す', () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: '' } },
      status: 'authenticated',
    });

    const { container } = render(<ChangePasswordPageContent />);

    expect(container.firstChild).toBeNull();
  });

  it('sessionがnullの場合nullを返す', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });

    const { container } = render(<ChangePasswordPageContent />);

    expect(container.firstChild).toBeNull();
  });
});
