/**
 * フォームフィールド共通フック
 * Input / Select / Textarea で共通のID生成・aria属性ロジックを提供
 */

import { useId } from 'react';

interface UseFormFieldOptions {
  id?: string;
  fieldType: string;
  error?: string;
  helperText?: string;
}

interface UseFormFieldReturn {
  fieldId: string;
  errorId: string;
  helperId: string;
  hasError: boolean;
  ariaDescribedBy: string | undefined;
}

/**
 * フォームフィールドのID生成とaria属性を共通化するフック
 */
export function useFormField({
  id,
  fieldType,
  error,
  helperText,
}: UseFormFieldOptions): UseFormFieldReturn {
  const generatedId = useId();
  const fieldId = id || `${fieldType}-${generatedId}`;
  const errorId = `${fieldId}-error`;
  const helperId = `${fieldId}-helper`;
  const hasError = Boolean(error);

  const ariaDescribedBy = error ? errorId : helperText ? helperId : undefined;

  return { fieldId, errorId, helperId, hasError, ariaDescribedBy };
}
