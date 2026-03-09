/**
 * 表示名変更フォームコンポーネント
 */

'use client';

import { memo, useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from 'next-auth/react';

import { Input } from '@/components/ui/input/input';
import { Button } from '@/components/ui/button/button';
import {
  updateProfileSchema,
  type UpdateProfileFormData,
} from '@/schema/user';
import { updateProfile } from '@/lib/api/user/user';
import { useToast } from '@/hooks/useToast';
import { handleApiError } from '@/utils/error';
import styles from './displayNameForm.module.scss';

/**
 * 表示名変更フォーム
 */
export const DisplayNameForm = memo(function DisplayNameForm() {
  const { data: session, update: updateSession } = useSession();
  const { toast } = useToast();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProfileFormData>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      name: session?.user?.name ?? '',
    },
  });

  const onSubmit = useCallback(
    async (data: UpdateProfileFormData) => {
      setApiError(null);

      try {
        await updateProfile(data.name);
        await updateSession({ name: data.name });
        toast({
          title: '表示名を更新しました',
          variant: 'success',
        });
      } catch (error) {
        const { message } = handleApiError(error);
        const errorMessage = message ?? '表示名の更新に失敗しました';
        setApiError(errorMessage);
        toast({
          title: '更新エラー',
          description: errorMessage,
          variant: 'error',
        });
      }
    },
    [updateSession, toast],
  );

  return (
    <form
      className={styles.c_display_name_form}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      <div className={styles.c_display_name_form__field}>
        <Input
          label="表示名"
          type="text"
          autoComplete="name"
          placeholder="表示名を入力"
          fullWidth
          error={errors.name?.message}
          {...register('name')}
        />
      </div>

      {apiError && (
        <p className={styles.c_display_name_form__error} role="alert">
          {apiError}
        </p>
      )}

      <div className={styles.c_display_name_form__submit}>
        <Button
          type="submit"
          variant="primary"
          size="md"
          isLoading={isSubmitting}
          aria-label="表示名を更新"
        >
          更新
        </Button>
      </div>
    </form>
  );
});

DisplayNameForm.displayName = 'DisplayNameForm';
