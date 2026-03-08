import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Modal, ModalBody, ModalFooter } from './modal';

// --- Tests ---

describe('Modal', () => {
  const defaultProps = {
    open: true,
    onOpenChange: jest.fn(),
    title: 'テストモーダル',
    children: <p>モーダルの内容</p>,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('open=trueの時にモーダルが表示される', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByText('テストモーダル')).toBeInTheDocument();
    expect(screen.getByText('モーダルの内容')).toBeInTheDocument();
  });

  it('open=falseの時にモーダルが非表示になる', () => {
    render(<Modal {...defaultProps} open={false} />);
    expect(screen.queryByText('テストモーダル')).not.toBeInTheDocument();
  });

  it('タイトルと説明が表示される', () => {
    render(<Modal {...defaultProps} description='確認してください' />);
    expect(screen.getByText('テストモーダル')).toBeInTheDocument();
    expect(screen.getByText('確認してください')).toBeInTheDocument();
  });

  it('閉じるボタンをクリックするとonOpenChangeが呼ばれる', async () => {
    const user = userEvent.setup();
    const handleOpenChange = jest.fn();

    render(<Modal {...defaultProps} onOpenChange={handleOpenChange} />);

    const closeButton = screen.getByRole('button', { name: '閉じる' });
    await user.click(closeButton);

    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it('showCloseButton=falseの時に閉じるボタンが非表示', () => {
    render(
      <Modal {...defaultProps} showCloseButton={false} title={undefined} />,
    );
    expect(
      screen.queryByRole('button', { name: '閉じる' }),
    ).not.toBeInTheDocument();
  });
});

describe('ModalBody', () => {
  it('子要素が表示される', () => {
    render(<ModalBody>ボディ内容</ModalBody>);
    expect(screen.getByText('ボディ内容')).toBeInTheDocument();
  });
});

describe('ModalFooter', () => {
  it('子要素が表示される', () => {
    render(<ModalFooter>フッター内容</ModalFooter>);
    expect(screen.getByText('フッター内容')).toBeInTheDocument();
  });
});
