/**
 * FormFieldMessageコンポーネント
 * フォームフィールド共通のエラー・ヘルパーテキスト表示
 */

import { memo } from 'react';

/**
 * FormFieldMessageコンポーネントのプロパティ
 */
export interface FormFieldMessageProps {
  /** エラーメッセージ */
  error?: string;
  /** ヘルパーテキスト */
  helperText?: string;
  /** エラーメッセージのID */
  errorId: string;
  /** ヘルパーテキストのID */
  helperId: string;
  /** エラーメッセージのクラス名 */
  errorClassName: string;
  /** ヘルパーテキストのクラス名 */
  helperClassName: string;
}

/**
 * フォームフィールド共通のエラー・ヘルパーテキスト表示コンポーネント
 */
export const FormFieldMessage = memo<FormFieldMessageProps>(
  function FormFieldMessage({
    error,
    helperText,
    errorId,
    helperId,
    errorClassName,
    helperClassName,
  }) {
    if (error) {
      return (
        <p id={errorId} className={errorClassName} role='alert'>
          {error}
        </p>
      );
    }

    if (helperText) {
      return (
        <p id={helperId} className={helperClassName}>
          {helperText}
        </p>
      );
    }

    return null;
  },
);

FormFieldMessage.displayName = 'FormFieldMessage';
