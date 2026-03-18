/**
 * FormFieldMessage テスト
 */

import { render, screen } from '@testing-library/react';

import { FormFieldMessage } from './formFieldMessage';

describe('FormFieldMessage', () => {
  const defaultProps = {
    errorId: 'field-error',
    helperId: 'field-helper',
    errorClassName: 'error-class',
    helperClassName: 'helper-class',
  };

  it('エラーメッセージを表示する', () => {
    render(<FormFieldMessage {...defaultProps} error='必須項目です' />);

    const errorEl = screen.getByRole('alert');
    expect(errorEl).toHaveTextContent('必須項目です');
    expect(errorEl).toHaveAttribute('id', 'field-error');
    expect(errorEl).toHaveClass('error-class');
  });

  it('ヘルパーテキストを表示する', () => {
    render(<FormFieldMessage {...defaultProps} helperText='8文字以上' />);

    const helperEl = screen.getByText('8文字以上');
    expect(helperEl).toHaveAttribute('id', 'field-helper');
    expect(helperEl).toHaveClass('helper-class');
  });

  it('エラーとヘルパーが両方ある場合はエラーのみ表示する', () => {
    render(
      <FormFieldMessage
        {...defaultProps}
        error='必須項目です'
        helperText='8文字以上'
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('必須項目です');
    expect(screen.queryByText('8文字以上')).not.toBeInTheDocument();
  });

  it('エラーもヘルパーもない場合は何もレンダリングしない', () => {
    const { container } = render(<FormFieldMessage {...defaultProps} />);

    expect(container).toBeEmptyDOMElement();
  });
});
