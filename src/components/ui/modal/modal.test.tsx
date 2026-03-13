import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Modal, ModalHeader, ModalBody, ModalFooter } from './modal';

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

  it('descriptionのみ指定してtitleなしの場合でもヘッダーが表示される', () => {
    render(
      <Modal
        {...defaultProps}
        title={undefined}
        description='説明のみ'
        showCloseButton={false}
      />,
    );
    expect(screen.getByText('説明のみ')).toBeInTheDocument();
  });

  it('title・description・showCloseButtonすべてなしの場合ヘッダーが非表示', () => {
    const { container } = render(
      <Modal
        {...defaultProps}
        title={undefined}
        description={undefined}
        showCloseButton={false}
      />,
    );
    expect(screen.getByText('モーダルの内容')).toBeInTheDocument();
    // ヘッダー要素が存在しないことを確認
    expect(
      container.querySelector('[class*="c_modal__header"]'),
    ).not.toBeInTheDocument();
  });

  it('classNameを指定した場合コンテンツに付与される', () => {
    render(<Modal {...defaultProps} className='custom-class' />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('custom-class');
  });

  it('size=smを指定した場合対応するクラスが付与される', () => {
    render(<Modal {...defaultProps} size='sm' />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('c_modal__content__sm');
  });

  it('size=lgを指定した場合対応するクラスが付与される', () => {
    render(<Modal {...defaultProps} size='lg' />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('c_modal__content__lg');
  });

  it('size=xlを指定した場合対応するクラスが付与される', () => {
    render(<Modal {...defaultProps} size='xl' />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('c_modal__content__xl');
  });

  it('closeOnOverlayClick=falseの場合オーバーレイクリックでpreventDefaultが呼ばれる', () => {
    const handleOpenChange = jest.fn();
    render(
      <Modal
        {...defaultProps}
        closeOnOverlayClick={false}
        onOpenChange={handleOpenChange}
      />,
    );
    const dialog = screen.getByRole('dialog');

    // Radix UIが使うpointerdown outsideイベントをシミュレート
    const event = new Event('pointerdown.outside', { bubbles: true });
    Object.defineProperty(event, 'detail', {
      value: { originalEvent: { pointerId: 1 } },
    });
    fireEvent.pointerDown(document.body);

    // closeOnOverlayClick=falseの場合、モーダルは閉じない
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('モーダルの内容')).toBeInTheDocument();
  });

  it('closeOnOverlayClick=trueの場合(デフォルト)モーダルが表示されている', () => {
    render(<Modal {...defaultProps} closeOnOverlayClick={true} />);
    expect(screen.getByText('モーダルの内容')).toBeInTheDocument();
  });

  it('closeOnEscape=falseの場合ESCキーでモーダルが閉じない', () => {
    const handleOpenChange = jest.fn();
    render(
      <Modal
        {...defaultProps}
        closeOnEscape={false}
        onOpenChange={handleOpenChange}
      />,
    );

    // ESCキーイベントを送出
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      code: 'Escape',
    });

    // closeOnEscape=falseの場合、モーダルは閉じない（onOpenChangeが呼ばれない）
    expect(handleOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText('モーダルの内容')).toBeInTheDocument();
  });

  it('closeOnEscape=trueの場合ESCキーでonOpenChangeが呼ばれる', () => {
    const handleOpenChange = jest.fn();
    render(
      <Modal
        {...defaultProps}
        closeOnEscape={true}
        onOpenChange={handleOpenChange}
      />,
    );

    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      code: 'Escape',
    });

    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it('showCloseButton=trueでtitleなしの場合でも閉じるボタンが表示される', () => {
    render(
      <Modal {...defaultProps} title={undefined} showCloseButton={true} />,
    );
    expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument();
  });
});

describe('ModalHeader', () => {
  it('子要素が表示される', () => {
    render(<ModalHeader>ヘッダー内容</ModalHeader>);
    expect(screen.getByText('ヘッダー内容')).toBeInTheDocument();
  });

  it('classNameを指定した場合付与される', () => {
    const { container } = render(
      <ModalHeader className='custom-header'>ヘッダー内容</ModalHeader>,
    );
    expect(container.firstChild).toHaveClass('custom-header');
  });
});

describe('ModalBody', () => {
  it('子要素が表示される', () => {
    render(<ModalBody>ボディ内容</ModalBody>);
    expect(screen.getByText('ボディ内容')).toBeInTheDocument();
  });

  it('classNameを指定した場合付与される', () => {
    const { container } = render(
      <ModalBody className='custom-body'>ボディ内容</ModalBody>,
    );
    expect(container.firstChild).toHaveClass('custom-body');
  });
});

describe('ModalFooter', () => {
  it('子要素が表示される', () => {
    render(<ModalFooter>フッター内容</ModalFooter>);
    expect(screen.getByText('フッター内容')).toBeInTheDocument();
  });

  it('classNameを指定した場合付与される', () => {
    const { container } = render(
      <ModalFooter className='custom-footer'>フッター内容</ModalFooter>,
    );
    expect(container.firstChild).toHaveClass('custom-footer');
  });
});
