/**
 * useFormField テスト
 */

import { renderHook } from '@testing-library/react';

import { useFormField } from './useFormField';

describe('useFormField', () => {
  it('カスタムIDが指定されている場合はそれを使用する', () => {
    const { result } = renderHook(() =>
      useFormField({ id: 'custom-id', fieldType: 'input' }),
    );

    expect(result.current.fieldId).toBe('custom-id');
    expect(result.current.errorId).toBe('custom-id-error');
    expect(result.current.helperId).toBe('custom-id-helper');
  });

  it('IDが未指定の場合はfieldType付きの自動生成IDを使用する', () => {
    const { result } = renderHook(() => useFormField({ fieldType: 'input' }));

    expect(result.current.fieldId).toContain('input-');
  });

  it('エラーがある場合はhasErrorがtrueでariaDescribedByがerrorIdになる', () => {
    const { result } = renderHook(() =>
      useFormField({ id: 'test', error: 'エラーです' }),
    );

    expect(result.current.hasError).toBe(true);
    expect(result.current.ariaDescribedBy).toBe('test-error');
  });

  it('ヘルパーテキストのみの場合はariaDescribedByがhelperIdになる', () => {
    const { result } = renderHook(() =>
      useFormField({ id: 'test', helperText: 'ヘルプ' }),
    );

    expect(result.current.hasError).toBe(false);
    expect(result.current.ariaDescribedBy).toBe('test-helper');
  });

  it('エラーもヘルパーもない場合はariaDescribedByがundefinedになる', () => {
    const { result } = renderHook(() => useFormField({ id: 'test' }));

    expect(result.current.hasError).toBe(false);
    expect(result.current.ariaDescribedBy).toBeUndefined();
  });

  it('エラーとヘルパーが両方ある場合はエラーが優先される', () => {
    const { result } = renderHook(() =>
      useFormField({ id: 'test', error: 'エラー', helperText: 'ヘルプ' }),
    );

    expect(result.current.ariaDescribedBy).toBe('test-error');
  });
});
